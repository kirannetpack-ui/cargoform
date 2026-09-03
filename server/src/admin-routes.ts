import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireRoles, requireSession } from "./auth.js";
import { config } from "./config.js";
import { db } from "./db.js";
import { publishNotification } from "./notification-service.js";

export const adminRouter = Router();
adminRouter.use(requireSession, requireRoles("PLATFORM_ADMIN"));
const normalizePhone = (value: string) => {
  const trimmed = value.trim();
  return (trimmed.startsWith("+") ? "+" : "") + trimmed.replace(/\D/g, "");
};

adminRouter.get("/users", async (_req, res) => {
  const records = await db.user.findMany({
    where: { NOT: { memberships: { some: { role: "PLATFORM_ADMIN" } } } },
    select: {
      id: true, email: true, phone: true, displayName: true, emailVerifiedAt: true, disabledAt: true, createdAt: true,
      memberships: {
        select: { role: true, organisation: { select: { id: true, legalName: true, status: true, applications: { select: { id: true, status: true }, orderBy: { createdAt: "desc" }, take: 1 } } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const users = records.map((user) => {
    const membership = user.memberships[0];
    return {
      id: user.id, email: user.email, phone: user.phone, displayName: user.displayName,
      emailVerified: Boolean(user.emailVerifiedAt), disabled: Boolean(user.disabledAt), createdAt: user.createdAt,
      role: membership?.role || "UNASSIGNED", organisationId: membership?.organisation.id || null,
      companyName: membership?.organisation.legalName || "", organisationStatus: membership?.organisation.status || "DRAFT",
      applicationId: membership?.organisation.applications[0]?.id || null, applicationStatus: membership?.organisation.applications[0]?.status || null,
    };
  });
  res.json({
    users,
    counts: {
      total: users.length,
      active: users.filter((user) => !user.disabled).length,
      disabled: users.filter((user) => user.disabled).length,
      pending: users.filter((user) => ["DRAFT", "SUBMITTED", "CHANGES_REQUESTED"].includes(user.organisationStatus)).length,
    },
  });
});

adminRouter.patch("/users/:id", async (req, res) => {
  const session = res.locals.session;
  const input = z.object({
    displayName: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    phone: z.string().trim().min(7).max(30).transform(normalizePhone).refine((value) => /^\+?\d{7,15}$/.test(value), "Enter a valid mobile number"),
    companyName: z.string().trim().min(2).max(160),
    disabled: z.boolean(),
  }).parse(req.body);
  const target = await db.user.findUnique({ where: { id: req.params.id }, include: { memberships: { include: { organisation: { include: { applications: { orderBy: { createdAt: "desc" }, take: 1 } } } } } } });
  if (!target) return res.status(404).json({ error: "USER_NOT_FOUND" });
  if (target.memberships.some((membership) => membership.role === "PLATFORM_ADMIN")) return res.status(403).json({ error: "PLATFORM_ADMIN_PROTECTED" });
  const conflict = await db.user.findFirst({ where: { id: { not: target.id }, OR: [{ email: input.email }, { phone: input.phone }] }, select: { id: true } });
  if (conflict) return res.status(409).json({ error: "EMAIL_OR_PHONE_ALREADY_IN_USE" });
  const membership = target.memberships[0];
  if (!membership) return res.status(409).json({ error: "USER_ORGANISATION_NOT_FOUND" });
  const application = membership.organisation.applications[0];
  const payload = application?.payload && typeof application.payload === "object" && !Array.isArray(application.payload) ? application.payload as Record<string, unknown> : {};
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data: { displayName: input.displayName, email: input.email, phone: input.phone, disabledAt: input.disabled ? (target.disabledAt || new Date()) : null } });
    await tx.organisation.update({ where: { id: membership.organisationId }, data: { legalName: input.companyName } });
    if (application) await tx.mainUserApplication.update({ where: { id: application.id }, data: { applicantEmail: input.email, payload: { ...payload, displayName: input.displayName, phone: input.phone, companyName: input.companyName } as Prisma.InputJsonValue } });
    if (input.disabled) await tx.authSession.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.auditEvent.create({ data: { organisationId: membership.organisationId, actorUserId: session.userId, action: "ADMIN_USER_UPDATED", entityType: "User", entityId: target.id, metadata: { disabled: input.disabled, emailChanged: target.email !== input.email } as Prisma.InputJsonValue } });
  });
  res.json({ updated: true });
});

adminRouter.delete("/users/:id", async (req, res) => {
  const session = res.locals.session;
  const target = await db.user.findUnique({ where: { id: req.params.id }, include: { memberships: true } });
  if (!target) return res.status(404).json({ error: "USER_NOT_FOUND" });
  if (target.memberships.some((membership) => membership.role === "PLATFORM_ADMIN")) return res.status(403).json({ error: "PLATFORM_ADMIN_PROTECTED" });
  const membership = target.memberships[0];
  if (!membership) return res.status(409).json({ error: "USER_ORGANISATION_NOT_FOUND" });
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data: { disabledAt: target.disabledAt || new Date() } });
    await tx.authSession.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.auditEvent.create({ data: { organisationId: membership.organisationId, actorUserId: session.userId, action: "ADMIN_USER_ACCESS_DELETED", entityType: "User", entityId: target.id, metadata: { retainedForAudit: true } as Prisma.InputJsonValue } });
  });
  res.status(204).end();
});

