# CargoForm account, chat, email and notification specification

## Registration

Every Main User starts with `DRAFT`, submits to Platform Admin as `SUBMITTED`, and may become `APPROVED`, `CHANGES_REQUESTED`, `SUSPENDED` or `REJECTED`. Approval must be enforced by the backend before carrier submission, payments or client invitations are enabled.

### Individual Main User

- Full legal name and date of birth
- Verified email and phone
- Residential/business address
- Government identity type, number, issuing country and expiry where applicable
- Optional trading name, PAN and bank/billing details
- Consent, terms version and submission timestamp

### Organisation Main User

- Registered legal and trading names
- Company registration number and incorporation date
- PAN/VAT and registered office address
- Organisation type and business activity
- Authorized contact and finance/operations contacts
- Company certificate, PAN/VAT evidence and authority evidence
- Beneficial-owner/KYC information only when legally or payment-provider required
- Consent, terms version and submission timestamp

Sensitive evidence belongs in encrypted object storage with malware scanning, restricted access, expiry/retention controls and audit events—not browser storage.

## Account hierarchy

- Platform Admin reviews Main User registration and handles platform billing/support.
- Main User organisation owns its staff, clients, shipments, documents, carrier contacts and client invoices.
- Staff receives scoped roles such as Owner, Operations, Reviewer, Finance and Read-only.
- A Client belongs to one Main User tenant and can submit only to that Main User.
- A Client cannot contact Platform Admin through operational chat or see another client.

## Chat routing

Allowed threads:

- Platform Admin ↔ Main User owner/authorized staff
- Main User authorized staff ↔ owned Client

Messages require tenant/thread membership checks on every read and write. Store immutable sender identity, role, tenant, thread, timestamp and edit/deletion audit. Attachments require virus scanning and the same document-access policy as shipments.

## Notification event catalogue

- Registration submitted, approved, rejected or changes requested
- Email verification, password reset, login/MFA and security alert
- Staff/client invitation, acceptance, expiry or revocation
- Client shipment submitted or returned for correction
- Shipment confirmed, departed, delivered, cancelled or amended
- Carrier package prepared, sent, acknowledged or rejected
- Document generated, selected, approved, expired or replaced
- Phytosanitary/COO/LPCO action required or status changed
- Invoice issued, due, overdue, paid, failed, refunded or subscription changed
- New chat message or mention

The production server now implements this as a centralized typed event catalogue with tenant-scoped recipients, per-user email/in-app preferences, individual-address delivery, idempotency keys, professional templates and audit events. The registration route uses the same service rather than separate email logic.

Each event must declare eligible recipients. A client-submission event routes to the owning Main User only; carrier events route only after Main User approval; Platform Admin should receive account/platform events, not ordinary client shipment data.

## Email architecture

Use a transactional email provider behind a server-side outbox:

1. Business transaction writes the domain event and outbox record atomically.
2. Background worker resolves tenant-scoped recipients and preference rules.
3. Template renderer creates subject/body and secure time-limited links.
4. Provider sends with an idempotency key.
5. Webhooks update delivered, bounced, complained and suppressed states.
6. Retries use exponential backoff; permanent failures create an Admin/Main User alert.

Maintain versioned templates by event, locale and brand. Never attach sensitive statutory documents to routine notification emails by default; prefer authenticated expiring links. Carrier shipment packages may include explicitly selected documents after Main User approval and must be logged.

## Required production tables

- users, identities, sessions, mfa_methods
- organisations, memberships, roles, permissions
- main_user_applications, application_documents, admin_reviews
- client_accounts, invitations
- chat_threads, thread_members, messages, message_attachments
- notification_events, notification_preferences, notifications
- email_outbox, email_deliveries, email_suppressions, template_versions
- audit_events

Use row-level tenant security, short-lived server sessions, verified email, secure password hashing and optional/required MFA by role. Logout must revoke the server session and device refresh token; it must not delete business records.
