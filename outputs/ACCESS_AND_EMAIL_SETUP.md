# CargoForm access and email setup

## Current access status

The web application requires a server-authenticated session; there is no local or demo sign-in path. The current Vercel project hosts the frontend only. Do not use it for authenticated operations until the API is deployed and `VITE_API_BASE_URL` points to that API.

Proposed first production Admin identity:

- Role: Platform Admin / Owner
- Login email: configured through `PLATFORM_ADMIN_EMAIL`
- Password: not defined in source code and must never be committed to the project
- Required activation: verified Google/email identity, server-created Admin membership and MFA enrollment

Production bootstrap should create the first Admin through a one-time server command or deployment secret, require a password-reset/identity-verification flow, then permanently disable open Admin bootstrap.

## Project location

`C:\Users\97798\Documents\Codex\2026-08-17\referenced-chatgpt-conversation-this-is-an`

Important paths:

- Web/PWA application: `src/`
- PWA manifest/service worker/icon: `public/`
- Production web build: `dist/`
- Android native project: `android/`
- Mobile wrapper configuration: `capacitor.config.ts`
- Architecture and handoff documents: `outputs/`

## Email configuration

- Provider: Gmail OAuth
- System sender: configured through `GMAIL_EXPECTED_SENDER`
- Initial Platform Admin recipient: configured by the account owner
- Gmail password storage: prohibited
- Current connector status: connection required

Submitting a Main User registration now creates both an in-app notification and a structured email-outbox record with event name, sender, recipient, subject, body, timestamp and QUEUED status. QUEUED does not mean sent.

After Gmail OAuth is connected to the exact mailbox, the backend/worker must:

1. verify the authenticated Gmail profile equals the configured sender;
2. create/send using an idempotency key tied to the registration event;
3. record the Gmail message/thread identifier;
4. update the outbox to SENT only after provider acceptance;
5. retry temporary failures and mark permanent failures;
6. retain an audit event without storing the Gmail password or OAuth token in the browser.

The first safe live test should use non-sensitive test applicant data. A user must review/confirm immediately before the send action.
