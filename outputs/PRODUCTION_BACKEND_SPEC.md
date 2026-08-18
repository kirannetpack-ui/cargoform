# CargoForm production backend boundary

The browser MVP demonstrates the workflow but must not be treated as a secure multi-user or email-sending system. Production deployment requires a server-side API, database, object storage, authentication, background jobs, and connected email/carrier providers.

## Roles and approval

- `PLATFORM_ADMIN`: registers/governs Main User organizations and platform reference data. It does not create or manage the Main User's client accounts in ordinary operation.
- `MAIN_USER`: creates its own Child Accounts, reviews their submissions, corrects shipment data, assigns MAWB/B/L, confirms documents and sends carrier packages.
- `CHILD_ACCOUNT`: created and owned by one Main User; enters and submits shipment data only to that Main User. It cannot see carrier contacts, assign transport-document numbers or send to carriers.
- `AUDITOR`: read-only access to versions, approvals, emails and amendments.

Workflow: `CHILD_DRAFT → SUBMITTED_TO_MAIN_USER → CHANGES_REQUESTED | MAIN_USER_APPROVED → CARRIER_NUMBER_ASSIGNED → SUBMITTED_TO_MATCHED_CARRIER → CONFIRMED → DEPARTED`. A Child submission notification is addressed only to its owning Main User. After departure, the issued snapshot is immutable; changes are `AmendmentRequest` records with carrier response and fees.

## Core records

- `Organization`, `User`, `Membership`, `ClientAccount`, `Invitation`
- `Shipment`, `ShipmentVersion`, `GoodsLine`, `Party`, `Address`, `ContactPoint`
- `PackingBox`, `BoxGoodsAllocation` and `FreightCalculationSnapshot`
- `Carrier`, `CarrierIdentifier` (IATA designator/accounting/prefix, ICAO, SCAC or carrier-specific prefix), `CarrierContact`, `CarrierEndpoint`
- `DocumentInstance`, `DocumentRevision`, `TemplateVersion`
- `ClientSubmission`, `ReviewDecision`, `Approval`
- `EmailPackage`, `EmailRecipient`, `EmailAttachment`, `DeliveryEvent`
- `AmendmentRequest`, `CarrierClauseSnapshot`, `CarrierResponse`
- `AuditEvent`

Every carrier-derived value should store `source`, `sourceVersion`, `matchedIdentifier`, `matchedAt`, and `verifiedBy`. Carrier changes must update linked display fields through IDs, not copied text; already-issued document versions retain their historical carrier snapshot.

## Email

Subject format:

`{MAWB_OR_BL} | {DESTINATION} | {TOTAL_GROSS_WEIGHT} | {TOTAL_PIECES} | {CONSIGNEE_NAME}`

Create documents server-side, let the reviewer select attachments, render a preview, then enqueue delivery only after explicit confirmation. Provider adapters can support Gmail/Google Workspace, Microsoft 365, or a transactional provider. Store provider message ID and delivery events; never expose provider credentials to the browser.

## Carrier data and integrations

- Subscribe to and synchronize the IATA Airline Coding Database for complete current airline designator, accounting and cargo-prefix coverage.
- Maintain the CAAN operating-in-Nepal flag separately because operating schedules change independently of IATA code assignments.
- Treat ocean carrier/B/L prefix matching as provider-specific; use licensed reference data and direct carrier/DCSA integrations.
- Use carrier-supported IATA Cargo-XML/API channels for air cargo and DCSA Booking/Track & Trace APIs where implemented for ocean cargo.
- Do not auto-send a booking or amendment merely from a number match. Require carrier endpoint verification and main-user approval.

## Packing and weight calculation

- Goods names and total quantities originate only in `GoodsLine`; packing cannot create additional goods descriptions.
- The requested box count creates exactly that many `PackingBox` records.
- `BoxGoodsAllocation` is constrained so the sum allocated across boxes cannot exceed the declared goods quantity.
- Each box stores dimensions, actual weight, optional manually verified CBM and its calculation source.
- Air volumetric weight defaults to `L × W × H cm ÷ 6000`. Keep the divisor versioned/configurable for carrier or commodity exceptions.
- CBM defaults to `L × W × H metres`; a manual CBM override must retain who entered it and why.
- Display both `max(total actual, total volumetric)` and `sum(max(box actual, box volumetric))`; the MVP final display uses the higher result. Store the carrier-confirmed rating method separately.
- For ocean LCL, display CBM and weight tonnes for weight/measure comparison (commonly 1 CBM versus 1,000 kg). FCL remains container-rated.

## Security essentials

- Organization-scoped row-level access and server-side authorization on every request
- Expiring, single-use child-account invitations and MFA support
- Malware scanning for uploaded client documents
- Encryption in transit and at rest; secrets stored outside application data
- Immutable audit log for review, approval, document generation, email and amendment events
- Retention and deletion policies that distinguish drafts from issued transport records
