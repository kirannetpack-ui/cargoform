import { google } from "googleapis";
import { SignJWT, jwtVerify } from "jose";
import { config } from "./config.js";
import { db } from "./db.js";
import { encryptJson, decryptJson } from "./crypto.js";

const stateKey = new TextEncoder().encode(config.SESSION_SIGNING_SECRET);
const oauth = () => new google.auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, config.GOOGLE_REDIRECT_URI);

export async function gmailAuthorizationUrl(organisationId: string, userId: string) {
  const state = await new SignJWT({ organisationId, userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(stateKey);
  // Gmail send is the sole mailbox privilege. OpenID scopes only identify the
  // consenting account so CargoForm can reject a sender other than the
  // configured platform mailbox; no inbox/profile API is called.
  return oauth().generateAuthUrl({ access_type: "offline", prompt: "consent", scope: ["openid", "email", "https://www.googleapis.com/auth/gmail.send"], state });
}

export async function completeGmailAuthorization(code: string, state: string) {
  const { payload } = await jwtVerify(state, stateKey);
  const client = oauth();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const identity = await google.oauth2({ version: "v2", auth: client }).userinfo.get();
  const accountEmail = identity.data.email?.toLowerCase();
  if (accountEmail !== config.GMAIL_EXPECTED_SENDER.toLowerCase()) throw new Error("CONNECTED_GMAIL_ACCOUNT_DOES_NOT_MATCH_EXPECTED_SENDER");
  await db.oAuthCredential.upsert({
    where: { organisationId_provider_accountEmail: { organisationId: String(payload.organisationId), provider: "gmail", accountEmail } },
    update: { encryptedTokens: encryptJson(tokens), scopes: tokens.scope?.split(" ") ?? [], expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null },
    create: { organisationId: String(payload.organisationId), provider: "gmail", accountEmail, encryptedTokens: encryptJson(tokens), scopes: tokens.scope?.split(" ") ?? [], expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null },
  });
  return accountEmail;
}

function base64Url(value: string) { return Buffer.from(value, "utf8").toString("base64url"); }
function header(value: string) { return value.replace(/[\r\n]+/g, " ").trim(); }
function htmlEscape(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character); }
function htmlFromText(value: string, senderName: string) {
  return `<!doctype html><html><body style="margin:0;background:#edf1f2;color:#17222c;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#edf1f2;padding:28px 12px"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden"><tr><td style="background:#173d3f;padding:22px 28px;color:#ffffff"><div style="font-size:20px;font-weight:700">CargoForm</div><div style="font-size:10px;letter-spacing:1.6px;margin-top:5px;color:#c9dedb">SECURE ACCOUNT NOTICE</div></td></tr><tr><td style="padding:30px 28px;font-size:15px;line-height:1.6;white-space:pre-line">${htmlEscape(value)}</td></tr><tr><td style="padding:18px 28px;background:#f6f9f8;font-size:11px;line-height:1.5;color:#68777c">${htmlEscape(senderName)} · CargoForm Notification Service</td></tr></table></td></tr></table></body></html>`;
}
function buildMime(item: { fromEmail: string; toEmails: string[]; ccEmails: string[]; subject: string; textBody: string }, htmlBody: string, senderName: string) {
  const boundary = `cargoform_${crypto.randomUUID().replaceAll("-", "")}`;
  return [
    `From: ${header(senderName)} via CargoForm Notification Service <${header(item.fromEmail)}>`,
    `To: ${item.toEmails.map(header).join(", ")}`,
    item.ccEmails.length ? `Cc: ${item.ccEmails.map(header).join(", ")}` : "",
    `Subject: ${header(item.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary=\"${boundary}\"`,
    "Auto-Submitted: auto-generated",
    "X-Auto-Response-Suppress: All",
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    item.textBody,
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    htmlBody,
    `--${boundary}--`,
  ].filter(Boolean).join("\r\n");
}

export async function sendOutboxEmail(outboxId: string) {
  const item = await db.emailOutbox.findUniqueOrThrow({ where: { id: outboxId }, include: { organisation: { select: { legalName: true } } } });
  // The verified platform mailbox is intentionally shared by the notification
  // service; tenant users never receive or control its OAuth tokens.
  const credential = await db.oAuthCredential.findFirst({ where: { provider: "gmail", accountEmail: item.fromEmail } });
  if (!credential) throw new Error("GMAIL_SENDER_NOT_AUTHORIZED");
  const client = oauth();
  client.setCredentials(decryptJson(credential.encryptedTokens));
  client.on("tokens", async (tokens) => {
    const current = decryptJson<Record<string, unknown>>(credential.encryptedTokens);
    await db.oAuthCredential.update({ where: { id: credential.id }, data: { encryptedTokens: encryptJson({ ...current, ...tokens }), expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined } });
  });
  const senderName = item.organisation.legalName.trim() || "CargoForm";
  const htmlBody = htmlFromText(item.textBody, senderName);
  const raw = buildMime(item, htmlBody, senderName);
  const result = await google.gmail({ version: "v1", auth: client }).users.messages.send({ userId: "me", requestBody: { raw: base64Url(raw) } });
  await db.emailOutbox.update({ where: { id: item.id }, data: { status: "SENT", sentAt: new Date(), providerMessageId: result.data.id ?? null, lastError: null } });
}
