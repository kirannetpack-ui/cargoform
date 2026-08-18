import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireRoles, requireSession } from "./auth.js";
import { db } from "./db.js";

export const operationsRouter = Router();
operationsRouter.use(requireSession);
const writeRoles = requireRoles("OWNER", "OPERATIONS");

operationsRouter.get("/clients", async (_req, res) => res.json(await db.clientAccount.findMany({ where: { organisationId: res.locals.session.organisationId }, orderBy: { name: "asc" } })));
operationsRouter.post("/clients", writeRoles, async (req, res) => {
  const input = z.object({ name: z.string().trim().min(2).max(160), email: z.string().email().transform((v) => v.toLowerCase()) }).parse(req.body);
  const client = await db.clientAccount.create({ data: { organisationId: res.locals.session.organisationId, ...input } });
  await db.auditEvent.create({ data: { organisationId: res.locals.session.organisationId, actorUserId: res.locals.session.userId, action: "CLIENT_CREATED", entityType: "ClientAccount", entityId: client.id } });
  res.status(201).json(client);
});
operationsRouter.patch("/clients/:id", writeRoles, async (req, res) => {
  const id = z.string().parse(req.params.id);
  const input = z.object({ name: z.string().trim().min(2).max(160).optional(), email: z.string().email().transform((v) => v.toLowerCase()).optional(), active: z.boolean().optional() }).parse(req.body);
  const result = await db.clientAccount.updateMany({ where: { id, organisationId: res.locals.session.organisationId }, data: input });
  if (!result.count) return res.status(404).json({ error: "CLIENT_NOT_FOUND" });
  res.json(await db.clientAccount.findUnique({ where: { id } }));
});

operationsRouter.get("/staff", requireRoles("OWNER", "REVIEWER", "READ_ONLY"), async (_req, res) => res.json(await db.membership.findMany({ where: { organisationId: res.locals.session.organisationId, role: { notIn: ["CLIENT", "PLATFORM_ADMIN"] } }, select: { id: true, role: true, user: { select: { id: true, email: true, displayName: true, disabledAt: true } } } })));
operationsRouter.patch("/staff/:membershipId", requireRoles("OWNER"), async (req, res) => {
  const membershipId = z.string().parse(req.params.membershipId);
  const role = z.object({ role: z.enum(["OWNER", "OPERATIONS", "REVIEWER", "FINANCE", "READ_ONLY"]) }).parse(req.body).role;
  const membership = await db.membership.findFirst({ where: { id: membershipId, organisationId: res.locals.session.organisationId } });
  if (!membership) return res.status(404).json({ error: "STAFF_NOT_FOUND" });
  if (membership.userId === res.locals.session.userId && role !== "OWNER") return res.status(409).json({ error: "OWNER_CANNOT_DEMOTE_SELF" });
  res.json(await db.membership.update({ where: { id: membership.id }, data: { role } }));
});

const goodsSchema = z.array(z.object({ lineNumber: z.number().int().positive(), description: z.string().trim().min(2), hsCode: z.string().trim().optional(), botanicalName: z.string().trim().optional(), quantity: z.number().nonnegative().optional(), unit: z.string().trim().optional(), grossWeightKg: z.number().nonnegative().optional(), netWeightKg: z.number().nonnegative().optional() })).min(1);
const boxSchema = z.array(z.object({ boxNumber: z.number().int().positive(), lengthCm: z.number().positive(), widthCm: z.number().positive(), heightCm: z.number().positive(), actualWeightKg: z.number().nonnegative(), allocations: z.record(z.number().nonnegative()) }));
const shipmentInput = z.object({ invoiceNumber: z.string().trim().min(1).max(80), documentNumber: z.string().trim().max(80).optional(), clientAccountId: z.string().optional(), shipmentData: z.record(z.unknown()), goods: goodsSchema, boxes: boxSchema });

