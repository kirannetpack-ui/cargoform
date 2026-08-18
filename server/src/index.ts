import express from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import cookieParser from "cookie-parser";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { config } from "./config.js";
import { db } from "./db.js";
import { requireRoles, requireSession } from "./auth.js";
import { authRouter } from "./auth-routes.js";
import { adminRouter } from "./admin-routes.js";
import { operationsRouter } from "./operations-routes.js";
import { completeGmailAuthorization, gmailAuthorizationUrl } from "./gmail.js";
import { publishNotification } from "./notification-service.js";
import { createDownloadUrl, createUploadUrl } from "./storage.js";
import { httpDuration, httpRequests, logger, metrics } from "./observability.js";

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(pinoHttp({ logger }));
app.use(cors({ origin: config.APP_ORIGIN, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api", operationsRouter);
app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on("finish", () => { const labels = { method: req.method, route: req.route?.path || req.path, status: String(res.statusCode) }; end(labels); httpRequests.inc(labels); });
  next();
});

app.get("/health/live", (_req, res) => res.json({ status: "ok" }));
app.get("/health/ready", async (_req, res) => {
  try { await db.$queryRaw`SELECT 1`; res.json({ status: "ready" }); }
  catch { res.status(503).json({ status: "not_ready" }); }
});
app.get("/metrics", async (req, res) => {
  if (req.headers.authorization !== `Bearer ${config.METRICS_TOKEN}`) return res.status(401).end();
  res.type(metrics.contentType).send(await metrics.metrics());
});

app.post("/api/files/upload-url", requireSession, async (req, res) => {
  const session = res.locals.session;
  const input = z.object({ entityType: z.enum(["MainUserApplication", "Shipment", "Document"]), entityId: z.string().min(1), originalName: z.string().min(1).max(200), contentType: z.enum(["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]) }).parse(req.body);
  res.json(await createUploadUrl(session.organisationId, input.entityType, input.entityId, input.originalName, input.contentType));
});

app.post("/api/files/complete", requireSession, async (req, res) => {
  const session = res.locals.session;
  const input = z.object({ objectKey: z.string().min(1), originalName: z.string().min(1), contentType: z.string().min(1), sizeBytes: z.coerce.bigint().positive().max(25_000_000n), sha256: z.string().regex(/^[a-f0-9]{64}$/), classification: z.enum(["IDENTITY", "COMPANY", "SHIPMENT", "ISSUED_DOCUMENT"]), entityType: z.string().min(1), entityId: z.string().min(1) }).parse(req.body);
  if (!input.objectKey.startsWith(`${session.organisationId}/`)) return res.status(403).json({ error: "OBJECT_TENANT_MISMATCH" });
  const file = await db.fileObject.create({ data: { organisationId: session.organisationId, uploadedByUserId: session.userId, ...input } });
  res.status(201).json({ id: file.id, malwareStatus: file.malwareStatus });
});

app.get("/api/files/:id/download-url", requireSession, async (req, res) => {
  const session = res.locals.session;
  const fileId = z.string().min(1).parse(req.params.id);
  const file = await db.fileObject.findFirst({ where: { id: fileId, organisationId: session.organisationId, deletedAt: null } });
  if (!file) return res.status(404).json({ error: "FILE_NOT_FOUND" });
  if (file.malwareStatus !== "CLEAN") return res.status(409).json({ error: "FILE_NOT_CLEARED" });
  res.json({ downloadUrl: await createDownloadUrl(file.objectKey), expiresIn: config.SIGNED_URL_TTL_SECONDS });
});

app.get("/api/integrations/gmail/start", requireSession, requireRoles("PLATFORM_ADMIN"), async (_req, res) => {
  const session = res.locals.session;
  res.json({ authorizationUrl: await gmailAuthorizationUrl(session.organisationId, session.userId) });
});

app.get("/api/integrations/gmail/callback", async (req, res) => {
  const input = z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(req.query);
  try {
    const account = await completeGmailAuthorization(input.code, input.state);
    res.redirect(`${config.APP_ORIGIN}/?gmail=connected&account=${encodeURIComponent(account)}`);
  } catch {
    res.redirect(`${config.APP_ORIGIN}/?gmail=failed`);
  }
});

app.post("/api/main-user-applications", requireSession, async (req, res) => {
  const session = res.locals.session;
  const input = z.object({ accountType: z.enum(["INDIVIDUAL", "ORGANISATION"]), applicantEmail: z.string().email(), payload: z.record(z.unknown()) }).parse(req.body);
  const result = await db.$transaction(async (tx) => {
    const application = await tx.mainUserApplication.create({ data: { organisationId: session.organisationId, accountType: input.accountType, applicantEmail: input.applicantEmail, payload: input.payload as Prisma.InputJsonValue, status: "SUBMITTED", submittedAt: new Date() } });
    const adminUsers = await tx.user.findMany({ where: { memberships: { some: { role: "PLATFORM_ADMIN" } } }, select: { id: true, email: true, displayName: true } });
    if (!adminUsers.length) throw new Error("PLATFORM_ADMIN_NOT_CONFIGURED");
    await publishNotification(tx, {
      eventKey: `registration:${application.id}:submitted`, eventType: "REGISTRATION_SUBMITTED", organisationId: session.organisationId, actorUserId: session.userId,
      entityType: "MainUserApplication", entityId: application.id,
      recipients: adminUsers.map((user) => ({ userId: user.id, email: user.email, displayName: user.displayName })),
      title: "Main User Registration Submitted for Administrative Review",
      detail: `A ${input.accountType.toLowerCase()} Main User registration from ${input.applicantEmail} is awaiting review.`,
      actionUrl: `${config.APP_ORIGIN}/admin/registrations/${application.id}`,
    });
    return application;
  });
  res.status(201).json(result);
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(400).json({ error: "REQUEST_FAILED" });
});

const server = app.listen(config.PORT, () => console.log(`CargoForm API listening on ${config.PORT}`));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close(() => db.$disconnect().finally(() => process.exit(0))));
