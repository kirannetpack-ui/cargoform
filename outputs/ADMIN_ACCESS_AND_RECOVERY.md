# CargoForm Platform Admin access and recovery

## Permanent Admin identity

- Sign-in email: `app.netpack@gmail.com`
- Role: Platform Admin
- Login page: the normal CargoForm sign-in page; there is deliberately no public Admin-registration page.
- Second factor: a TOTP authenticator application is mandatory.

CargoForm must never publish, hard-code or keep a shared Admin password in documentation. The initial password is supplied once through the deployment secret manager as `BOOTSTRAP_ADMIN_PASSWORD`, used by the one-time bootstrap command, and then removed from the secret manager. It should be at least 14 characters and unique to CargoForm.

## First deployment

1. Configure `PLATFORM_ADMIN_EMAIL=app.netpack@gmail.com` and `BOOTSTRAP_ADMIN_EMAIL=app.netpack@gmail.com`.
2. Temporarily set a strong `BOOTSTRAP_ADMIN_PASSWORD` in the deployment secret manager.
3. Run `npm run bootstrap:admin` once against the production database.
4. Remove `BOOTSTRAP_ADMIN_PASSWORD` immediately after success.
5. Open CargoForm and choose **Set up required MFA**.
6. Enter the Admin email and initial password, add the displayed secret to the business-controlled authenticator, and confirm the six-digit code.
7. Sign in and connect the production Google OAuth client to exactly `app.netpack@gmail.com`.

The bootstrap command refuses to run if any Platform Admin already exists.

## Routine recovery

- Forgotten password: use the password-reset flow sent only to `app.netpack@gmail.com`; completing a reset revokes every existing session.
- Lost device/session: use session/device revocation from another authenticated Admin session.
- Lost authenticator: use a controlled break-glass recovery performed by an authorized infrastructure operator, with identity verification and an audit event. Do not offer email-only MFA bypass.
- Gmail delivery failure: Admin authentication remains separate from the Gmail sending connection. Restore OAuth from Admin settings after login.

Maintain at least two individually named Platform Admin users after initial acceptance testing. Do not share one password or authenticator among staff.
