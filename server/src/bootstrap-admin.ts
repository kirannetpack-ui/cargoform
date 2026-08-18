import { hash } from "@node-rs/argon2";
import { db } from "./db.js";
import { config } from "./config.js";

const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
if (email !== config.PLATFORM_ADMIN_EMAIL.toLowerCase() || email !== "app.netpack@gmail.com") throw new Error("Bootstrap email must exactly match app.netpack@gmail.com and PLATFORM_ADMIN_EMAIL");
if (password.length < 14) throw new Error("BOOTSTRAP_ADMIN_PASSWORD must contain at least 14 characters");
if (await db.membership.findFirst({ where: { role: "PLATFORM_ADMIN" } })) throw new Error("A Platform Admin already exists; bootstrap is permanently closed");
const passwordHash = await hash(password);
await db.$transaction(async (tx) => {
  const organisation = await tx.organisation.create({ data: { legalName: "CargoForm Platform Administration", status: "APPROVED" } });
  await tx.user.create({ data: { email, displayName: "CargoForm Administrator", emailVerifiedAt: new Date(), credential: { create: { passwordHash } }, memberships: { create: { organisationId: organisation.id, role: "PLATFORM_ADMIN" } } } });
});
console.log("One-time Platform Admin bootstrap completed. MFA enrollment is required before login.");
await db.$disconnect();
