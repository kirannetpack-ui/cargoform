import { google } from "googleapis";
import { SignJWT, jwtVerify } from "jose";
import { config } from "./config.js";
import { db } from "./db.js";
import { encryptJson, decryptJson } from "./crypto.js";

const stateKey = new TextEncoder().encode(config.SESSION_SIGNING_SECRET);
const oauth = () => new google.auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, config.GOOGLE_REDIRECT_URI);

export async function gmailAuthorizationUrl(organisationId: string, userId: string) {
  const state = await new SignJWT({ organisationId, userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(stateKey);
  return oauth().generateAuthUrl({ access_type: "offline", prompt: "consent", scope: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"], state });
}

export async function completeGmailAuthorization(code: string, state: string) {
  const { payload } = await jwtVerify(state, stateKey);
  const client = oauth();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const profile = await google.gmail({ version: "v1", auth: client }).users.getProfile({ userId: "me" });
  const accountEmail = profile.data.emailAddress?.toLowerCase();
  if (accountEmail !== config.GMAIL_EXPECTED_SENDER.toLowerCase()) throw new Error("CONNECTED_GMAIL_ACCOUNT_DOES_NOT_MATCH_EXPECTED_SENDER");
  await db.oAuthCredential.upsert({
    where: { organisationId_provider_accountEmail: { organisationId: String(payload.organisationId), provider: "gmail", accountEmail } },
    update: { encryptedTokens: encryptJson(tokens), scopes: tokens.scope?.split(" ") ?? [], expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null },
    create: { organisationId: String(payload.organisationId), provider: "gmail", accountEmail, encryptedTokens: encryptJson(tokens), scopes: tokens.scope?.split(" ") ?? [], expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null },
  });
  return accountEmail;
}

function base64Url(value: string) { return Buffer.from(value, "utf8").toString("base64url"); }

export async function sendOutboxEmail(outboxId: string) {
  const item = await db.emailOutbox.findUniqueOrThrow({ where: { id: outboxId } });
  // The verified platform mailbox is intentionally shared by the notification
  // service; tenant users never receive or control its OAuth tokens.
  const credential = await db.oAuthCredential.findFirstOrThrow({ where: { provider: "gmail", accountEmail: item.fromEmail } });
  const client = oauth();
  client.setCredentials(decryptJson(credential.encryptedTokens));
  client.on("tokens", async (tokens) => {
    const current = decryptJson<Record<string, unknown>>(credential.encryptedTokens);
    await db.oAuthCredential.update({ where: { id: credential.id }, data: { encryptedTokens: encryptJson({ ...current, ...tokens }), expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined } });
  });
  const raw = [`From: CargoForm <${item.fromEmail}>`, `To: ${item.toEmails.join(", ")}`, item.ccEmails.length ? `Cc: ${item.ccEmails.join(", ")}` : "", `Subject: ${item.subject}`, "Content-Type: text/plain; charset=utf-8", "", item.textBody].filter(Boolean).join("\r\n");
  const result = await google.gmail({ version: "v1", auth: client }).users.messages.send({ userId: "me", requestBody: { raw: base64Url(raw) } });
  await db.emailOutbox.update({ where: { id: item.id }, data: { status: "SENT", sentAt: new Date(), providerMessageId: result.data.id ?? null, lastError: null } });
}
