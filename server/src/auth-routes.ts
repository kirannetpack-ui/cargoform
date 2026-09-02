import { Router } from "express";
import { hash, verify as verifyPassword } from "@node-rs/argon2";
import { generateSecret, generateURI, verify as verifyTotp } from "otplib";
import { z } from "zod";
import { config } from "./config.js";
import { db } from "./db.js";
import { clearSessionCookie, createSession, hashOpaqueToken, newOpaqueToken, requireSession } from "./auth.js";
import { decryptJson, encryptJson } from "./crypto.js";
import { publishNotification } from "./notification-service.js";

export const authRouter = Router();
const passwordSchema = z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/);
const emailSchema = z.string().email().transform((value) => value.trim().toLowerCase());
const registrationSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().min(2).max(100),
  password: passwordSchema,
  accountType: z.enum(["INDIVIDUAL", "ORGANISATION"]),
  legalName: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(7).max(30),
  dateOfBirth: z.string().trim().max(10).optional(),
  residentialAddress: z.string().trim().max(500).optional(),
  identityType: z.string().trim().max(80).optional(),
  identityNumber: z.string().trim().max(100).optional(),
  registrationNumber: z.string().trim().max(100).optional(),
  panVat: z.string().trim().max(100).optional(),
  registeredAddress: z.string().trim().max(500).optional(),
  contactPerson: z.string().trim().max(100).optional(),
}).superRefine((value, context) => {
  const required = value.accountType === "INDIVIDUAL"
    ? [["dateOfBirth", value.dateOfBirth], ["residentialAddress", value.residentialAddress], ["identityType", value.identityType], ["identityNumber", value.identityNumber]]
    : [["registrationNumber", value.registrationNumber], ["registeredAddress", value.registeredAddress], ["contactPerson", value.contactPerson]];
  for (const [path, field] of required) if (!field) context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message: "Required" });
});

async function issueToken(userId: string, purpose: "VERIFY_EMAIL" | "RESET_PASSWORD") {
  const token = newOpaqueToken();
  await db.authToken.create({ data: { userId, purpose, tokenHash: hashOpaqueToken(token), expiresAt: new Date(Date.now() + config.AUTH_TOKEN_TTL_MINUTES * 60_000) } });
  return token;
}
async function queueEmail(organisationId: string, email: string, eventKey: string, subject: string, body: string) {
  await db.emailOutbox.create({ data: { organisationId, eventKey, fromEmail: config.GMAIL_EXPECTED_SENDER, toEmails: [email], ccEmails: [], subject, textBody: body } });
}

authRouter.post("/register", async (req, res) => {
  const input = registrationSchema.parse(req.body);
  if (input.email === config.PLATFORM_ADMIN_EMAIL.toLowerCase()) return res.status(403).json({ error: "ADMIN_REGISTRATION_NOT_AVAILABLE" });
  if (await db.user.findUnique({ where: { email: input.email } })) return res.status(202).json({ accepted: true });
  const passwordHash = await hash(input.password);
  const result = await db.$transaction(async (tx) => {
    const organisation = await tx.organisation.create({ data: { legalName: input.legalName, registrationNumber: input.registrationNumber || null, panVat: input.panVat || null } });
    const user = await tx.user.create({ data: { email: input.email, displayName: input.displayName, credential: { create: { passwordHash } }, memberships: { create: { organisationId: organisation.id, role: "OWNER" } } } });
    await tx.mainUserApplication.create({ data: { organisationId: organisation.id, accountType: input.accountType, applicantEmail: input.email, payload: { displayName: input.displayName, phone: input.phone, dateOfBirth: input.dateOfBirth, residentialAddress: input.residentialAddress, identityType: input.identityType, identityNumber: input.identityNumber, registeredAddress: input.registeredAddress, contactPerson: input.contactPerson }, status: "DRAFT" } });
    return { organisation, user };
  });
  const token = await issueToken(result.user.id, "VERIFY_EMAIL");
  await queueEmail(result.organisation.id, input.email, `auth:${result.user.id}:verify`, "Verify your CargoForm email address", `Dear ${input.displayName},\n\nPlease verify your email address to continue your CargoForm registration:\n${config.APP_ORIGIN}/verify-email?token=${encodeURIComponent(token)}\n\nThis secure link expires in ${config.AUTH_TOKEN_TTL_MINUTES} minutes. If you did not request this registration, no action is required.\n\nKind regards,\nCargoForm Account Services`);
  res.status(202).json({ accepted: true });
});

