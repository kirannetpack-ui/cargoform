# CargoForm — logistics document MVP

## Run

From the project folder:

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`. A production build is available with `npm run build`.

## Implemented

- Production API foundation added under `server/`: PostgreSQL/Prisma tenant model, authenticated route boundary, encrypted Gmail OAuth credentials, exact sender verification, transactional registration/outbox creation, retry worker, health endpoints and Docker deployment files.
- Email Setup module configured for `app.netpack@gmail.com`, including Platform Admin recipient, Gmail OAuth connection state and a registration-event outbox that remains QUEUED until the provider accepts it.
- Main User onboarding with Individual versus Organisation field sets, editable profile, Admin-review submission status and registration notifications.
- Controlled messaging for Main User↔Platform Admin and Main User↔owned Client threads, plus event-based email/in-app preferences and notification inbox CRUD.
- Working logout/sign-in demonstration that ends the session without deleting tenant records; production authentication requirements remain documented.
- Functional sidebar modules: shipment snapshots (save/open/delete), editable staff/client/carrier records, document library, editable billing ledger and persisted organisation settings.
- Installable PWA shell with manifest, app identity/icon, standalone display, responsive mobile bottom navigation, connectivity state and offline service-worker caching.
- Capacitor mobile-app configuration plus a generated/synchronized Android native project using the same production web build.
- Central shipment totals now drive MAWB/B/L pieces and weights, CBM/chargeable calculations, email subjects/bodies and mismatch validation. The UI explicitly identifies packing boxes as the transport-weight source of truth.
- Operational sidebar reduced to Shipment data, Shipment history, Staffs, Clients, Carriers, Documents, Billing & payments and Settings.
- Email draft includes a Send email action that opens the addressed device mail composer; production automatic delivery/attachments remain a backend provider integration.
- Nepal PQPMC/NNSW-aligned Phytosanitary Certificate draft, botanical-name capture, indicative regulated-goods screening, and a direct NNSW LPCO application/tracking route. Final requirement and issuance remain with PQPMC and the importing country.
- MAWB and B/L cargo summaries use the exact packing-box count, calculated shipment weight/CBM, and a consolidated HS-code/WCO goods-name list.
- Goods-name entry offers WCO HS 2022 candidates; confirming a candidate synchronizes its six-digit code and official nomenclature wording across related documents. The bundled list is a starter index; production must connect a licensed/current full WCO dataset.
- Single reusable shipment record covering exporter, consignee, invoice, transport, goods, weight, HS code, and origin criterion.
- Distinct source-aligned layouts for an IATA-style MAWB and a UN-layout-key/carrier-style ocean Bill of Lading.
- Separate COO/proof families: ordinary chamber COO, GSP Form A, UK DCTS invoice declaration, EU GSP/REX statement on origin, India–Nepal Treaty COO, and China preferential COO.
- Destination rulesets for the United States, United Kingdom, European Union, Canada, Australia, GCC, China, and India.
- Clear ordinary/non-preferential versus preferential status and proof-route messaging.
- Editable document surface before output, separate manual notes, live validation, print-to-PDF, and genuine `.docx` generation.
- Template and rule-pack version labels, with authority disclaimer and source links inside each ruleset.
- Shipment lifecycle controls: draft, confirmed, and departed states; editable/deletable before departure; locked source snapshot plus auditable amendment requests after departure.
- MAWB-prefix and starter ocean-carrier-prefix resolution, editable carrier identity, carrier tracking links, and operations/support links after confirmation.
- Local draft persistence and amendment status tracking. Production carrier integration remains an API/credential deployment task.
- Multi-line goods entry with add/remove controls and propagation into Commercial Invoice and Packing List outputs.
- Professional generalized Commercial Invoice and Packing List templates.
- Multiple role-tagged contacts, client-invitation workflow preview, selectable email-document packages, and the required structured subject line.
- Corrected account hierarchy: Platform Admin registers Main Users; each Main User alone creates and owns its Child Accounts; Child submissions route only to the owning Main User; only the Main User prepares submission to the matched carrier.
- Exact-box packing builder with constrained goods allocation, remaining-quantity control, per-box dimensions/actual weight, automatic or manual CBM, configurable air divisor, air volumetric weight, shipment aggregate comparison and per-box chargeable comparison.
- True A4 print canvas (`210 × 297 mm`) with a `190 × 277 mm` printable content area under 10 mm page margins, automatic multi-page flow, repeated cargo-table headings, non-splitting rows and protected declaration/signature blocks.
- MAWB and Bill of Lading cargo tables now render every declared goods line. Long shipment details continue as rows under the correct repeated headings instead of stretching fixed party/routing fields.
- Fixed document headers/routing sections retain their source-aligned dimensions while the white cargo-detail grid flexes to consume all remaining A4 printable height before the charge, declaration and signature blocks. Column widths are explicit and headings wrap at word boundaries without vertical letter distortion.
- Expanded common-airline cargo-prefix starter directory. Complete global coverage is designed to come from the licensed, daily-updated IATA Airline Coding Database.

## Carrier resolution and operations

An MAWB's three-digit accounting prefix can identify the issuing airline. The MVP contains a reviewed starter directory for common carriers and validates the 3+8 digit structure. For production, license or synchronize IATA coding reference data rather than treating the embedded starter list as exhaustive.

Ocean B/L numbers do not have one universal, freely queryable global numbering authority. The MVP recognizes a starter set of common carrier/SCAC-style prefixes, but always labels the result as a suggestion and keeps it editable. A production service should use carrier APIs, a licensed SCAC/carrier directory, and an administrator reconciliation workflow.

Carrier links currently open official tracking and operations/support pages. Direct shipment creation, status subscription, and amendment submission require commercial carrier credentials. The recommended ocean integration boundary is DCSA Booking 2.0 plus Track & Trace 2.2; air cargo should use the carrier's supported IATA Cargo-XML/API channel.

After departure, source data is intentionally locked. Amendments are separate requests with a status trail because carrier acceptance, fees, customs/manifest revalidation, document surrender or endorsement, and local-law restrictions can apply.

## Architecture

The MVP is a React/TypeScript single-page application. `FormData` is the canonical shipment record. Document renderers map that record into MAWB, B/L, or COO fields. Destination metadata is a versionable rules layer and is deliberately separate from document rendering, so a new country or program can be added without changing shipment fields.

For a production build, split the current in-memory model into:

- `Exporter`, `Consignee`, and reusable party profiles
- `Shipment` and `TransportLeg`
- `Invoice` and `GoodsLine[]`
- `OriginAssessment` with evidence and rule outcome
- `DocumentInstance` with immutable source snapshot plus user edits
- `TemplateVersion` and `RulePackVersion`, each with effective dates and source records

Store rendered drafts as revisions; never overwrite the canonical shipment record with free-form preview edits. Add authentication, organization-level permissions, audit history, server-side DOCX/PDF generation, and encrypted object storage before production use.

## Rule decisions encoded as of 17 August 2026

- Nepal ordinary COO: chamber/authorized authority certification is the baseline. The MVP prepares a draft only; it does not issue or certify it.
- United States: the Nepal Trade Preference Program is treated as lapsed on 31 December 2025. The ruleset allows an ordinary COO but blocks any implied preferential claim.
- United Kingdom: DCTS Comprehensive Preferences; exporter origin declaration and product-specific origin evidence are required.
- European Union: EBA under EU GSP; use the REX statement-on-origin route when eligible.
- Canada: LDCT proof may be Form A, an exporter statement, or B255 for applicable textile/apparel goods.
- Australia: ASTP LDC route; manufacturer declaration is the main route and Form A is an alternative.
- GCC: no Nepal-wide preferential form is asserted. Use an ordinary COO and confirm member-state/product rules.
- China: preference is conditional on current beneficiary, tariff-line, origin-rule, and prescribed-form eligibility; otherwise use ordinary COO.
- India: the Treaty of Trade certificate is a distinct preferential certificate subject to Article V—not an ordinary COO variant.

## Verification

- TypeScript and production bundle completed successfully.
- Live browser smoke test passed for all eight rendered branches: ordinary COO, AWB, B/L, UK declaration, EU statement, Form A, India treaty COO, and China preferential COO. No browser console errors were found.
- A4 browser verification measured the preview at 793.688 × 1122.52 CSS pixels (the browser rendering of 210 × 297 mm at 96 dpi). A long MAWB test rendered all 17 cargo rows, retained `table-header-group` continuation headings and produced no console errors.
- Expandable-area verification measured a single-line MAWB form at 1046.92 CSS pixels (277 mm printable height); its cargo table expanded to 598.88 pixels and ended exactly where the charges block began. The nature-of-goods column measured 278.95 pixels, with normal word wrapping and no console errors.

## Authoritative source starting points

- Nepal TEPC export procedures and COO issuers: https://www.tepc.gov.np/pages/exports-transit-procedure
- Nepal TEPC standardized COO discussion: https://www.tepc.gov.np/projects/tepc/assets/upload/fck_upload/EOI%20for%20CO%20%28final%20version%29.pdf
- IATA AWB data boxes and numbering: https://www.iata.org/contentassets/c34e0f10a40543b48ba0bec8adf5e98b/isssp-cargo-manual.pdf
- UNECE Layout Key for trade documents and Bill of Lading: https://unece.org/fileadmin/DAM/cefact/recommendations/rec01/rec01_ecetrd137.pdf
- IATA official airline and airport code source: https://www.iata.org/en/publications/directories/code-search
- DCSA Booking 2.0 amendment/cancellation use cases: https://dcsa.org/standards/booking/documentation-booking-2/booking-2-use-cases
- DCSA Track & Trace 2.2 documentation: https://dcsa.org/standards/track-and-trace/standard-documentation-track-and-trace
- IATA Cargo-XML: https://www.iata.org/en/programs/cargo/e/cargo-xml/
- Example carrier post-departure B/L amendment controls: https://www.maersk.com/~/media_sc9/maersk/news/rate-announcements/files/2023/03/bl-amendments-guide.pdf
- USTR 2026 Trade Policy Agenda: https://ustr.gov/sites/default/files/files/Press/Releases/2026/2026%20Trade%20Policy%20Agenda%202025%20Annual%20Report.pdf
- UK DCTS proof of origin: https://www.gov.uk/guidance/how-to-claim-preferences-under-the-developing-countries-trading-scheme-dcts
- UK DCTS prescribed declaration wording and Form A completion: https://www.trade-tariff.service.gov.uk/news/stories/what-is-dcts-and-why-is-it-important-for-international-trade
- EU GSP and REX: https://taxation-customs.ec.europa.eu/customs/rules-origin-goods/preferential-rules-origin/generalised-system-preferences-gsp_en
- Canada LDCT: https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/ldct-tpmd-eng.html
- Canada Form A field layout: https://www.cbsa-asfc.gc.ca/publications/dm-md/d11/d11-4-4-eng.html
- Australia ASTP: https://www.abf.gov.au/fta/Pages/fta-countries/developing-countries-or-least-developed-countries.aspx
- China Customs LDC certificate rules: https://www.customs.gov.cn/eportal/attachDir/customs/2026/01/2026010510090697923.pdf
- India–Nepal Treaty certificate: https://commerce.gov.in/wp-content/uploads/2020/05/nepal.pdf

Rules should be revalidated before every rule-pack release and whenever a preference program, LDC graduation date, treaty, or prescribed form changes.
