# CargoForm business and workflow rules — version 1.0

Status: **Approved implementation baseline pending business/legal sign-off**  
Owner: Netpack Logistic / Platform Admin  
Effective environment: private staging first

## 1. Account hierarchy and data ownership

- The Platform owns the software, platform configuration, subscription relationship and security administration.
- A Main User Organisation is the tenant and legal owner/controller of its operational shipment data, subject to applicable law and platform terms.
- Each user belongs to one or more organisations through an explicit membership. No organisation access may be inferred from an email domain.
- Each Client Account belongs to exactly one Main User Organisation. Client submissions route only to that organisation.
- Carriers are external recipients, not tenant users, unless a separately approved carrier portal is introduced.
- Platform Admin does not receive routine access to confidential shipment content. Temporary support/compliance access requires a reason, time limit, elevated authorization and audit event.

## 2. Platform Admin permissions and responsibilities

Platform Admin may:

- review, approve, reject or request changes to Main User registrations;
- suspend/reactivate Main User organisations and revoke compromised sessions;
- manage plans, subscription status, platform invoices and payment exceptions;
- publish/retire versioned templates, validation rules and country/carrier rulesets;
- monitor email delivery metadata, system health, audit events and security alerts;
- view aggregate system reports that avoid exposing shipment content by default;
- initiate audited support access only with an approved purpose.

Platform Admin may not:

- submit shipments to carriers on behalf of a Main User without explicit delegated support authorization;
- silently edit issued documents or operational records;
- view client shipment documents merely because the user is a Platform Admin;
- erase audit, payment, issued-document or statutory records through the ordinary UI;
- create additional Platform Admins through an open registration page.

Initial Platform Admin bootstrap is one-time, deployment-controlled and limited to `app.netpack@gmail.com`. After success, bootstrap is disabled.

## 3. Main User subscription plans

All numerical limits remain configurable; staging defaults are:

| Capability | Starter | Professional | Enterprise |
|---|---:|---:|---:|
| Main User staff | 3 | 15 | Contracted |
| Active clients | 10 | 100 | Contracted |
| Confirmed shipments/month | 50 | 500 | Contracted |
| Document templates | Standard | Standard + custom branding | Custom/controlled |
| Carrier email packages | Yes | Yes | Yes |
| Carrier APIs | No | Selected | Contracted |
| API access | No | Optional | Included |
| Audit export | 90 days | 1 year | Contracted retention |
| Support | Standard | Priority | Dedicated |

- Platform subscription billing is separate from Main User-to-Client freight/service billing.
- Usage is counted once when a shipment is confirmed, not on every edit or preview.
- Non-payment uses reminders and a grace period. After suspension, existing records remain readable/exportable while new paid operations are blocked.

## 4. Staff roles

| Action | Owner | Operations | Reviewer | Finance | Read-only |
|---|:---:|:---:|:---:|:---:|:---:|
| Manage organisation/profile | ✓ |  |  |  |  |
| Invite/remove staff | ✓ |  |  |  |  |
| Create/manage clients | ✓ | ✓ |  |  |  |
| Create/edit draft shipments | ✓ | ✓ | ✓ |  |  |
| Review client submissions | ✓ | ✓ | ✓ |  |  |
| Confirm shipment | ✓ | ✓ | ✓ |  |  |
| Add MAWB/B/L and carrier | ✓ | ✓ | ✓ |  |  |
| Send carrier package | ✓ | ✓ | ✓ |  |  |
| Request post-departure amendment | ✓ | ✓ | ✓ |  |  |
| Approve document for external use | ✓ |  | ✓ |  |  |
| View/manage client invoices | ✓ |  |  | ✓ | view only |
| View subscription billing | ✓ |  |  | ✓ |  |
| View records | ✓ | ✓ | ✓ | billing scope | ✓ |

- The last active Owner cannot remove or demote themselves.
- High-risk actions may require a Reviewer distinct from the preparer when four-eyes control is enabled.

## 5. Client permissions and submission flow

Client may:

- edit its own profile and authorized contacts;
- create and edit its own shipment request while in Client Draft/Returned status;
- enter exporter/consignee, goods, invoice and packing information permitted by the Main User;
- upload requested evidence through secure storage;
- submit to its owning Main User;
- view statuses and documents explicitly released to it;
- chat only with authorized staff of its owning Main User.

Client may not:

- select or contact the carrier directly;
- enter/finalize MAWB or B/L numbers unless the Main User explicitly grants a narrow permission;
- confirm/depart a shipment, issue a document or approve an amendment;
- view carrier rates, Main User margins, other clients or platform subscription data;
- contact Platform Admin through operational chat.

Flow: `CLIENT_DRAFT → CLIENT_SUBMITTED → UNDER_REVIEW → RETURNED_FOR_CORRECTION | APPROVED_FOR_BOOKING`.

## 6. Shipment lifecycle

`DRAFT → CLIENT_SUBMITTED (optional) → UNDER_REVIEW → CONFIRMED → DEPARTED → DELIVERED → CLOSED`

Exceptional terminal/side states: `RETURNED_FOR_CORRECTION`, `CANCELLED`, `ON_HOLD`.