adminRouter.get("/applications", async (req, res) => {
  const status = z.enum(["DRAFT", "SUBMITTED", "APPROVED", "CHANGES_REQUESTED", "REJECTED", "SUSPENDED"]).optional().parse(req.query.status);
  const applications = await db.mainUserApplication.findMany({
    where: status ? { status } : undefined,
    select: { id: true, organisationId: true, accountType: true, applicantEmail: true, payload: true, status: true, submittedAt: true, reviewedAt: true, createdAt: true, organisation: { select: { legalName: true, panVat: true, registrationNumber: true } } },
    orderBy: { createdAt: "desc" }, take: 100,
  });
  res.json(applications);
});

adminRouter.get("/applications/:id", async (req, res) => {
  const application = await db.mainUserApplication.findUnique({ where: { id: req.params.id }, include: { organisation: { select: { legalName: true, panVat: true, registrationNumber: true, status: true } } } });
  if (!application) return res.status(404).json({ error: "APPLICATION_NOT_FOUND" });
  res.json(application); // Application documents require an explicit, audited support/compliance access route.
});

adminRouter.post("/applications/:id/decision", async (req, res) => {
  const session = res.locals.session;
  const input = z.object({ decision: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]), reason: z.string().trim().min(5).max(2000) }).parse(req.body);
  const current = await db.mainUserApplication.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: "APPLICATION_NOT_FOUND" });
  if (!(["SUBMITTED", "CHANGES_REQUESTED"] as string[]).includes(current.status)) return res.status(409).json({ error: "APPLICATION_NOT_REVIEWABLE" });
  const applicant = await db.user.findFirst({ where: { email: current.applicantEmail, memberships: { some: { organisationId: current.organisationId, role: "OWNER" } } } });
  if (!applicant) return res.status(409).json({ error: "APPLICATION_OWNER_NOT_FOUND" });
  const application = await db.$transaction(async (tx) => {
    const updated = await tx.mainUserApplication.update({ where: { id: current.id }, data: { status: input.decision, reviewedAt: new Date(), reviewerUserId: session.userId } });
    await tx.organisation.update({ where: { id: current.organisationId }, data: { status: input.decision } });
    const copy = input.decision === "APPROVED"
      ? { title: "Your CargoForm Main User Registration Is Approved", detail: `Your account can now sign in using your email address or mobile number and password. Administrator note: ${input.reason}` }
      : input.decision === "CHANGES_REQUESTED"
        ? { title: "Changes Required for Your CargoForm Registration", detail: `The Platform Administrator needs additional or corrected information before approval. Administrator note: ${input.reason}` }
        : { title: "CargoForm Main User Registration Decision", detail: `The registration was not approved. Administrator note: ${input.reason}` };
    await publishNotification(tx, { eventKey: `registration:${current.id}:${input.decision}:${updated.updatedAt.toISOString()}`, eventType: `REGISTRATION_${input.decision}`, organisationId: current.organisationId, actorUserId: session.userId, entityType: "MainUserApplication", entityId: current.id, recipients: [{ userId: applicant.id, email: applicant.email, displayName: applicant.displayName }], title: copy.title, detail: copy.detail, actionUrl: config.APP_ORIGIN });
    await tx.auditEvent.create({ data: { organisationId: current.organisationId, actorUserId: session.userId, action: `APPLICATION_${input.decision}`, entityType: "MainUserApplication", entityId: current.id, metadata: { reason: input.reason, previousStatus: current.status } } });
    return updated;
  });
  res.json(application);
});

adminRouter.post("/organisations/:id/status", async (req, res) => {
  const session = res.locals.session;
  const input = z.object({ status: z.enum(["APPROVED", "SUSPENDED"]), reason: z.string().trim().min(5).max(2000) }).parse(req.body);
  const organisation = await db.organisation.update({ where: { id: req.params.id }, data: { status: input.status } });
  await db.auditEvent.create({ data: { organisationId: organisation.id, actorUserId: session.userId, action: `ORGANISATION_${input.status}`, entityType: "Organisation", entityId: organisation.id, metadata: { reason: input.reason } as Prisma.InputJsonValue } });
  res.json({ id: organisation.id, status: organisation.status });
});

adminRouter.get("/email-delivery", async (_req, res) => res.json(await db.emailOutbox.findMany({ select: { id: true, eventKey: true, status: true, attempts: true, lastError: true, sentAt: true, createdAt: true, toEmails: true }, orderBy: { createdAt: "desc" }, take: 200 })));
adminRouter.get("/email-status", async (_req, res) => {
  const [credential, queued, failed] = await Promise.all([
    db.oAuthCredential.findFirst({ where: { provider: "gmail", accountEmail: config.GMAIL_EXPECTED_SENDER }, select: { accountEmail: true, expiresAt: true, updatedAt: true } }),
    db.emailOutbox.count({ where: { status: "QUEUED" } }),
    db.emailOutbox.count({ where: { status: "FAILED" } }),
  ]);
  res.json({ connected: Boolean(credential), sender: config.GMAIL_EXPECTED_SENDER, connectedAt: credential?.updatedAt ?? null, tokenExpiresAt: credential?.expiresAt ?? null, queued, failed });
});
adminRouter.post("/email-delivery/retry-failed", async (_req, res) => {
  const result = await db.emailOutbox.updateMany({
    where: { status: "FAILED" },
    data: { status: "QUEUED", attempts: 0, nextAttemptAt: new Date(), lastError: null },
  });
  res.json({ queued: result.count });
});
adminRouter.get("/audit", async (_req, res) => res.json(await db.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 500 })));