authRouter.post("/verify-email", async (req, res) => {
  const token = z.object({ token: z.string().min(30) }).parse(req.body).token;
  const record = await db.authToken.findUnique({ where: { tokenHash: hashOpaqueToken(token) }, include: { user: { include: { memberships: true } } } });
  if (!record || record.purpose !== "VERIFY_EMAIL" || record.usedAt || record.expiresAt <= new Date()) return res.status(400).json({ error: "INVALID_OR_EXPIRED_TOKEN" });
  const ownerMembership = record.user.memberships.find((membership) => membership.role === "OWNER");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
    await tx.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    if (!ownerMembership) return;
    const application = await tx.mainUserApplication.findFirst({ where: { organisationId: ownerMembership.organisationId, applicantEmail: record.user.email, status: "DRAFT" } });
    if (!application) return;
    const submittedAt = new Date();
    await tx.mainUserApplication.update({ where: { id: application.id }, data: { status: "SUBMITTED", submittedAt } });
    await tx.organisation.update({ where: { id: ownerMembership.organisationId }, data: { status: "SUBMITTED" } });
    const administrators = await tx.user.findMany({ where: { memberships: { some: { role: "PLATFORM_ADMIN" } } }, select: { id: true, email: true, displayName: true } });
    if (administrators.length) await publishNotification(tx, {
      eventKey: `registration:${application.id}:submitted`, eventType: "REGISTRATION_SUBMITTED", organisationId: ownerMembership.organisationId, actorUserId: record.userId,
      entityType: "MainUserApplication", entityId: application.id,
      recipients: administrators.map((admin) => ({ userId: admin.id, email: admin.email, displayName: admin.displayName })),
      title: "Main User Registration Submitted for Administrative Review",
      detail: `${record.user.displayName} (${record.user.email}) completed email verification and is awaiting review.`,
      actionUrl: `${config.APP_ORIGIN}/admin/registrations/${application.id}`,
    });
  });
  res.json({ verified: true, submittedForReview: Boolean(ownerMembership) });
});

authRouter.post("/resend-verification", async (req, res) => {
  const email = z.object({ email: emailSchema }).parse(req.body).email;
  const user = await db.user.findUnique({ where: { email }, include: { memberships: true } });
  if (user && !user.disabledAt && !user.emailVerifiedAt && user.memberships[0]) {
    await db.authToken.updateMany({ where: { userId: user.id, purpose: "VERIFY_EMAIL", usedAt: null }, data: { usedAt: new Date() } });
    const token = await issueToken(user.id, "VERIFY_EMAIL");
    await queueEmail(user.memberships[0].organisationId, user.email, `auth:${user.id}:verify:${Date.now()}`, "Verify your CargoForm email address", `Dear ${user.displayName},\n\nPlease verify your email address to continue your CargoForm registration:\n${config.APP_ORIGIN}/verify-email?token=${encodeURIComponent(token)}\n\nThis secure link expires in ${config.AUTH_TOKEN_TTL_MINUTES} minutes.\n\nKind regards,\nCargoForm Account Services`);
  }
  res.status(202).json({ accepted: true });
});