- Draft/returned shipments are editable and deletable through soft deletion.
- Confirmed pre-departure shipments remain editable by authorized Main User staff; material changes create a new revision and may require re-review/re-submission.
- Departure locks the operational snapshot. No direct overwrite is permitted.
- Post-departure changes use an Amendment Request with field, old value, proposed value, reason, requester, carrier clause/fee/cut-off, status and audit events.
- Amendment states: `DRAFT → SUBMITTED → CARRIER/REVIEW_PENDING → ACCEPTED | DECLINED | CANCELLED`.
- Accepted amendments create a new document/shipment revision while preserving the prior issued snapshot.

## 7. Weight and measurement authority

- Packing boxes are the source of truth for pieces, actual gross weight, dimensions, volumetric weight and CBM.
- MAWB/B/L/email totals must be calculated from the same immutable shipment-total service.
- Goods-line net/gross weights must reconcile with box totals before confirmation; tolerances are configurable and default to 0.01 kg.
- Air volumetric divisor is carrier/ruleset versioned; 6,000 cm³/kg remains the default, not an irreversible universal value.
- Chargeable weight calculation records total actual, total volumetric, per-box higher-weight sum and selected governing result.
- Manual CBM/weight overrides require a reason and audit event.

## 8. Document approval and issuing responsibility

| Document | CargoForm role | External approval/issuance |
|---|---|---|
| MAWB | Prepare carrier-aligned draft/data | Airline or authorized cargo agent issues |
| Bill of Lading | Prepare carrier/NVOCC-aligned draft/data | Ocean carrier/NVOCC issues |
| Ordinary COO | Prepare application/draft | Authorized Nepal chamber/competent body certifies |
| Preferential origin proof | Select correct ruleset and prepare prescribed data | Exporter/authorized body/customs route as legally applicable |
| Commercial Invoice | Generate exporter document | Authorized exporter representative approves/signs |
| Packing List | Generate from controlled box allocation | Exporter/packer approves |
| Phytosanitary Certificate | Prepare NNSW/PQPMC application data | PQPMC issues after official procedure |

- Statuses: `DRAFT → UNDER_REVIEW → APPROVED_FOR_SUBMISSION → SUBMITTED → ISSUED/RECEIVED → SUPERSEDED`.
- CargoForm never labels a draft as issued or certified.
- Signatures/stamps require an authorized signer, explicit action, immutable timestamp and document checksum.

## 9. Email and notification routing

| Event | Required recipients | Optional recipients |
|---|---|---|
| Main User registration submitted | Platform Admin reviewers | Applicant acknowledgement |
| Registration decision/change request | Applicant/Main User owner | Admin audit mailbox |
| Staff/client invitation | Invitee | Main User owners |
| Client shipment submitted | Owning Main User operations/reviewers only | Client acknowledgement |
| Shipment returned/approved | Submitting client + Main User | Selected staff |
| Shipment confirmed/departed/delivered | Main User operations | Explicitly selected client contacts |
| Carrier package ready | Main User reviewers | None |
| Carrier package sent | Selected verified carrier addresses + Main User operations | Explicit CC only |
| Carrier response | Main User operations/reviewers | Selected client only after review |
| Amendment | Requester + Main User operations | Carrier when submitted |
| Document status | Selected shipment participants | Compliance staff |
| Billing/payment | Payer and issuer finance contacts | Owners |
| Chat | Exact thread members only | None |
| Security | Affected identity + permitted security admins | Owners when appropriate |

- Email and in-app preferences may disable non-essential notifications; security, legal and transactional notices cannot be disabled where required.
- Sensitive documents use authenticated expiring links by default. Attachments require explicit Main User selection and authorization.
- Every email has an event key, template version, recipient resolution record, provider status and audit event.

## 10. Retention and deletion baseline

Final retention periods require Nepal legal/accounting advice. Staging defaults:

| Record | Default retention |
|---|---:|
| Rejected/abandoned registration data | 180 days after decision/abandonment |
| Identity/company evidence | Until decision + 180 days unless legally required longer |
| Active account/profile | Account life + 7 years for required business/audit records |
| Shipment, invoice, packing and issued documents | 7 years after closure |
| Payment, invoice, credit/refund records | 7 years |
| Audit/security events | 7 years; high-volume technical logs 1 year unless escalated |
| Chat | 3 years after shipment/account closure unless placed on hold |
| Email delivery metadata | 2 years; body minimized/removed sooner where feasible |
| Drafts with no activity | Soft-delete after 1 year; purge after 30-day recovery window |
| Backups | Daily 35 days, monthly 12 months, annual according to approved policy |

- User deletion requests trigger legal-hold/statutory review, then anonymization or deletion where allowed.
- Ordinary UI deletion is soft deletion. Purge is a controlled background job with audit evidence.
- Backups expire independently and are not selectively edited; restored data must reapply deletion tombstones.

## 11. Governance and change control

- Rules, templates, carrier data, HS datasets and calculation methods are versioned with effective dates.
- Production policy changes require Platform Owner approval, test evidence and release notes.
- Legal, customs, carrier and payment-provider requirements override convenience defaults.
- Nepal logistics/customs, privacy/legal and accounting reviewers must sign off before public launch.
