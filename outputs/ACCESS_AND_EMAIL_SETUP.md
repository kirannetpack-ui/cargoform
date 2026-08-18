# CargoForm access and email setup

## Current access status

The MVP does not have a real Platform Admin credential or password. Its sign-in screen is a local workflow demonstration and must not be treated as production authentication.

Proposed first production Admin identity:

- Role: Platform Admin / Owner
- Login email: `app.netpack@gmail.com`
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
- System sender: `app.netpack@gmail.com`
- Initial Platform Admin recipient: `app.netpack@gmail.com`
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

The first safe live test should send a registration notification from and to `app.netpack@gmail.com`, using non-sensitive sample applicant data. A user must review/confirm immediately before the send action.