authRouter.post("/login", async (req, res) => {
  const input = z.object({ email: emailSchema, password: z.string().max(128), organisationId: z.string().optional(), mfaCode: z.string().regex(/^\d{6}$/).optional() }).parse(req.body);
  const user = await db.user.findUnique({ where: { email: input.email }, include: { credential: true, memberships: { include: { organisation: true } }, mfaTotp: true } });
  if (!user?.credential || user.disabledAt || !await verifyPassword(user.credential.passwordHash, input.password)) return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  if (!user.emailVerifiedAt) return res.status(403).json({ error: "EMAIL_NOT_VERIFIED" });
  const membership = user.memberships.find((m) => m.organisationId === input.organisationId) ?? (user.memberships.length === 1 ? user.memberships[0] : undefined);
  if (!membership) return res.status(409).json({ error: "ORGANISATION_SELECTION_REQUIRED", organisations: user.memberships.map((m) => m.organisationId) });
  if (membership.role !== "PLATFORM_ADMIN" && membership.organisation.status !== "APPROVED") {
    const error = membership.organisation.status === "CHANGES_REQUESTED" ? "ACCOUNT_CHANGES_REQUESTED" : membership.organisation.status === "REJECTED" ? "ACCOUNT_REJECTED" : membership.organisation.status === "SUSPENDED" ? "ACCOUNT_SUSPENDED" : "ACCOUNT_PENDING_APPROVAL";
    return res.status(403).json({ error, status: membership.organisation.status });
  }
  const privileged = membership.role === "PLATFORM_ADMIN" || membership.role === "OWNER";
  if (privileged && !user.mfaTotp?.enabledAt) return res.status(403).json({ error: "MFA_ENROLLMENT_REQUIRED" });
  if (user.mfaTotp?.enabledAt) {
    if (!input.mfaCode) return res.status(401).json({ error: "MFA_REQUIRED" });
    const result = await verifyTotp({ secret: decryptJson<{ secret: string }>(user.mfaTotp.encryptedSecret).secret, token: input.mfaCode, epochTolerance: 30 });
    if (!result.valid) return res.status(401).json({ error: "INVALID_MFA_CODE" });
  }
  const expiresAt = await createSession(req, res, user.id);
  res.json({ user: { id: user.id, email: user.email, displayName: user.displayName }, organisationId: membership.organisationId, role: membership.role, expiresAt });
});

authRouter.post("/forgot-password", async (req, res) => {
  const email = z.object({ email: emailSchema }).parse(req.body).email;
  const user = await db.user.findUnique({ where: { email }, include: { memberships: true } });
  if (user && !user.disabledAt && user.memberships[0]) {
    await db.authToken.updateMany({ where: { userId: user.id, purpose: "RESET_PASSWORD", usedAt: null }, data: { usedAt: new Date() } });
    const token = await issueToken(user.id, "RESET_PASSWORD");
    await queueEmail(user.memberships[0].organisationId, user.email, `auth:${user.id}:reset:${Date.now()}`, "Reset your CargoForm password", `Dear ${user.displayName},\n\nUse this secure link to reset your CargoForm password:\n${config.APP_ORIGIN}/reset-password?token=${encodeURIComponent(token)}\n\nThis link expires in ${config.AUTH_TOKEN_TTL_MINUTES} minutes.\n\nKind regards,\nCargoForm Account Services`);
  }
  res.status(202).json({ accepted: true });
});

authRouter.post("/reset-password", async (req, res) => {
  const input = z.object({ token: z.string().min(30), password: passwordSchema }).parse(req.body);
  const record = await db.authToken.findUnique({ where: { tokenHash: hashOpaqueToken(input.token) } });
  if (!record || record.purpose !== "RESET_PASSWORD" || record.usedAt || record.expiresAt <= new Date()) return res.status(400).json({ error: "INVALID_OR_EXPIRED_TOKEN" });
  const passwordHash = await hash(input.password);
  await db.$transaction([db.passwordCredential.upsert({ where: { userId: record.userId }, create: { userId: record.userId, passwordHash }, update: { passwordHash, changedAt: new Date() } }), db.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }), db.authSession.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } })]);
  res.json({ reset: true });
});

