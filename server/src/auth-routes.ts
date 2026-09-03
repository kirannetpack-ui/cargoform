import { Router } from "express";
import { hash, verify as verifyPassword } from "@node-rs/argon2";
import { z } from "zod";
import { config } from "./config.js";
import { db } from "./db.js";
import { clearSessionCookie, createSession, hashOpaqueToken, newOpaqueToken, requireSession } from "./auth.js";
import { publishNotification } from "./notification-service.js";

export const authRouter = Router();
const passwordSchema = z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/);
const emailSchema = z.string().email().transform((value) => value.trim().toLowerCase());
const normalizePhone = (value: string) => {
  const trimmed = value.trim();
  const prefix = trimmed.startsWith("+") ? "+" : "";
  return prefix + trimmed.replace(/\D/g, "");
};
const phoneSchema = z.string().trim().min(7).max(30).transform(normalizePhone).refine((value) => /^\+?\d{7,15}$/.test(value), "Enter a valid mobile number");
const registrationSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().min(2).max(100),
  password: passwordSchema,
  phone: phoneSchema,
  companyName: z.string().trim().max(160).optional().transform((value) => value || undefined),
});

async function issueToken(userId: string, purpose: "VERIFY_EMAIL" | "RESET_PASSWORD") {
  const token = newOpaqueToken();
  await db.authToken.create({ data: { userId, purpose, tokenHash: hashOpaqueToken(token), expiresAt: new Date(Date.now() + config.AUTH_TOKEN_TTL_MINUTES * 60_000) } });
  return token;
}
async function queueEmail(organisationId: string, email: string, eventKey: string, subject: string, body: string) {
  await db.emailOutbox.create({ data: { organisationId, eventKey, fromEmail: config.GMAIL_EXPECTED_SENDER, toEmails: [email], ccEmails: [], subject, textBody: body } });
}
function accountSignature(senderName: string) {
  return `Kind regards,\n${senderName}\nCargoForm Notification Service`;
}

authRouter.post("/register", async (req, res) => {
  const input = registrationSchema.parse(req.body);
  if (input.email === config.PLATFORM_ADMIN_EMAIL.toLowerCase()) return res.status(403).json({ error: "ADMIN_REGISTRATION_NOT_AVAILABLE" });
  if (await db.user.findFirst({ where: { OR: [{ email: input.email }, { phone: input.phone }] } })) return res.status(202).json({ accepted: true });
  const passwordHash = await hash(input.password);
  const accountName = input.companyName || input.displayName;
  const accountType = input.companyName ? "ORGANISATION" : "INDIVIDUAL";
  const result = await db.$transaction(async (tx) => {
    const organisation = await tx.organisation.create({ data: { legalName: accountName } });
    const user = await tx.user.create({ data: { email: input.email, phone: input.phone, displayName: input.displayName, credential: { create: { passwordHash } }, memberships: { create: { organisationId: organisation.id, role: "OWNER" } } } });
    await tx.mainUserApplication.create({ data: { organisationId: organisation.id, accountType, applicantEmail: input.email, payload: { displayName: input.displayName, phone: input.phone, companyName: input.companyName || null }, status: "DRAFT" } });
    return { organisation, user };
  });
  const token = await issueToken(result.user.id, "VERIFY_EMAIL");
  await queueEmail(result.organisation.id, input.email, `auth:${result.user.id}:verify`, "Action required: verify your CargoForm registration", `Dear ${input.displayName},\n\nThank you for registering ${accountName} with CargoForm. Your application has been saved, but it will not be submitted to the Platform Administrator until you verify this email address:\n${config.APP_ORIGIN}/verify-email?token=${encodeURIComponent(token)}\n\nThis secure link expires in ${config.AUTH_TOKEN_TTL_MINUTES} minutes. If you did not request this registration, no action is required.\n\n${accountSignature(accountName)}`);
  res.status(202).json({ accepted: true, status: "EMAIL_VERIFICATION_PENDING" });
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
    await publishNotification(tx, {
      eventKey: `registration:${application.id}:submitted`, eventType: "REGISTRATION_SUBMITTED", organisationId: ownerMembership.organisationId, actorUserId: record.userId,
      entityType: "MainUserApplication", entityId: application.id,
      recipients: [
        { userId: record.user.id, email: record.user.email, displayName: record.user.displayName },
        ...administrators.map((admin) => ({ userId: admin.id, email: admin.email, displayName: admin.displayName })),
      ],
      title: "Main User Registration Ready for Administrative Review",
      detail: `${record.user.displayName} (${record.user.email}) completed email verification. The application is now awaiting a Platform Administrator decision.`,
      actionUrl: `${config.APP_ORIGIN}/admin/registrations/${application.id}`,
    });
  });
  res.json({ verified: true, submittedForReview: Boolean(ownerMembership) });
});

