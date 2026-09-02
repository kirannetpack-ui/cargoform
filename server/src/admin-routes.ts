import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireRoles, requireSession } from "./auth.js";
import { config } from "./config.js";
import { db } from "./db.js";
import { publishNotification } from "./notification-service.js";

export const adminRouter = Router();
adminRouter.use(requireSession, requireRoles("PLATFORM_ADMIN"));

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
    await publishNotification(tx, { eventKey: `registration:${current.id}:${input.decision}:${updated.updatedAt.toISOString()}`, eventType: `REGISTRATION_${input.decision}`, organisationId: current.organisationId, actorUserId: session.userId, entityType: "MainUserApplication", entityId: current.id, recipients: [{ userId: applicant.id, email: applicant.email, displayName: applicant.displayName }], title: `Registration ${input.decision.toLowerCase().replace("_", " ")}`, detail: input.reason, actionUrl: `${config.APP_ORIGIN}/registration` });
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

adminRouter.get("/email-delivery", async (_req, res) => res.json(await db.emailOutbox.findMany({ select: { id: true, eventKey: true, status: true, attempts: true, lastError: true, sentAt: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 200 })));
adminRouter.get("/audit", async (_req, res) => res.json(await db.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 500 })));