async function authenticateForMfa(email: string, password: string) {
  const user = await db.user.findUnique({ where: { email }, include: { credential: true, memberships: { include: { organisation: true } } } });
  if (!user?.credential || user.disabledAt || !user.emailVerifiedAt || !await verifyPassword(user.credential.passwordHash, password)) return null;
  if (!user.memberships.some((m) => m.role === "PLATFORM_ADMIN" || (m.role === "OWNER" && m.organisation.status === "APPROVED"))) return null;
  return user;
}
authRouter.post("/mfa/setup", async (req, res) => {
  const input = z.object({ email: emailSchema, password: z.string().max(128) }).parse(req.body);
  const user = await authenticateForMfa(input.email, input.password);
  if (!user) return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  const secret = generateSecret();
  await db.mfaTotp.upsert({ where: { userId: user.id }, create: { userId: user.id, encryptedSecret: encryptJson({ secret }) }, update: { encryptedSecret: encryptJson({ secret }), enabledAt: null } });
  res.json({ secret, uri: generateURI({ issuer: "CargoForm", label: user.email, secret }) });
});
authRouter.post("/mfa/confirm", async (req, res) => {
  const input = z.object({ email: emailSchema, password: z.string().max(128), code: z.string().regex(/^\d{6}$/) }).parse(req.body);
  const user = await authenticateForMfa(input.email, input.password);
  if (!user) return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  const record = await db.mfaTotp.findUnique({ where: { userId: user.id } });
  if (!record) return res.status(409).json({ error: "MFA_SETUP_REQUIRED" });
  const result = await verifyTotp({ secret: decryptJson<{ secret: string }>(record.encryptedSecret).secret, token: input.code, epochTolerance: 30 });
  if (!result.valid) return res.status(400).json({ error: "INVALID_MFA_CODE" });
  await db.mfaTotp.update({ where: { userId: record.userId }, data: { enabledAt: new Date() } });
  res.json({ enabled: true });
});
authRouter.get("/sessions", requireSession, async (_req, res) => res.json(await db.authSession.findMany({ where: { userId: res.locals.session.userId, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true }, orderBy: { lastSeenAt: "desc" } })));
authRouter.delete("/sessions/:id", requireSession, async (req, res) => { const id = z.string().parse(req.params.id); await db.authSession.updateMany({ where: { id, userId: res.locals.session.userId }, data: { revokedAt: new Date() } }); res.status(204).end(); });
authRouter.post("/logout", requireSession, async (_req, res) => { await db.authSession.update({ where: { id: res.locals.session.id }, data: { revokedAt: new Date() } }); clearSessionCookie(res); res.status(204).end(); });
authRouter.post("/change-password", requireSession, async (req, res) => {
  const input = z.object({ currentPassword: z.string().max(128), newPassword: passwordSchema }).parse(req.body);
  const credential = await db.passwordCredential.findUnique({ where: { userId: res.locals.session.userId } });
  if (!credential || !await verifyPassword(credential.passwordHash, input.currentPassword)) return res.status(401).json({ error: "CURRENT_PASSWORD_INCORRECT" });
  const passwordHash = await hash(input.newPassword);
  await db.$transaction([
    db.passwordCredential.update({ where: { userId: res.locals.session.userId }, data: { passwordHash, changedAt: new Date() } }),
    db.authSession.updateMany({ where: { userId: res.locals.session.userId, id: { not: res.locals.session.id }, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  res.json({ changed: true });
});
authRouter.get("/me", requireSession, async (_req, res) => {
  const session = res.locals.session;
  const organisation = await db.organisation.findUnique({ where: { id: session.organisationId }, select: { id: true, legalName: true, status: true } });
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { displayName: true } });
  const application = session.role === "OWNER" ? await db.mainUserApplication.findFirst({ where: { organisationId: session.organisationId }, select: { id: true, status: true, reviewedAt: true }, orderBy: { createdAt: "desc" } }) : null;
  res.json({ user: { id: session.userId, email: session.email, displayName: user?.displayName }, role: session.role, organisation, application });
});