authRouter.post("/resend-verification", async (req, res) => {
  const email = z.object({ email: emailSchema }).parse(req.body).email;
  const user = await db.user.findUnique({ where: { email }, include: { memberships: { include: { organisation: { select: { legalName: true } } } } } });
  if (user && !user.disabledAt && !user.emailVerifiedAt && user.memberships[0]) {
    await db.authToken.updateMany({ where: { userId: user.id, purpose: "VERIFY_EMAIL", usedAt: null }, data: { usedAt: new Date() } });
    const token = await issueToken(user.id, "VERIFY_EMAIL");
    const senderName = user.memberships[0].organisation.legalName;
    await queueEmail(user.memberships[0].organisationId, user.email, `auth:${user.id}:verify:${Date.now()}`, "Action required: verify your CargoForm registration", `Dear ${user.displayName},\n\nYour CargoForm registration is still waiting for email verification. Open this secure link to submit it for Platform Administrator review:\n${config.APP_ORIGIN}/verify-email?token=${encodeURIComponent(token)}\n\nThis link expires in ${config.AUTH_TOKEN_TTL_MINUTES} minutes.\n\n${accountSignature(senderName)}`);
  }
  res.status(202).json({ accepted: true });
});

authRouter.post("/login", async (req, res) => {
  const input = z.object({ identifier: z.string().trim().min(3).max(254).optional(), email: z.string().trim().max(254).optional(), password: z.string().max(128), organisationId: z.string().optional() }).parse(req.body);
  const identifier = (input.identifier || input.email || "").trim();
  const user = identifier.includes("@")
    ? await db.user.findUnique({ where: { email: identifier.toLowerCase() }, include: { credential: true, memberships: { include: { organisation: true } } } })
    : await db.user.findUnique({ where: { phone: normalizePhone(identifier) }, include: { credential: true, memberships: { include: { organisation: true } } } });
  if (!user?.credential || user.disabledAt || !await verifyPassword(user.credential.passwordHash, input.password)) return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  if (!user.emailVerifiedAt) return res.status(403).json({ error: "EMAIL_NOT_VERIFIED" });
  const membership = user.memberships.find((m) => m.organisationId === input.organisationId) ?? (user.memberships.length === 1 ? user.memberships[0] : undefined);
  if (!membership) return res.status(409).json({ error: "ORGANISATION_SELECTION_REQUIRED", organisations: user.memberships.map((m) => m.organisationId) });
  if (membership.role !== "PLATFORM_ADMIN" && membership.organisation.status !== "APPROVED") {
    const error = membership.organisation.status === "CHANGES_REQUESTED" ? "ACCOUNT_CHANGES_REQUESTED" : membership.organisation.status === "REJECTED" ? "ACCOUNT_REJECTED" : membership.organisation.status === "SUSPENDED" ? "ACCOUNT_SUSPENDED" : "ACCOUNT_PENDING_APPROVAL";
    return res.status(403).json({ error, status: membership.organisation.status });
  }
  const expiresAt = await createSession(req, res, user.id);
  res.json({ user: { id: user.id, email: user.email, displayName: user.displayName }, organisationId: membership.organisationId, role: membership.role, expiresAt });
});

authRouter.post("/forgot-password", async (req, res) => {
  const email = z.object({ email: emailSchema }).parse(req.body).email;
  const user = await db.user.findUnique({ where: { email }, include: { memberships: { include: { organisation: { select: { legalName: true } } } } } });
  if (user && !user.disabledAt && user.memberships[0]) {
    await db.authToken.updateMany({ where: { userId: user.id, purpose: "RESET_PASSWORD", usedAt: null }, data: { usedAt: new Date() } });
    const token = await issueToken(user.id, "RESET_PASSWORD");
    const senderName = user.memberships[0].organisation.legalName;
    await queueEmail(user.memberships[0].organisationId, user.email, `auth:${user.id}:reset:${Date.now()}`, "Action requested: reset your CargoForm password", `Dear ${user.displayName},\n\nA password reset was requested for your CargoForm account. Use this secure link to choose a new password:\n${config.APP_ORIGIN}/reset-password?token=${encodeURIComponent(token)}\n\nThis link expires in ${config.AUTH_TOKEN_TTL_MINUTES} minutes. If you did not request it, you may safely ignore this message.\n\n${accountSignature(senderName)}`);
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
