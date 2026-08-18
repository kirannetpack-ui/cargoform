# CargoForm payment and account architecture

## Recommended commercial model

Use two independent billing relationships. The Platform Admin sells CargoForm subscriptions and usage credits to Main User organisations. Each Main User may separately invoice its own Clients for freight, documentation, handling and other shipment services. Client money must never be treated as platform subscription revenue.

## Account ownership

- **Platform Admin:** creates/approves Main User organisations, plans, limits, invoices, payment exceptions and suspensions. It cannot silently become a client user or submit a carrier shipment.
- **Main User organisation:** owns shipments, templates, carrier contacts, staff, client accounts, quotations and client invoices.
- **Main User staff:** receives role-scoped permissions such as reviewer, operations, finance or read-only. Staff belongs to exactly one Main User organisation unless explicitly invited elsewhere.
- **Client account:** belongs to one Main User organisation, submits shipment data and sees only records released to it. It cannot see the Main User's other clients, carrier directory, margins or subscription billing.

Every operational record should carry `tenant_id` (the Main User organisation), `created_by`, `updated_by`, timestamps and a soft-delete/audit state. Database row-level security must enforce tenant ownership; UI filtering is not sufficient.

## Payment providers

### Nepal-first recommendation

Use verified bank transfer and direct connectIPS/IPS integration as the first payment channel. Add **eSewa ePay** as the second channel, followed by **Khalti** as the third. All gateway integrations must be server-side with signed requests, verified callbacks/status checks and idempotent transaction handling.

Do not use Stripe as the primary Nepal merchant processor at present because Nepal is not in Stripe's current supported merchant-country list. Stripe can be added later only for a legally established entity and bank account in a supported jurisdiction.

Also support manual bank transfer with Admin/finance verification for B2B customers. Never activate paid service solely from a browser success redirect or an uploaded screenshot.

## Suggested pricing structure

- **Starter:** monthly base fee, 2–3 staff, limited active clients and a document/shipment allowance.
- **Professional:** more staff/clients, carrier integrations, approval workflows, API access and higher included volume.
- **Enterprise:** negotiated limits, SSO, custom templates, audit exports, dedicated support and optional private deployment.
- Usage overages should be measured by a stable event such as a shipment confirmed or an official document package generated—not every preview/edit.
- Offer annual prepayment at a discount, plus non-expiring/manual credits only when contractually required.

Main Users should configure their own client price book: freight, documentation, pickup, customs/handling, insurance, taxes and discounts. Platform subscription invoices and Main User client invoices require separate numbering sequences and ledgers.

## Core billing records

- `plans`, `plan_prices`, `subscriptions`, `subscription_items`
- `usage_events` with idempotency key and shipment reference
- `invoices`, `invoice_lines`, `credit_notes`, `payments`, `refunds`
- `payment_attempts`, `provider_events`, `settlements`, `reconciliation_entries`
- `client_quotes`, `client_invoices`, `client_receipts`
- immutable `audit_events`

Store money as integer minor units with an ISO currency code. Snapshot prices, tax treatment, payer identity and invoice lines when an invoice is issued. Never calculate historical invoices from a mutable current price list.

## Payment state machine

`DRAFT → ISSUED → PAYMENT_PENDING → PAID`

Exceptional states: `FAILED`, `EXPIRED`, `PARTIALLY_PAID`, `REFUND_PENDING`, `PARTIALLY_REFUNDED`, `REFUNDED`, `VOID` and `DISPUTED`.

Provider callbacks enter an inbox table first. Verify signature and amount, deduplicate by provider event/transaction ID, update the ledger in one database transaction, then acknowledge the provider. A scheduled reconciliation job must query unresolved or pending payments.

## Access and non-payment policy

- Use a grace period and visible reminders before restricting an overdue Main User.
- After suspension, preserve read/export access to existing records while blocking new confirmations and paid operations.
- Never delete shipment or statutory records automatically for non-payment.
- Client payment status must not automatically suspend the Main User's platform account; it only affects that client's commercial workflow according to the Main User's policy.

## Delivery order

1. Multi-tenant organisations, roles, invitations, audit trail and row-level security.
2. Admin subscription catalogue, manual invoices, bank-transfer reconciliation and connectIPS/IPS integration.
3. eSewa checkout with verified callback/status reconciliation.
4. Khalti checkout with verified callback/status reconciliation.
5. Main User quotations/client invoices and receipts.
6. Usage billing, credit notes/refunds, finance exports and optional international processor.

No provider secret, HMAC secret or email credential may be stored in the browser. Payment and email sending require authenticated backend endpoints, queued jobs and auditable delivery/provider events.
