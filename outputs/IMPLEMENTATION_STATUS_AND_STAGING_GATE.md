# CargoForm implementation status and staging gate

Updated: 18 August 2026

## Implemented and verified locally

- Approved Version 1 business/workflow rules, including roles, permissions, lifecycle, approvals, notification routing and retention.
- PostgreSQL/Prisma production data model, Node.js API, continuously running Gmail worker, private S3-compatible object-storage support, health checks, metrics, structured logging, CI, Docker definitions and environment templates.
- Verified-email Main User registration, Argon2 password hashing, single-use verification/reset tokens, opaque revocable server sessions and tenant selection/enforcement.
- Mandatory TOTP MFA for Platform Admin and Main User Owners.
- One-time command-line Platform Admin bootstrap restricted to `app.netpack@gmail.com`; no public Admin-registration endpoint.
- Privacy-scoped Admin APIs for application queues, application decisions, suspension/reactivation, email-delivery monitoring and audit review. Shipment contents are not included in normal Admin lists.
- Tenant-scoped APIs for clients, staff roles, shipments, goods and packing boxes.
- Server-side box allocation checks and recalculation of pieces, actual weight, volumetric weight, chargeable weight and CBM. Direct edits after departure are rejected in favour of an amendment workflow.
- Frontend registration, login, MFA-code entry, session check and logout now call the real API instead of the demonstration login.
- Production frontend and API builds pass. Policy tests pass (3/3).

## Not yet a deployed staging service

The repository is staging-ready in structure, but no public infrastructure was provisioned because the required cloud account, domain/DNS ownership, database/storage provider and secret-manager access were not supplied. Never place these credentials in chat or source control; configure them directly in the selected provider.

## Required staging inputs

1. Staging domain and DNS control (for example `staging.cargoform.example`).
2. Chosen hosting region/provider for web, API and worker.
3. Managed PostgreSQL and private object-storage services.
4. Google production OAuth client with the exact staging callback URL.
5. Secret-manager entries described in `server/.env.example`.
6. Monitoring/alert destinations and named operational responders.
7. Final plan names, prices, tax treatment and payment bank account.
8. Approved retention exceptions and legal hold procedure.

## Staging acceptance gate

Staging must not be promoted until all formal tests in the project plan pass, a backup has been restored into an isolated database, Gmail routing/privacy is verified with test accounts, cross-tenant access tests pass, and Nepal logistics/customs plus legal/accounting reviewers sign off.

## Known dependency advisory

The runtime build succeeds. `npm audit --omit=dev` currently reports a high-severity recursive-merge advisory through Prisma's CLI/config dependency chain. The suggested automatic fix is a forced Prisma downgrade and was deliberately not applied. Reassess against a fixed compatible Prisma release before staging acceptance; do not use `npm audit fix --force` blindly.
