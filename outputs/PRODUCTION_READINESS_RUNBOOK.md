# CargoForm production-readiness runbook

## Current status

The frontend/PWA and Android shell build successfully. The production API and Prisma schema compile successfully. The current dependency audit reports a Prisma CLI/config advisory that must be upgraded or formally risk-accepted before staging approval.

This is a production foundation—not a live deployment. A real domain, PostgreSQL service, secret manager, Google OAuth credentials, Admin bootstrap, storage, monitoring and backups are still required.

## Connect Gmail in Codex for development testing

1. Open Codex/ChatGPT **Settings**.
2. Open **Apps** or **Plugins**.
3. Select **Gmail** and choose **Connect**.
4. Sign in with exactly `app.netpack@gmail.com`.
5. Review and approve Google’s OAuth consent screen.
6. Return to the CargoForm task and ask to verify the Gmail connection.

Never paste the Gmail password, OTP, recovery code or OAuth authorization code into chat or source files.

## Configure Gmail for the deployed CargoForm application

The Codex Gmail connection is not the production application connection.

1. Create or select a Google Cloud project owned by the business.
2. Configure the OAuth consent screen, verified support/developer contacts and privacy-policy URLs.
3. Enable the Gmail API.
4. Create a Web application OAuth client.
5. Add the exact production callback, for example `https://api.example.com/api/integrations/gmail/callback`.
6. Store the client ID and client secret in the deployment secret manager.
7. Deploy the API and sign in as the approved Platform Admin.
8. Start Gmail connection from CargoForm Settings and authorize `app.netpack@gmail.com`.
9. The callback verifies the connected Gmail profile exactly matches `GMAIL_EXPECTED_SENDER` before storing encrypted tokens.
10. Run the email worker and send a non-sensitive registration test after review.

Request only the minimum Gmail scopes required. The current server foundation requests send and read-only profile/mail access; reduce read scope further if production delivery-status requirements do not need it.

## Generate secrets

Use a secure secret manager or cryptographically secure generator. Required values include:

- `SESSION_SIGNING_SECRET`: at least 32 random bytes
- `TOKEN_ENCRYPTION_KEY_BASE64`: exactly 32 random bytes encoded as Base64
- PostgreSQL credentials
- Google OAuth client ID and secret

Never commit `server/.env`, refresh tokens, database passwords, Android signing keys or Gmail credentials.

## Start a local production-like environment

```powershell
docker compose up -d postgres
cd server
Copy-Item .env.example .env
npm install
npm run prisma:generate
npx prisma migrate dev --name initial_production_schema
npm run dev
```

Populate the `.env` file before starting. The server intentionally refuses to start when required secrets are absent or malformed.

## Deployment order

1. Provision managed PostgreSQL with encryption, point-in-time recovery and automated backups.
2. Provision encrypted object storage for registration and shipment documents.
3. Deploy API and email worker on Node.js 20+ behind HTTPS.
4. Run `prisma migrate deploy` as a controlled release job.
5. Bootstrap `app.netpack@gmail.com` as the one initial Platform Admin through a one-time secured command; then disable bootstrap.
6. Deploy the PWA with `VITE_API_BASE_URL` pointing to the API.
7. Configure allowed origins, secure cookies, CSP, rate limits and reverse-proxy request limits.
8. Complete production Gmail OAuth from the Admin Settings screen.
9. Run registration, notification, chat, document, payment and tenant-isolation acceptance tests.
10. Configure logs, metrics, alerts, uptime checks, audit retention and restore tests.

## Production acceptance gates

- No local/demo sign-in path is enabled in production.
- Every query is tenant-scoped and authorization-tested.
- Admin, Main User, staff and client permissions are tested with negative cases.
- Gmail sender mismatch fails closed.
- Registration and email-outbox creation occur in one database transaction.
- Email events are idempotent; retries cannot send duplicate registration messages.
- Payment provider callbacks are signature-verified and reconciled server-side.
- Sensitive documents use encrypted storage and expiring authenticated links.
- Backups and a full restore are tested.
- Android/iOS signing keys and store accounts are controlled by the business.

## Prepared server components

- PostgreSQL/Prisma multi-tenant schema
- Organisation memberships and roles
- Main User applications and Admin statuses
- Clients, shipments, goods and packing boxes
- Gmail OAuth start/callback with exact-account check
- AES-256-GCM encrypted OAuth-token storage
- Transactional registration plus email-outbox creation
- Central notification event catalogue covering account, invitation, client submission, shipment, carrier, amendment, document/LPCO, billing, payment, subscription, security and chat events
- Per-user email/in-app preferences, recipient privacy, idempotent delivery and audit records
- Retryable/idempotent email worker
- Chat, notifications and audit records
- Liveness/readiness endpoints
- Docker and environment templates