function validatePacking(goods: z.infer<typeof goodsSchema>, boxes: z.infer<typeof boxSchema>) {
  const goodsByLine = new Map(goods.map((item) => [String(item.lineNumber), item]));
  const allocated = new Map<string, number>();
  for (const box of boxes) for (const [line, quantity] of Object.entries(box.allocations)) {
    if (!goodsByLine.has(line)) throw new Error(`BOX_ALLOCATION_UNKNOWN_GOODS_LINE_${line}`);
    allocated.set(line, (allocated.get(line) || 0) + quantity);
  }
  for (const [line, item] of goodsByLine) if (item.quantity != null && Math.abs((allocated.get(line) || 0) - item.quantity) > 0.0001) throw new Error(`BOX_ALLOCATION_QUANTITY_MISMATCH_LINE_${line}`);
  const actualKg = boxes.reduce((sum, box) => sum + box.actualWeightKg, 0);
  const volumetricKg = boxes.reduce((sum, box) => sum + box.lengthCm * box.widthCm * box.heightCm / 6000, 0);
  const cbm = boxes.reduce((sum, box) => sum + box.lengthCm * box.widthCm * box.heightCm / 1_000_000, 0);
  return { pieces: boxes.length, actualKg, volumetricKg, chargeableKg: Math.max(actualKg, volumetricKg), cbm };
}

operationsRouter.get("/shipments", async (_req, res) => res.json(await db.shipment.findMany({ where: { organisationId: res.locals.session.organisationId }, include: { goods: true, boxes: true }, orderBy: { updatedAt: "desc" }, take: 100 })));
operationsRouter.get("/shipments/:id", async (req, res) => {
  const id = z.string().parse(req.params.id);
  const shipment = await db.shipment.findFirst({ where: { id, organisationId: res.locals.session.organisationId }, include: { goods: { orderBy: { lineNumber: "asc" } }, boxes: { orderBy: { boxNumber: "asc" } } } });
  if (!shipment) return res.status(404).json({ error: "SHIPMENT_NOT_FOUND" });
  res.json(shipment);
});
operationsRouter.post("/shipments", writeRoles, async (req, res) => {
  const input = shipmentInput.parse(req.body); const metrics = validatePacking(input.goods, input.boxes);
  if (input.clientAccountId && !await db.clientAccount.findFirst({ where: { id: input.clientAccountId, organisationId: res.locals.session.organisationId } })) return res.status(403).json({ error: "CLIENT_TENANT_MISMATCH" });
  const shipment = await db.$transaction(async (tx) => {
    const created = await tx.shipment.create({ data: { organisationId: res.locals.session.organisationId, invoiceNumber: input.invoiceNumber, documentNumber: input.documentNumber, clientAccountId: input.clientAccountId, shipmentData: { ...input.shipmentData, calculated: metrics } as Prisma.InputJsonValue, goods: { create: input.goods }, boxes: { create: input.boxes.map((box) => ({ ...box, allocations: box.allocations })) } } });
    await tx.auditEvent.create({ data: { organisationId: res.locals.session.organisationId, actorUserId: res.locals.session.userId, action: "SHIPMENT_CREATED", entityType: "Shipment", entityId: created.id, metadata: { metrics } } });
    return created;
  });
  res.status(201).json({ ...shipment, metrics });
});
operationsRouter.put("/shipments/:id", writeRoles, async (req, res) => {
  const id = z.string().parse(req.params.id);
  const input = shipmentInput.parse(req.body); const metrics = validatePacking(input.goods, input.boxes);
  const existing = await db.shipment.findFirst({ where: { id, organisationId: res.locals.session.organisationId } });
  if (!existing) return res.status(404).json({ error: "SHIPMENT_NOT_FOUND" });
  if (["DEPARTED", "DELIVERED"].includes(existing.status)) return res.status(409).json({ error: "AMENDMENT_WORKFLOW_REQUIRED" });
  await db.$transaction(async (tx) => { await tx.goodsItem.deleteMany({ where: { shipmentId: existing.id } }); await tx.packingBox.deleteMany({ where: { shipmentId: existing.id } }); await tx.shipment.update({ where: { id: existing.id }, data: { invoiceNumber: input.invoiceNumber, documentNumber: input.documentNumber, clientAccountId: input.clientAccountId, shipmentData: { ...input.shipmentData, calculated: metrics } as Prisma.InputJsonValue, version: { increment: 1 }, goods: { create: input.goods }, boxes: { create: input.boxes.map((box) => ({ ...box, allocations: box.allocations })) } } }); await tx.auditEvent.create({ data: { organisationId: res.locals.session.organisationId, actorUserId: res.locals.session.userId, action: "SHIPMENT_UPDATED", entityType: "Shipment", entityId: existing.id, metadata: { priorVersion: existing.version, metrics } } }); });
  res.json(await db.shipment.findUnique({ where: { id: existing.id }, include: { goods: true, boxes: true } }));
});
