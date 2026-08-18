import type { NextFunction, Request, Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db.js";
import { config } from "./config.js";

export type Session = { id: string; userId: string; organisationId: string; role: string; email: string };
export const hashOpaqueToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newOpaqueToken = () => randomBytes(32).toString("base64url");

export async function createSession(req: Request, res: Response, userId: string) {
  const token = newOpaqueToken();
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_DAYS * 86_400_000);
  const digest = (value?: string) => value ? createHash("sha256").update(value).digest("hex") : undefined;
  await db.authSession.create({ data: { userId, tokenHash: hashOpaqueToken(token), expiresAt, userAgentHash: digest(req.get("user-agent")), ipHash: digest(req.ip) } });
  res.cookie(config.SESSION_COOKIE_NAME, token, { httpOnly: true, secure: config.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
  return expiresAt;
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(config.SESSION_COOKIE_NAME, { httpOnly: true, secure: config.NODE_ENV === "production", sameSite: "lax", path: "/" });
}

export async function requireSession(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[config.SESSION_COOKIE_NAME];
    if (!token) return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    const record = await db.authSession.findUnique({ where: { tokenHash: hashOpaqueToken(token) }, include: { user: { include: { memberships: true } } } });
    if (!record || record.revokedAt || record.expiresAt <= new Date() || record.user.disabledAt) { clearSessionCookie(res); return res.status(401).json({ error: "INVALID_OR_EXPIRED_SESSION" }); }
    const requestedOrg = req.get("x-organisation-id");
    const membership = record.user.memberships.find((item) => item.organisationId === requestedOrg) ?? (record.user.memberships.length === 1 ? record.user.memberships[0] : undefined);
    if (!membership) return res.status(403).json({ error: "ORGANISATION_ACCESS_DENIED" });
    res.locals.session = { id: record.id, userId: record.userId, organisationId: membership.organisationId, role: membership.role, email: record.user.email } satisfies Session;
    if (Date.now() - record.lastSeenAt.getTime() > 300_000) void db.authSession.update({ where: { id: record.id }, data: { lastSeenAt: new Date() } });
    next();
  } catch {
    res.status(401).json({ error: "INVALID_OR_EXPIRED_SESSION" });
  }
}

export function requireRoles(...roles: string[]) {
  return (_req: Request, res: Response, next: NextFunction) => roles.includes(res.locals.session?.role) ? next() : res.status(403).json({ error: "ROLE_ACCESS_DENIED" });
}
