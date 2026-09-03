import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  AlignmentType,
  HeadingLevel,
} from "docx";
import { saveAs } from "file-saver";
import {
  Box,
  Check,
  ChevronRight,
  Download,
  FileText,
  Info,
  Plane,
  Ship,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import "./styles.css";

type DocType =
  "MAWB" | "HAWB" | "BILL_OF_LADING" | "HBL" | "COO" | "COMMERCIAL_INVOICE" | "PACKING_LIST" | "PHYTOSANITARY";
type Destination = "US" | "UK" | "EU" | "CA" | "AU" | "GULF" | "CN" | "IN";
type Goods = {
  description: string;
  botanicalName: string;
  hsCode: string;
  packages: string;
  grossWeight: string;
  netWeight: string;
  quantity: string;
  originCriterion: string;
};
type FormData = {
  exporterName: string;
  exporterAddress: string;
  exporterTaxId: string;
  consigneeName: string;
  consigneeAddress: string;
  notifyParty: string;
  invoiceNo: string;
  invoiceDate: string;
  currency: string;
  invoiceValue: string;
  incoterm: string;
  departure: string;
  destination: string;
  carrier: string;
  carrierCode: string;
  documentNo: string;
  hawbNumber: string;
  hawbNumberFormat: string;
  hawbIssuerName: string;
  hblNumber: string;
  hblNumberFormat: string;
  hblIssuerName: string;
  hblReleaseType: string;
  hblOriginals: string;
  trackingUrl: string;
  operationsUrl: string;
  flightVoyage: string;
  estimatedDeparture: string;
  loadingPort: string;
  dischargePort: string;
  country: Destination;
  goods: Goods;
};
type ShipmentStatus = "DRAFT" | "CONFIRMED" | "DEPARTED";
type Amendment = {
  id: string;
  createdAt: string;
  field: string;
  requestedValue: string;
  reason: string;
  status: "DRAFT" | "SUBMITTED" | "ACCEPTED" | "DECLINED";
  clause: string;
};
type Contact = {
  id: string;
  name: string;
  email: string;
  role: "MAIN_USER" | "CHILD_ACCOUNT" | "CARRIER";
  status: "ACTIVE" | "INVITED" | "PENDING_REVIEW";
};
type EmailDraft = {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  documents: string[];
};
type SavedShipment = { id: string; savedAt: string; status: ShipmentStatus; data: FormData; goods: Goods[]; boxes: PackingBox[] };
type BillingRecord = { id: string; reference: string; party: string; amount: number; currency: string; dueDate: string; status: "DRAFT" | "ISSUED" | "PAID" | "VOID" };
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type MainProfile = {
  accountType: "INDIVIDUAL" | "ORGANISATION";
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "CHANGES_REQUESTED";
  fullName: string; dateOfBirth: string; email: string; phone: string; address: string; identityType: string; identityNumber: string;
  legalName: string; registrationNumber: string; panVat: string; incorporationDate: string; registeredAddress: string; contactPerson: string;
};
type ChatMessage = { id: string; thread: string; sender: "ADMIN" | "MAIN_USER" | "CLIENT"; senderName: string; body: string; createdAt: string };
type AppNotification = { id: string; category: string; title: string; detail: string; createdAt: string; read: boolean };
type NotificationPreference = { event: string; email: boolean; inApp: boolean; recipient: string };
type OutboundEmail = { id: string; event: string; from: string; to: string; subject: string; body: string; createdAt: string; status: "QUEUED" | "DRAFTED" | "SENT" | "FAILED" };
type AuthMode = "LOGIN" | "REGISTER" | "FORGOT" | "RESET" | "VERIFY";
type AuthSessionInfo = { user: { id: string; email: string; displayName?: string }; role: string; organisation: { id: string; legalName: string; status: string }; application?: { id: string; status: string; reviewedAt?: string } | null };
type AdminApplication = { id: string; organisationId: string; accountType: "INDIVIDUAL" | "ORGANISATION"; applicantEmail: string; status: string; submittedAt?: string; createdAt: string; payload?: Record<string, unknown>; organisation: { legalName: string; panVat?: string; registrationNumber?: string } };
type AdminEmailRecord = { id: string; eventKey: string; status: string; attempts: number; lastError?: string; sentAt?: string; createdAt: string; toEmails: string[] };
type AdminEmailStatus = { connected: boolean; sender: string; connectedAt?: string | null; tokenExpiresAt?: string | null; queued: number; failed: number };
type AdminUser = { id: string; email: string; phone: string | null; displayName: string; emailVerified: boolean; disabled: boolean; createdAt: string; role: string; organisationId: string | null; companyName: string; organisationStatus: string; applicationId: string | null; applicationStatus: string | null };
type AdminUserCounts = { total: number; active: number; disabled: number; pending: number };
type PackingBox = {
  id: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  actualWeightKg: number;
  manualCbm: number;
  allocations: Record<number, number>;
};
const authModeFromPath = (): AuthMode => window.location.pathname === "/verify-email" ? "VERIFY" : window.location.pathname === "/reset-password" ? "RESET" : "LOGIN";
const friendlyAuthError = (error: string) => ({
  INVALID_CREDENTIALS: "The email address/mobile number or password does not match an active account.",
  EMAIL_NOT_VERIFIED: "Please verify your email address before signing in.",
  ACCOUNT_PENDING_APPROVAL: "Your registration is verified and is awaiting Platform Admin approval.",
  ACCOUNT_CHANGES_REQUESTED: "The Platform Admin requested changes to your registration. Please contact the administrator.",
  ACCOUNT_REJECTED: "This registration was not approved. Please contact the Platform Admin.",
  ACCOUNT_SUSPENDED: "This account is suspended. Please contact the Platform Admin.",
  CURRENT_PASSWORD_INCORRECT: "The current password is incorrect.",
  INVALID_OR_EXPIRED_TOKEN: "This secure link is invalid or has expired. Request a new link.",
  REQUEST_FAILED: "The information could not be accepted. Check every required field and the password rules.",
  ADMIN_REGISTRATION_NOT_AVAILABLE: "The Platform Admin account cannot be registered from this public form.",
  EMAIL_OR_PHONE_ALREADY_IN_USE: "That email address or mobile number is already assigned to another account.",
  PLATFORM_ADMIN_PROTECTED: "The protected Platform Administrator cannot be changed from User management.",
}[error] || error.replaceAll("_", " "));
const numeric = (value: string) =>
  Number((value.match(/-?\d+(?:\.\d+)?/) || ["0"])[0]);
const boxMetrics = (box: PackingBox, divisor: number) => {
  const calculatedCbm = (box.lengthCm * box.widthCm * box.heightCm) / 1_000_000;
  const cbm = box.manualCbm > 0 ? box.manualCbm : calculatedCbm;
  const volumetricKg =
    box.manualCbm > 0
      ? (box.manualCbm * 1_000_000) / divisor
      : (box.lengthCm * box.widthCm * box.heightCm) / divisor;
  return {
    cbm,
    volumetricKg,
    chargeableKg: Math.max(box.actualWeightKg, volumetricKg),
  };
};

type HsEntry = { code: string; name: string; keywords: string[] };
// WCO HS 2022 six-digit starter index. Production should synchronize a
// complete licensed/current WCO dataset on the server.
const hsCatalog: HsEntry[] = [
  { code: "0902.10", name: "Green tea (not fermented) in immediate packings of a content not exceeding 3 kg", keywords: ["tea", "green tea"] },
  { code: "0902.30", name: "Black tea (fermented) and partly fermented tea, in immediate packings of a content not exceeding 3 kg", keywords: ["tea", "black tea"] },
  { code: "0904.11", name: "Pepper of the genus Piper, neither crushed nor ground", keywords: ["pepper", "spice"] },
  { code: "0908.31", name: "Cardamoms, neither crushed nor ground", keywords: ["cardamom", "spice"] },
  { code: "0910.11", name: "Ginger, neither crushed nor ground", keywords: ["ginger", "spice"] },
  { code: "0910.12", name: "Ginger, crushed or ground", keywords: ["ginger powder", "ground ginger"] },
  { code: "4202.22", name: "Handbags, whether or not with shoulder strap, including those without handle, with outer surface of sheeting of plastics or of textile materials", keywords: ["handbag", "bag", "textile bag"] },
  { code: "4911.99", name: "Other printed matter, including printed pictures and photographs — Other", keywords: ["printed matter", "booklet", "print"] },
  { code: "5701.10", name: "Carpets and other textile floor coverings, knotted, whether or not made up, of wool or fine animal hair", keywords: ["carpet", "rug", "wool carpet", "hand knotted"] },
  { code: "6109.10", name: "T-shirts, singlets and other vests, knitted or crocheted, of cotton", keywords: ["t-shirt", "tshirt", "cotton shirt"] },
  { code: "6110.20", name: "Jerseys, pullovers, cardigans, waistcoats and similar articles, knitted or crocheted, of cotton", keywords: ["jersey", "pullover", "cardigan", "sweater"] },
  { code: "6205.20", name: "Men's or boys' shirts, of cotton", keywords: ["men shirt", "boys shirt", "cotton shirt"] },
  { code: "6206.30", name: "Women's or girls' blouses, shirts and shirt-blouses, of cotton", keywords: ["women blouse", "girls shirt", "cotton blouse"] },
  { code: "6214.20", name: "Shawls, scarves, mufflers, mantillas, veils and the like, of wool or fine animal hair", keywords: ["shawl", "scarf", "pashmina"] },
  { code: "7113.11", name: "Articles of jewellery and parts thereof, of silver, whether or not plated or clad with other precious metal", keywords: ["silver jewellery", "silver jewelry", "jewellery"] },
  { code: "7113.19", name: "Articles of jewellery and parts thereof, of other precious metal, whether or not plated or clad with precious metal", keywords: ["gold jewellery", "precious jewellery", "jewelry"] },
];

const hsCandidates = (query: string) => {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  if (!words.length) return hsCatalog.slice(0, 8);
  return hsCatalog.map((entry) => ({ entry, score: words.reduce((score, word) =>
    score + (entry.code.includes(word) ? 6 : 0) +
    (entry.name.toLowerCase().includes(word) ? 4 : 0) +
    (entry.keywords.some((keyword) => keyword.includes(word) || word.includes(keyword)) ? 3 : 0), 0) }))
    .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score)
    .slice(0, 8).map(({ entry }) => entry);
};

const shipmentMetrics = (boxes: PackingBox[], lines: Goods[], divisor: number) => {
  const calculated = boxes.map((box) => boxMetrics(box, divisor));
  const fallbackActual = lines.reduce((sum, line) => sum + numeric(line.grossWeight), 0);
  const actualKg = boxes.length ? boxes.reduce((sum, box) => sum + box.actualWeightKg, 0) : fallbackActual;
  const volumetricKg = calculated.reduce((sum, item) => sum + item.volumetricKg, 0);
  const cbm = calculated.reduce((sum, item) => sum + item.cbm, 0);
  const perBoxHigherKg = calculated.reduce((sum, item) => sum + item.chargeableKg, 0);
  return { pieces: boxes.length, actualKg, volumetricKg, cbm, chargeableKg: Math.max(actualKg, volumetricKg, perBoxHigherKg) };
};

const phytoAssessment = (lines: Goods[]) => {
  const regulatedChapters = new Set(["06", "07", "08", "09", "10", "12", "14", "44"]);
  const terms = /\b(plant|seed|grain|wheat|rice|maize|fruit|vegetable|flower|bulb|root|tuber|timber|wood|bark|tea|spice|ginger|cardamom|herb|moss|soil)\b/i;
  const matches = lines.filter((g) =>
    regulatedChapters.has(g.hsCode.replace(/\D/g, "").slice(0, 2)) || terms.test(g.description),
  );
  return { possible: matches.length > 0, matches };
};

const initial: FormData = {
  exporterName: "Himalayan Craft Exports Pvt. Ltd.",
  exporterAddress: "Lalitpur-3, Bagmati, Nepal",
  exporterTaxId: "PAN 609000000",
  consigneeName: "Evergreen Imports LLC",
  consigneeAddress: "350 Market Street, San Francisco, CA 94105, USA",
  notifyParty: "Same as consignee",
  invoiceNo: "HCE-2026-0084",
  invoiceDate: "2026-08-17",
  currency: "USD",
  invoiceValue: "12,450.00",
  incoterm: "FOB Kolkata",
  departure: "Kathmandu, Nepal",
  destination: "San Francisco, USA",
  carrier: "To be assigned",
  carrierCode: "",
  documentNo: "",
  hawbNumber: "HCE-2026-0001",
  hawbNumberFormat: "HAWB-{YYYY}-{####}",
  hawbIssuerName: "",
  hblNumber: "HBL-2026-0001",
  hblNumberFormat: "HBL-{YYYY}-{####}",
  hblIssuerName: "",
  hblReleaseType: "ORIGINAL — NEGOTIABLE",
  hblOriginals: "THREE (3)",
  trackingUrl: "",
  operationsUrl: "",
  flightVoyage: "To be assigned",
  estimatedDeparture: "2026-08-25T10:00",
  loadingPort: "Kolkata, India",
  dischargePort: "Oakland, USA",
  country: "US",
  goods: {
    description: "Hand-knotted wool carpets",
    botanicalName: "",
    hsCode: "5701.10",
    packages: "24 rolls",
    grossWeight: "860 kg",
    netWeight: "810 kg",
    quantity: "240 m²",
    originCriterion: "Wholly obtained / sufficiently processed in Nepal",
  },
};

const airCarriers: Record<
  string,
  { name: string; code: string; tracking: string; ops: string }
> = {
  "020": {
    name: "Lufthansa Cargo",
    code: "LH",
    tracking: "https://lufthansa-cargo.com/eservices/etracking",
    ops: "https://lufthansa-cargo.com/contact",
  },
  "057": {
    name: "Air France Cargo",
    code: "AF",
    tracking: "https://www.afklcargo.com/mycargo/shipment/detail",
    ops: "https://www.afklcargo.com/contact",
  },
  "074": {
    name: "KLM Cargo",
    code: "KL",
    tracking: "https://www.afklcargo.com/mycargo/shipment/detail",
    ops: "https://www.afklcargo.com/contact",
  },
  "125": {
    name: "British Airways / IAG Cargo",
    code: "BA",
    tracking: "https://www.iagcargo.com/en/track/",
    ops: "https://www.iagcargo.com/en/contact/",
  },
  "157": {
    name: "Qatar Airways Cargo",
    code: "QR",
    tracking: "https://www.qrcargo.com/s/track-your-shipment",
    ops: "https://www.qrcargo.com/s/contact-us",
  },
  "160": {
    name: "Cathay Cargo",
    code: "CX",
    tracking: "https://www.cathaycargo.com/en-us/track-and-trace.html",
    ops: "https://www.cathaycargo.com/en-us/contact-us.html",
  },
  "176": {
    name: "Emirates SkyCargo",
    code: "EK",
    tracking: "https://www.skycargo.com/tracking/",
    ops: "https://www.skycargo.com/contact-us/",
  },
  "180": {
    name: "Korean Air Cargo",
    code: "KE",
    tracking: "https://cargo.koreanair.com/en/tracking/airWaybill",
    ops: "https://cargo.koreanair.com/en/contact",
  },
  "217": {
    name: "Thai Airways Cargo",
    code: "TG",
    tracking: "https://www.thaicargo.com/en/track-shipment",
    ops: "https://www.thaicargo.com/en/contact-us",
  },
  "235": {
    name: "Turkish Cargo",
    code: "TK",
    tracking:
      "https://www.turkishcargo.com/en/online-services/shipment-tracking",
    ops: "https://www.turkishcargo.com/en/contact",
  },
  "285": {
    name: "Nepal Airlines",
    code: "RA",
    tracking: "https://www.nepalairlines.com.np/",
    ops: "https://www.nepalairlines.com.np/contact-us",
  },
  "607": {
    name: "Etihad Cargo",
    code: "EY",
    tracking: "https://www.etihadcargo.com/en/e-services/track-a-shipment",
    ops: "https://www.etihadcargo.com/en/contact-us",
  },
  "618": {
    name: "Singapore Airlines Cargo",
    code: "SQ",
    tracking: "https://www.siacargo.com/ccn/ShipmentTrack.aspx",
    ops: "https://www.siacargo.com/contact-us",
  },
};
Object.assign(airCarriers, {
  "098": {
    name: "Air India",
    code: "AI",
    tracking: "https://cargo.airindia.com/",
    ops: "https://cargo.airindia.com/",
  },
  "112": {
    name: "China Cargo Airlines",
    code: "CK",
    tracking: "https://cargo2.ceair.com/",
    ops: "https://cargo2.ceair.com/",
  },
  "131": {
    name: "Japan Airlines Cargo",
    code: "JL",
    tracking: "https://www.jal.co.jp/jalcargo/inter/track/",
    ops: "https://www.jal.co.jp/jalcargo/",
  },
  "141": {
    name: "flydubai Cargo",
    code: "FZ",
    tracking: "https://www.flydubai.com/en/flying-with-us/cargo",
    ops: "https://www.flydubai.com/en/contact/",
  },
  "172": {
    name: "Cargolux",
    code: "CV",
    tracking: "https://www.cargolux.com/track-and-trace/",
    ops: "https://www.cargolux.com/contact/",
  },
  "229": {
    name: "Kuwait Airways Cargo",
    code: "KU",
    tracking: "https://www.kuwaitairways.com/en/cargo",
    ops: "https://www.kuwaitairways.com/en/contact",
  },
  "232": {
    name: "Malaysia Airlines Cargo",
    code: "MH",
    tracking: "https://www.maskargo.com/",
    ops: "https://www.maskargo.com/contact-us",
  },
  "297": {
    name: "China Airlines Cargo",
    code: "CI",
    tracking:
      "https://cargo.china-airlines.com/ccnetv2/content/manage/ShipmentTracking.aspx",
    ops: "https://cargo.china-airlines.com/",
  },
  "406": {
    name: "UPS Airlines",
    code: "5X",
    tracking: "https://www.ups.com/track",
    ops: "https://www.ups.com/us/en/support/contact-us",
  },
  "514": {
    name: "Air Arabia",
    code: "G9",
    tracking: "https://www.airarabia.com/en/cargo",
    ops: "https://www.airarabia.com/en/contact-us",
  },
  "603": {
    name: "SriLankan Cargo",
    code: "UL",
    tracking: "https://www.srilankancargo.com/",
    ops: "https://www.srilankancargo.com/contact-us",
  },
  "769": {
    name: "Himalaya Airlines",
    code: "H9",
    tracking: "https://www.himalaya-airlines.com/",
    ops: "https://www.himalaya-airlines.com/contact-us",
  },
  "781": {
    name: "China Eastern Cargo",
    code: "MU",
    tracking: "https://cargo2.ceair.com/",
    ops: "https://cargo2.ceair.com/",
  },
  "784": {
    name: "China Southern Cargo",
    code: "CZ",
    tracking: "https://cargo.csair.com/",
    ops: "https://cargo.csair.com/",
  },
  "997": {
    name: "Biman Bangladesh Airlines Cargo",
    code: "BG",
    tracking: "https://www.biman-airlines.com/cargo",
    ops: "https://www.biman-airlines.com/contactus",
  },
  "999": {
    name: "Air China Cargo",
    code: "CA",
    tracking: "https://www.airchinacargo.com/en/",
    ops: "https://www.airchinacargo.com/en/contact",
  },
});

const oceanCarriers: Record<
  string,
  { name: string; code: string; tracking: string; ops: string }
> = {
  MAEU: {
    name: "Maersk",
    code: "MAEU",
    tracking: "https://www.maersk.com/tracking/",
    ops: "https://www.maersk.com/support",
  },
  MSCU: {
    name: "MSC Mediterranean Shipping Company",
    code: "MSCU",
    tracking: "https://www.msc.com/track-a-shipment",
    ops: "https://www.msc.com/contact-us",
  },
  CMDU: {
    name: "CMA CGM",
    code: "CMDU",
    tracking: "https://www.cma-cgm.com/ebusiness/tracking",
    ops: "https://www.cma-cgm.com/local-offices",
  },
  HLCU: {
    name: "Hapag-Lloyd",
    code: "HLCU",
    tracking:
      "https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html",
    ops: "https://www.hapag-lloyd.com/en/services-information/offices-localinfo.html",
  },
  COSU: {
    name: "COSCO SHIPPING Lines",
    code: "COSU",
    tracking: "https://elines.coscoshipping.com/ebusiness/cargoTracking",
    ops: "https://lines.coscoshipping.com/home/Contact/contact",
  },
  ONEY: {
    name: "Ocean Network Express",
    code: "ONEY",
    tracking:
      "https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking",
    ops: "https://www.one-line.com/en/standard-page/contact-us",
  },
  EGLV: {
    name: "Evergreen Line",
    code: "EGLV",
    tracking: "https://www.evergreen-line.com/",
    ops: "https://www.evergreen-line.com/",
  },
  OOLU: {
    name: "OOCL",
    code: "OOLU",
    tracking:
      "https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx",
    ops: "https://www.oocl.com/eng/aboutoocl/customerservice/Pages/default.aspx",
  },
  HDMU: {
    name: "HMM",
    code: "HDMU",
    tracking:
      "https://www.hmm21.com/e-service/general/trackNTrace/TrackNTrace.do",
    ops: "https://www.hmm21.com/company.do",
  },
  YMLU: {
    name: "Yang Ming",
    code: "YMLU",
    tracking:
      "https://www.yangming.com/e-service/track_trace/track_trace_cargo_tracking.aspx",
    ops: "https://www.yangming.com/contact_us/contact_us.aspx",
  },
  ZIMU: {
    name: "ZIM",
    code: "ZIMU",
    tracking: "https://www.zim.com/tools/track-a-shipment",
    ops: "https://www.zim.com/contact-us",
  },
};

const destinations: Record<
  Destination,
  {
    name: string;
    program: string;
    kind: "ordinary" | "preferential" | "mixed";
    status: string;
    proof: string;
    rules: string[];
    source: string;
    url: string;
  }
> = {
  US: {
    name: "United States",
    program: "Nepal Trade Preference Program (NTPP)",
    kind: "mixed",
    status: "Lapsed 31 Dec 2025",
    proof: "Ordinary chamber COO only; no active NTPP claim in this ruleset",
    rules: [
      "Do not claim preferential status while the program is lapsed",
      "Importer should verify current HTS treatment",
      "Ordinary COO may still support non-preferential origin",
    ],
    source: "USTR 2026 Trade Policy Agenda",
    url: "https://ustr.gov/sites/default/files/files/Press/Releases/2026/2026%20Trade%20Policy%20Agenda%202025%20Annual%20Report.pdf",
  },
  UK: {
    name: "United Kingdom",
    program: "Developing Countries Trading Scheme — Comprehensive Preferences",
    kind: "preferential",
    status: "Available subject to product rules",
    proof: "Exporter origin declaration on a commercial document",
    rules: [
      "Confirm HS-specific origin rule",
      "Maintain production and supplier evidence for 3 years",
      "Include the prescribed origin declaration data",
    ],
    source: "UK Government — DCTS claims",
    url: "https://www.gov.uk/guidance/how-to-claim-preferences-under-the-developing-countries-trading-scheme-dcts",
  },
  EU: {
    name: "European Union",
    program: "Everything But Arms (EU GSP)",
    kind: "preferential",
    status: "Available subject to product rules",
    proof: "REX statement on origin",
    rules: [
      "REX registration required when applicable",
      "Use statement on origin on invoice or other commercial document",
      "Confirm Annex 22-03 product-specific rule",
    ],
    source: "European Commission — GSP and REX",
    url: "https://taxation-customs.ec.europa.eu/customs/rules-origin-goods/preferential-rules-origin/generalised-system-preferences-gsp_en",
  },
  CA: {
    name: "Canada",
    program: "Least Developed Country Tariff (LDCT)",
    kind: "preferential",
    status: "Available subject to product rules",
    proof:
      "Form A, exporter statement, or B255 for certain textile/apparel goods",
    rules: [
      "Confirm Nepal remains eligible in current tariff list",
      "Use B255 where textile/apparel-specific rules require it",
      "Importer must possess proof when claiming",
    ],
    source: "Canada Border Services Agency — LDCT guide",
    url: "https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/ldct-tpmd-eng.html",
  },
  AU: {
    name: "Australia",
    program: "Australian System of Tariff Preferences — LDC",
    kind: "preferential",
    status: "Available subject to origin rules",
    proof: "Manufacturer declaration; Form A is an alternative",
    rules: [
      "No prescribed manufacturer-declaration form",
      "Refer to the applicable Customs Act origin provision",
      "Official certification of Form A is not required by Australia",
    ],
    source: "Australian Border Force — developing/LDC preferences",
    url: "https://www.abf.gov.au/fta/Pages/fta-countries/developing-countries-or-least-developed-countries.aspx",
  },
  GULF: {
    name: "Gulf countries (GCC)",
    program: "No Nepal–GCC preferential certificate encoded",
    kind: "ordinary",
    status: "Ordinary COO baseline",
    proof:
      "Nepal chamber-certified non-preferential COO; confirm destination-state legalization/product rules",
    rules: [
      "Select the actual GCC member before filing",
      "Check importer and product-specific requirements",
      "Do not describe this COO as preferential",
    ],
    source: "GCC Secretariat — Customs Union procedures",
    url: "https://www.gcc-sg.org/en-us/CooperationAndAchievements/Achievements/CustomsCooperation/TheCustomsUnion/Pages/PracticalproceduresfortheestablishmentoftheCustomsUnionoftheGCC.aspx",
  },
  CN: {
    name: "China",
    program: "China LDC special preference / applicable arrangement",
    kind: "mixed",
    status: "Eligibility must be confirmed per tariff line",
    proof:
      "Prescribed preferential COO where eligible; ordinary chamber COO otherwise",
    rules: [
      "Confirm Nepal is a beneficiary for the shipment date and HS line",
      "Use the prescribed official form and authorized issuing body",
      "Record six-digit HS code and exact origin criterion",
    ],
    source: "General Administration of Customs China — LDC COO rules",
    url: "https://www.customs.gov.cn/eportal/attachDir/customs/2026/01/2026010510090697923.pdf",
  },
  IN: {
    name: "India",
    program: "India–Nepal Treaty of Trade",
    kind: "preferential",
    status: "Preferential route available subject to Article V",
    proof:
      "Treaty-prescribed certificate certified for the Government of Nepal",
    rules: [
      "Confirm manufacturing activity in Nepal",
      "Apply Treaty Article V origin criteria",
      "Use the prescribed certificate—not an ordinary destination variant",
    ],
    source: "India Ministry of Commerce — revised Indo–Nepal treaty",
    url: "https://commerce.gov.in/wp-content/uploads/2020/05/nepal.pdf",
  },
};

const fields: Record<string, { label: string; key: keyof FormData }[]> = {
  Parties: [
    { label: "Exporter / shipper", key: "exporterName" },
    { label: "Exporter address", key: "exporterAddress" },
    { label: "PAN / registration", key: "exporterTaxId" },
    { label: "Consignee", key: "consigneeName" },
    { label: "Consignee address", key: "consigneeAddress" },
    { label: "Notify party", key: "notifyParty" },
  ],
  Invoice: [
    { label: "Invoice number", key: "invoiceNo" },
    { label: "Invoice date", key: "invoiceDate" },
    { label: "Currency", key: "currency" },
    { label: "Invoice value", key: "invoiceValue" },
    { label: "Incoterm", key: "incoterm" },
  ],
  Transport: [
    { label: "MAWB / B/L number", key: "documentNo" },
    { label: "Carrier / airline", key: "carrier" },
    { label: "Carrier code / SCAC", key: "carrierCode" },
    { label: "Estimated departure", key: "estimatedDeparture" },
    { label: "Place of departure", key: "departure" },
    { label: "Final destination", key: "destination" },
    { label: "Flight / voyage", key: "flightVoyage" },
    { label: "Port of loading", key: "loadingPort" },
    { label: "Port of discharge", key: "dischargePort" },
  ],
};

const Cell = ({
  n,
  label,
  children,
  className = "",
}: {
  n?: string;
  label: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={`form-cell ${className}`}>
    <small>
      {n && `${n}. `}
      {label}
    </small>
    <div>{children}</div>
  </div>
);

function AwbForm({ d, lines, boxes, divisor, houseIssuerName }: { d: FormData; lines: Goods[]; boxes: PackingBox[]; divisor: number; houseIssuerName?: string }) {
  const totals = shipmentMetrics(boxes, lines, divisor);
  const isHawb = Boolean(houseIssuerName);
  const awbNumber = isHawb ? d.hawbNumber : d.documentNo;
  const issuer = houseIssuerName || d.carrier;
  return (
    <div className="official-form awb-form">
      <div className="awb-no top">{awbNumber || (isHawb ? "HOUSE AWB NUMBER" : "___ — __________")}</div>
      <div className="form-title">
        <span>{isHawb ? "Issued by / House air waybill copy" : "Issued by / Airline copy"}</span>
        <h2>{isHawb ? "HOUSE AIR WAYBILL" : "AIR WAYBILL"}</h2>
        <b>Not Negotiable</b>
      </div>
      <div className="form-grid two">
        <Cell label="Shipper's Name and Address">
          <b>{d.exporterName}</b>
          <br />
          {d.exporterAddress}
        </Cell>
        <Cell label={isHawb ? "House Air Waybill issued by" : "Air Waybill issued by"}>
          <b>{issuer}</b>
          <br />
          {isHawb ? "Main User / client name and address applied by issuer" : "Carrier address / logo applied by issuing carrier"}
        </Cell>
        <Cell label="Consignee's Name and Address">
          <b>{d.consigneeName}</b>
          <br />
          {d.consigneeAddress}
        </Cell>
        <Cell label="Accounting Information">
          Invoice {d.invoiceNo}
          <br />
          Payment / credit details to be completed by carrier
        </Cell>
      </div>
      <div className="form-grid route">
        <Cell label="Airport of Departure (Addr. of First Carrier) and Requested Routing">
          {d.departure}
        </Cell>
        <Cell label="To">—</Cell>
        <Cell label="By First Carrier">{d.carrier}</Cell>
        <Cell label="To">{d.destination}</Cell>
        <Cell label="By">—</Cell>
        <Cell label="Currency">{d.currency}</Cell>
        <Cell label="CHGS Code">PP / CC</Cell>
        <Cell label="Declared Value for Carriage">NVD</Cell>
        <Cell label="Declared Value for Customs">NCV</Cell>
      </div>
      <Cell label="Airport of Destination / Flight-Date" className="full">
        {d.destination} &nbsp; · &nbsp; {d.flightVoyage}
      </Cell>
      <Cell label="Handling Information" className="full">
        Special handling codes, regulatory statements and emergency contact to
        be completed as applicable.
      </Cell>
      <table className="cargo-table">
        <thead>
          <tr>
            <th>No. of Pieces</th>
            <th>Gross Weight</th>
            <th>kg/lb</th>
            <th>Rate Class</th>
            <th>Chargeable Weight</th>
            <th>Rate / Charge</th>
            <th>Total</th>
            <th>Nature and Quantity of Goods</th>
          </tr>
        </thead>
        <tbody>
            <tr>
              <td>{totals.pieces}</td>
              <td>{totals.actualKg.toFixed(2)}</td>
              <td>K</td>
              <td>Q</td>
              <td>{totals.chargeableKg.toFixed(2)}</td>
              <td>—</td>
              <td>—</td>
              <td>
                {lines.map((g, i) => <div key={i}><b>HS {g.hsCode || "pending"}</b> — {g.description || `Goods item ${i + 1}`}</div>)}
              </td>
            </tr>
        </tbody>
      </table>
      <div className="charges-grid">
        <Cell label="Prepaid Weight Charge">—</Cell>
        <Cell label="Collect Weight Charge">—</Cell>
        <Cell label="Other Charges">—</Cell>
        <Cell label="Total Prepaid">—</Cell>
        <Cell label="Total Collect">—</Cell>
      </div>
      <p className="legal-small">
        Shipper certifies that the particulars on the face hereof are correct
        and, insofar as any part of the consignment contains dangerous goods,
        such part is properly described and is in proper condition for carriage
        by air according to applicable regulations.
      </p>
      <div className="signature-row">
        <span>Signature of Shipper or Agent</span>
        <span>Executed on (date) at (place)</span>
        <span>Signature of Issuing Carrier or its Agent</span>
      </div>
      <div className="awb-no bottom">{awbNumber || (isHawb ? "HOUSE AWB NUMBER" : "___ — __________")}</div>
    </div>
  );
}

function BlForm({ d, lines, boxes, divisor, houseIssuerName }: { d: FormData; lines: Goods[]; boxes: PackingBox[]; divisor: number; houseIssuerName?: string }) {
  const totals = shipmentMetrics(boxes, lines, divisor);
  const isHouse = Boolean(houseIssuerName);
  const billNumber = isHouse ? d.hblNumber : d.documentNo;
  return (
    <div className="official-form bl-form">
      <div className="bl-head">
        <div>
          <small>{isHouse ? "Freight forwarder / NVOCC issuing this house bill" : "Carrier / NVOCC name and address"}</small>
          <b>{houseIssuerName || d.carrier}</b>
          {isHouse && <span>Underlying ocean carrier: {d.carrier}</span>}
        </div>
        <div>
          <h2>{isHouse ? "HOUSE BILL OF LADING" : "BILL OF LADING"}</h2>
          <span>{isHouse ? "HBL" : "B/L"} No. {billNumber || "______________"}</span>
          <b>{isHouse ? d.hblReleaseType : "ORIGINAL"}</b>
        </div>
      </div>
      <div className="form-grid two">
        <Cell label="Shipper / Exporter">
          <b>{d.exporterName}</b>
          <br />
          {d.exporterAddress}
        </Cell>
        <Cell label={isHouse ? "Master B/L No. / Export References" : "Booking No. / Export References"}>
          {isHouse && <>Master B/L: {d.documentNo || "Pending"}<br /></>}
          Invoice {d.invoiceNo}
        </Cell>
        <Cell label="Consignee (or order)">
          <b>{d.consigneeName}</b>
          <br />
          {d.consigneeAddress}
        </Cell>
        <Cell label={isHouse ? "House Bill Issuer / Forwarder Reference" : "Forwarding Agent / FMC Reference"}>
          {isHouse ? houseIssuerName : "To be completed by carrier"}
        </Cell>
        <Cell label="Notify Party">
          {d.notifyParty}
          <br />
          {d.consigneeAddress}
        </Cell>
        <Cell label="Domestic Routing / Export Instructions">
          {d.departure} to {d.loadingPort}
        </Cell>
      </div>
      <div className="form-grid route bl-route">
        <Cell label="Pre-carriage by">—</Cell>
        <Cell label="Place of Receipt">{d.departure}</Cell>
        <Cell label="Ocean Vessel / Voyage">{d.flightVoyage}</Cell>
        <Cell label="Port of Loading">{d.loadingPort}</Cell>
        <Cell label="Port of Discharge">{d.dischargePort}</Cell>
        <Cell label="Place of Delivery">{d.destination}</Cell>
      </div>
      <table className="cargo-table bl-cargo">
        <thead>
          <tr>
            <th>Marks & Numbers / Container & Seal</th>
            <th>No. and Kind of Packages</th>
            <th>Description of Packages and Goods</th>
            <th>Gross Weight</th>
            <th>Measurement</th>
          </tr>
        </thead>
        <tbody>
            <tr>
              <td>
                SHIPPER'S MARKS
                <br />
                {d.invoiceNo} · Container /
                seal: TBA
              </td>
              <td>{totals.pieces} BOX{totals.pieces === 1 ? "" : "ES"}</td>
              <td>
                <b>SAID TO CONTAIN</b>
                <br />
                {lines.map((g, i) => <div key={i}><b>HS {g.hsCode || "pending"}</b> — {g.description || `Goods item ${i + 1}`}</div>)}
              </td>
              <td>{totals.actualKg.toFixed(2)} kg</td>
              <td>{totals.cbm.toFixed(4)} m³</td>
            </tr>
        </tbody>
      </table>
      <div className="form-grid two lower">
        <Cell label="Freight and Charges">
          Freight: as arranged
          <br />
          {d.incoterm}
        </Cell>
        <Cell label="Revenue Tons / Rate / Prepaid / Collect">
          To be completed by carrier
        </Cell>
        <Cell label="Number of Original Bills of Lading">
          {isHouse ? d.hblOriginals : "THREE (3), unless carrier states otherwise"}
        </Cell>
        <Cell label="Place and Date of Issue">
          {d.loadingPort} · {d.invoiceDate}
        </Cell>
      </div>
      <p className="legal-small">
        Received by the {isHouse ? "house bill issuer" : "carrier"} from the shipper in apparent good order and
        condition, except as noted, the goods described above for carriage
        subject to the {isHouse ? "issuing freight forwarder’s/NVOCC’s house bill terms and the underlying carrier contract" : "carrier's applicable bill of lading terms and conditions"}.
        This draft is not an issued or transferable transport document.
      </p>
      <div className="signature-row">
        <span>Shipped on board date</span>
        <span>For the {isHouse ? "House Bill Issuer" : "Carrier"} — authorized signature</span>
      </div>
    </div>
  );
}

function FormA({ d, destination }: { d: FormData; destination: string }) {
  return (
    <div className="official-form coo-grid">
      <div className="coo-heading">
        <div>
          <b>GENERALIZED SYSTEM OF PREFERENCES</b>
          <h2>CERTIFICATE OF ORIGIN</h2>
          <span>(Combined declaration and certificate)</span>
          <strong>FORM A</strong>
        </div>
        <div>
          Reference No. __________
          <br />
          Issued in NEPAL
        </div>
      </div>
      <div className="form-grid two numbered">
        <Cell n="1" label="Goods consigned from">
          <b>{d.exporterName}</b>
          <br />
          {d.exporterAddress}, NEPAL
        </Cell>
        <Cell n="2" label="Goods consigned to">
          <b>{d.consigneeName}</b>
          <br />
          {d.consigneeAddress}
        </Cell>
        <Cell n="3" label="Means of transport and route (as far as known)">
          {d.flightVoyage}; {d.departure} to {d.destination}
        </Cell>
        <Cell n="4" label="For official use">
          Preference claim subject to customs review
        </Cell>
      </div>
      <table className="cargo-table form-a-table">
        <thead>
          <tr>
            <th>5. Item no.</th>
            <th>6. Marks and numbers</th>
            <th>7. Number and kind of packages; description</th>
            <th>8. Origin criterion</th>
            <th>9. Gross weight or quantity</th>
            <th>10. Invoice no. and date</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>As addressed</td>
            <td>
              {d.goods.packages}; {d.goods.description}; HS {d.goods.hsCode}
            </td>
            <td>{d.goods.originCriterion}</td>
            <td>
              {d.goods.grossWeight}; {d.goods.quantity}
            </td>
            <td>
              {d.invoiceNo}
              <br />
              {d.invoiceDate}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="form-grid two declarations">
        <Cell n="11" label="Certification">
          It is hereby certified, on the basis of control carried out, that the
          declaration by the exporter is correct.
          <div className="sign-line">
            Place and date; signature and stamp of certifying authority
          </div>
        </Cell>
        <Cell n="12" label="Declaration by the exporter">
          The undersigned declares that the details above are correct, that the
          goods were produced in <b>NEPAL</b>, and comply with the origin
          requirements for export to <b>{destination.toUpperCase()}</b>.
          <div className="sign-line">
            Place and date; signature of authorized signatory
          </div>
        </Cell>
      </div>
    </div>
  );
}

function StatementOrigin({ d, kind }: { d: FormData; kind: "UK" | "EU" }) {
  let uk = kind === "UK";
  return (
    <div className="official-form statement-form">
      <div className="statement-head">
        <div>
          <small>{d.exporterName}</small>
          <h2>COMMERCIAL INVOICE</h2>
          <p>
            Invoice carrying{" "}
            {uk ? "UK DCTS origin declaration" : "EU GSP statement on origin"}
          </p>
        </div>
        <div>
          <b>{d.invoiceNo}</b>
          <br />
          {d.invoiceDate}
        </div>
      </div>
      <div className="form-grid two">
        <Cell label="Exporter">
          <b>{d.exporterName}</b>
          <br />
          {d.exporterAddress}
          <br />
          {d.exporterTaxId}
        </Cell>
        <Cell label="Bill to / Consignee">
          <b>{d.consigneeName}</b>
          <br />
          {d.consigneeAddress}
        </Cell>
        <Cell label="Shipment">
          {d.departure} → {d.destination}
          <br />
          {d.flightVoyage}
        </Cell>
        <Cell label="Terms">
          {d.incoterm}
          <br />
          {d.currency} {d.invoiceValue}
        </Cell>
      </div>
      <table className="cargo-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>HS code</th>
            <th>Packages / Qty.</th>
            <th>Net / Gross</th>
            <th>Origin</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{d.goods.description}</td>
            <td>{d.goods.hsCode}</td>
            <td>
              {d.goods.packages}
              <br />
              {d.goods.quantity}
            </td>
            <td>
              {d.goods.netWeight}
              <br />
              {d.goods.grossWeight}
            </td>
            <td>Nepal</td>
            <td>
              {d.currency} {d.invoiceValue}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="origin-statement">
        <b>
          {uk
            ? "ORIGIN DECLARATION — UK DCTS"
            : "STATEMENT ON ORIGIN — EU GSP / REX"}
        </b>
        {uk ? (
          <p>
            The exporter of the products covered by this document (customs
            identification No. __________) declares that, except where otherwise
            clearly indicated, these products are of NEPAL preferential origin
            in accordance with the rules of origin of the Developing Countries
            Trading Scheme of the UK and that the origin criterion met is{" "}
            {d.goods.originCriterion}.
          </p>
        ) : (
          <p>
            The exporter {`{REX number: __________}`} of the products covered by
            this document declares that, except where otherwise clearly
            indicated, these products are of NEPAL preferential origin according
            to rules of origin of the Generalised System of Preferences of the
            European Union and that the origin criterion met is{" "}
            {d.goods.originCriterion}.
          </p>
        )}
        <div className="sign-line">
          Place and date · Name and signature of exporter
        </div>
      </div>
    </div>
  );
}

function TreatyCoo({ d, kind }: { d: FormData; kind: "IN" | "CN" }) {
  let india = kind === "IN";
  return (
    <div className="official-form coo-grid treaty">
      <div className="coo-heading">
        <div>
          <b>
            {india
              ? "TREATY OF TRADE BETWEEN INDIA AND NEPAL"
              : "SPECIAL PREFERENTIAL TARIFF TREATMENT"}
          </b>
          <h2>CERTIFICATE OF ORIGIN</h2>
          <span>(Combined declaration and certificate)</span>
        </div>
        <div>
          Certificate No. __________
          <br />
          Issued in NEPAL
        </div>
      </div>
      <div className="form-grid two numbered">
        <Cell n="1" label="Exporter / Goods consigned from">
          <b>{d.exporterName}</b>
          <br />
          {d.exporterAddress}
        </Cell>
        <Cell
          n="2"
          label={india ? "Consignee / Goods consigned to" : "Producer"}
        >
          {india ? (
            <>
              <b>{d.consigneeName}</b>
              <br />
              {d.consigneeAddress}
            </>
          ) : (
            <>SAME / available upon request</>
          )}
        </Cell>
        {!india && (
          <Cell n="3" label="Consignee">
            <b>{d.consigneeName}</b>
            <br />
            {d.consigneeAddress}
          </Cell>
        )}
        <Cell n={india ? "3" : "4"} label="Means of transport and route">
          {d.departure} → {d.destination}; {d.flightVoyage}
        </Cell>
        <Cell n={india ? "4" : "5"} label="For official use / references">
          Invoice {d.invoiceNo}
        </Cell>
      </div>
      <table className="cargo-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Marks & packages</th>
            <th>Description of goods</th>
            <th>HS code</th>
            <th>Origin criterion</th>
            <th>Quantity / weight</th>
            <th>Invoice</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>{d.goods.packages}</td>
            <td>{d.goods.description}</td>
            <td>{d.goods.hsCode}</td>
            <td>{d.goods.originCriterion}</td>
            <td>
              {d.goods.quantity}
              <br />
              {d.goods.grossWeight}
            </td>
            <td>
              {d.invoiceNo}
              <br />
              {d.invoiceDate}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="form-grid two declarations">
        <Cell n={india ? "12" : "13"} label="Declaration by exporter">
          The undersigned declares that the details are correct, the goods were
          produced in Nepal, and they comply with the applicable origin
          requirements for export to {india ? "India" : "China"}.
          <div className="sign-line">Place, date and authorized signature</div>
        </Cell>
        <Cell
          n={india ? "13" : "14"}
          label="Certification by competent authority"
        >
          Certified on the basis of control carried out. For the Government /
          authorized issuing authority of Nepal.
          <div className="sign-line">
            Place, date, signature and official stamp
          </div>
        </Cell>
      </div>
      {india && (
        <Cell
          n="14"
          label="For official use of Indian Customs"
          className="full"
        >
          Consignment examined and preference allowed / remarks:
          ____________________
        </Cell>
      )}
    </div>
  );
}

function OrdinaryCoo({ d, destination }: { d: FormData; destination: string }) {
  return (
    <div className="official-form ordinary-coo">
      <div className="ordinary-head">
        <div className="emblem">
          NEPAL
          <br />
          <small>ISSUER SPACE</small>
        </div>
        <div>
          <h2>CERTIFICATE OF ORIGIN</h2>
          <b>NON-PREFERENTIAL</b>
          <p>Issued by an authorized Chamber / competent body</p>
        </div>
        <div>
          Certificate No.
          <br />
          <b>____________</b>
        </div>
      </div>
      <div className="form-grid two">
        <Cell label="Exporter">
          <b>{d.exporterName}</b>
          <br />
          {d.exporterAddress}
        </Cell>
        <Cell label="Consignee">
          <b>{d.consigneeName}</b>
          <br />
          {d.consigneeAddress}
        </Cell>
        <Cell label="Country of origin">
          <b>NEPAL</b>
        </Cell>
        <Cell label="Country of destination">
          <b>{destination}</b>
        </Cell>
        <Cell label="Transport details">
          {d.flightVoyage}
          <br />
          {d.departure} → {d.destination}
        </Cell>
        <Cell label="Invoice">
          {d.invoiceNo} dated {d.invoiceDate}
        </Cell>
      </div>
      <table className="cargo-table">
        <thead>
          <tr>
            <th>Marks and numbers</th>
            <th>Number and kind of packages</th>
            <th>Description of goods</th>
            <th>HS code</th>
            <th>Quantity / gross weight</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>As addressed</td>
            <td>{d.goods.packages}</td>
            <td>{d.goods.description}</td>
            <td>{d.goods.hsCode}</td>
            <td>
              {d.goods.quantity}
              <br />
              {d.goods.grossWeight}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="cert-text">
        We hereby certify, on the basis of documentary evidence produced, that
        the goods described above originate in <b>NEPAL</b>. This document does
        not confer preferential tariff treatment.
      </div>
      <div className="signature-row">
        <span>Exporter declaration / signature</span>
        <span>Place and date</span>
        <span>Authorized chamber signature and stamp</span>
      </div>
    </div>
  );
}

function CommercialInvoice({ d, lines }: { d: FormData; lines: Goods[] }) {
  return (
    <div className="official-form invoice-form">
      <div className="invoice-head">
        <div>
          <h2>COMMERCIAL INVOICE</h2>
          <b>{d.exporterName}</b>
          <p>
            {d.exporterAddress}
            <br />
            {d.exporterTaxId}
          </p>
        </div>
        <div>
          <b>Invoice: {d.invoiceNo}</b>
          <br />
          Date: {d.invoiceDate}
          <br />
          Currency: {d.currency}
        </div>
      </div>
      <div className="form-grid two">
        <Cell label="Exporter / Seller">
          {d.exporterName}
          <br />
          {d.exporterAddress}
        </Cell>
        <Cell label="Consignee / Buyer">
          {d.consigneeName}
          <br />
          {d.consigneeAddress}
        </Cell>
        <Cell label="Country of origin">Nepal</Cell>
        <Cell label="Country of final destination">{d.destination}</Cell>
        <Cell label="Terms of delivery and payment">
          {d.incoterm}
          <br />
          Payment terms: as agreed
        </Cell>
        <Cell label="Transport reference">
          {d.documentNo || "Pending"} · {d.carrier}
          <br />
          {d.flightVoyage}
        </Cell>
      </div>
      <table className="cargo-table invoice-lines">
        <thead>
          <tr>
            <th>Line</th>
            <th>Description of goods</th>
            <th>HS code</th>
            <th>Packages</th>
            <th>Quantity</th>
            <th>Net weight</th>
            <th>Gross weight</th>
            <th>Line value</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((g, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{g.description}</td>
              <td>{g.hsCode}</td>
              <td>{g.packages}</td>
              <td>{g.quantity}</td>
              <td>{g.netWeight}</td>
              <td>{g.grossWeight}</td>
              <td>{i === 0 ? `${d.currency} ${d.invoiceValue}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="invoice-total">
        <span>Invoice total</span>
        <b>
          {d.currency} {d.invoiceValue}
        </b>
      </div>
      <div className="cert-text">
        We certify that this invoice is true and correct and that the goods are
        of Nepal origin except where otherwise stated. Values, classification,
        origin and preference eligibility remain subject to customs
        verification.
      </div>
      <div className="signature-row">
        <span>Prepared by</span>
        <span>Authorized signature and company stamp</span>
      </div>
    </div>
  );
}

function PackingList({
  d,
  lines,
  boxes,
  divisor,
}: {
  d: FormData;
  lines: Goods[];
  boxes: PackingBox[];
  divisor: number;
}) {
  const metrics = boxes.map((b) => boxMetrics(b, divisor));
  const totalCbm = metrics.reduce((s, m) => s + m.cbm, 0);
  const totalActual = boxes.reduce((s, b) => s + b.actualWeightKg, 0);
  const totalVol = metrics.reduce((s, m) => s + m.volumetricKg, 0);
  const perBoxChargeable = metrics.reduce((s, m) => s + m.chargeableKg, 0);
  return (
    <div className="official-form packing-form">
      <div className="invoice-head">
        <div>
          <h2>PACKING LIST</h2>
          <b>{d.exporterName}</b>
          <p>{d.exporterAddress}</p>
        </div>
        <div>
          <b>Related invoice: {d.invoiceNo}</b>
          <br />
          Date: {d.invoiceDate}
          <br />
          Transport document: {d.documentNo || "Pending"}
        </div>
      </div>
      <div className="form-grid two">
        <Cell label="Consignee">
          {d.consigneeName}
          <br />
          {d.consigneeAddress}
        </Cell>
        <Cell label="Shipment routing">
          {d.departure} → {d.destination}
          <br />
          {d.carrier}; {d.flightVoyage}
        </Cell>
      </div>
      <table className="cargo-table invoice-lines">
        <thead>
          <tr>
            <th>Package marks / line</th>
            <th>Package type and count</th>
            <th>Contents / description</th>
            <th>HS code</th>
            <th>Quantity</th>
            <th>Net weight</th>
            <th>Gross weight</th>
            <th>Dimensions / volume</th>
          </tr>
        </thead>
        <tbody>
          {boxes.map((box, i) => (
            <tr key={box.id}>
              <td>
                {d.invoiceNo}/{String(i + 1).padStart(2, "0")}
              </td>
              <td>1 box</td>
              <td>
                {Object.entries(box.allocations)
                  .filter(([, q]) => q > 0)
                  .map(
                    ([line, q]) => `${lines[Number(line)]?.description}: ${q}`,
                  )
                  .join("; ") || "Awaiting allocation"}
              </td>
              <td>
                {Object.keys(box.allocations)
                  .filter((k) => box.allocations[Number(k)] > 0)
                  .map((k) => lines[Number(k)]?.hsCode)
                  .filter(Boolean)
                  .join(", ")}
              </td>
              <td>
                {Object.values(box.allocations).reduce((s, q) => s + q, 0)}
              </td>
              <td>—</td>
              <td>{box.actualWeightKg.toFixed(2)} kg</td>
              <td>
                {box.lengthCm} × {box.widthCm} × {box.heightCm} cm
                <br />
                {metrics[i].cbm.toFixed(4)} CBM
                <br />
                {metrics[i].volumetricKg.toFixed(2)} kg vol.
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="packing-summary">
        <span>
          Total boxes <b>{boxes.length}</b>
        </span>
        <span>
          Total CBM <b>{totalCbm.toFixed(4)}</b>
        </span>
        <span>
          Actual weight <b>{totalActual.toFixed(2)} kg</b>
        </span>
        <span>
          Volumetric weight <b>{totalVol.toFixed(2)} kg</b>
        </span>
        <span>
          Shipment aggregate max{" "}
          <b>{Math.max(totalActual, totalVol).toFixed(2)} kg</b>
        </span>
        <span>
          Sum of each-box higher weight <b>{perBoxChargeable.toFixed(2)} kg</b>
        </span>
        <strong>
          Final displayed chargeable weight:{" "}
          {Math.max(Math.max(totalActual, totalVol), perBoxChargeable).toFixed(
            2,
          )}{" "}
          kg
        </strong>
      </div>
      <div className="cert-text">
        Packing declaration: the packages listed above contain the goods
        described and are marked for the stated consignee. Wood-packaging,
        dangerous-goods, temperature-control and special-handling declarations
        must be added where applicable.
      </div>
      <div className="signature-row">
        <span>Warehouse / packer</span>
        <span>Checked by</span>
        <span>Authorized signature and date</span>
      </div>
    </div>
  );
}

function PhytosanitaryCertificate({ d, lines }: { d: FormData; lines: Goods[] }) {
  return (
    <div className="official-form phyto-form">
      <div className="phyto-head">
        <div>
          <b>Government of Nepal</b>
          <span>Ministry of Agriculture and Livestock Development</span>
          <span>Plant Quarantine and Pesticide Management Centre</span>
        </div>
        <div>
          <h2>PHYTOSANITARY CERTIFICATE</h2>
          <small>Draft application data · official certificate issued through NNSW/PQPMC</small>
        </div>
      </div>
      <div className="form-grid two">
        <Cell label="Phytosanitary certificate number">Assigned by issuing authority</Cell>
        <Cell label="Request reference">Assigned by NNSW</Cell>
        <Cell label="Approval date">Pending authority approval</Cell>
        <Cell label="Request date">{new Date().toLocaleDateString()}</Cell>
        <Cell label="Exit point / exit within">{d.departure}</Cell>
        <Cell label="Invoice number / date">{d.invoiceNo} · {d.invoiceDate}</Cell>
      </div>
      <div className="phyto-to">
        <b>From: Plant Protection Organization of Nepal</b>
        <b>To: Plant Protection Organization(s) of {d.destination}</b>
      </div>
      <h3>I. DESCRIPTION OF CONSIGNMENT</h3>
      <div className="form-grid two">
        <Cell label="Name and address of exporter"><b>{d.exporterName}</b><br />{d.exporterAddress}</Cell>
        <Cell label="Declared name and address of consignee"><b>{d.consigneeName}</b><br />{d.consigneeAddress}</Cell>
        <Cell label="Date of inspection">To be completed by PQPMC</Cell>
        <Cell label="Distinguishing marks">{d.invoiceNo}</Cell>
        <Cell label="Purpose / end use">Declare in NNSW application</Cell>
        <Cell label="Declared mode of conveyance / point of entry">{d.carrier} · {d.destination}</Cell>
      </div>
      <table className="cargo-table phyto-lines">
        <thead><tr><th>Package</th><th>HS code</th><th>Botanical name</th><th>Commercial / WCO description</th><th>Origin</th><th>Quantity</th></tr></thead>
        <tbody>{lines.map((g, i) => <tr key={i}>
          <td>{g.packages || "Pending"}</td><td>{g.hsCode}</td><td>{g.botanicalName || "Required for regulated plants/products"}</td>
          <td>{g.description}</td><td>Nepal</td><td>{g.quantity}</td>
        </tr>)}</tbody>
      </table>
      <p className="legal-small">This draft supplies application data only. PQPMC determines inspection/testing, conformity with the importing country’s current phytosanitary requirements, and the final certification wording.</p>
      <h3>II. ADDITIONAL DECLARATION</h3>
      <Cell label="Import-permit conditions / additional declaration" className="full">To be completed from the destination authority’s import permit, when applicable.</Cell>
      <h3>III. DISINFESTATION AND/OR DISINFECTION TREATMENT</h3>
      <div className="form-grid two">
        <Cell label="Treatment date / treatment">To be completed after official treatment</Cell>
        <Cell label="Chemical (active ingredient)">—</Cell>
        <Cell label="Duration and temperature">—</Cell>
        <Cell label="Concentration / additional information">—</Cell>
      </div>
      <div className="signature-row"><span>Place of issue</span><span>Name and signature of authorized officer</span><span>Official seal</span></div>
    </div>
  );
}

function App() {
  const [data, setData] = useState<FormData>(() => {
    try {
      return { ...initial, ...(JSON.parse(localStorage.getItem("cargoform.v3.shipment") || "null") || {}) };
    } catch {
      return initial;
    }
  });
  const [doc, setDoc] = useState<DocType>("COO");
  const [activeSection, setActiveSection] = useState("Shipment data");
  const [edit, setEdit] = useState(true);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<ShipmentStatus>(
    () =>
      (localStorage.getItem("cargoform.v3.status") as ShipmentStatus) ||
      "DRAFT",
  );
  const [amendments, setAmendments] = useState<Amendment[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("cargoform.v3.amendments") || "[]",
      );
    } catch {
      return [];
    }
  });
  const [amendField, setAmendField] = useState("Consignee / notify party");
  const [amendValue, setAmendValue] = useState("");
  const [amendReason, setAmendReason] = useState("");
  const [extraGoods, setExtraGoods] = useState<Goods[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("cargoform.v4.goods") || "[]");
    } catch {
      return [];
    }
  });
  const [contacts, setContacts] = useState<Contact[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("cargoform.v4.contacts") || "[]");
    } catch {
      return [];
    }
  });
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactRole, setContactRole] =
    useState<Contact["role"]>("CHILD_ACCOUNT");
  const [selectedDocs, setSelectedDocs] = useState<string[]>([
    "MAWB / B/L",
    "Commercial Invoice",
    "Packing List",
  ]);
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  const [boxes, setBoxes] = useState<PackingBox[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("cargoform.v5.boxes") || "[]");
    } catch {
      return [];
    }
  });
  const [airDivisor, setAirDivisor] = useState(6000);
  const [history, setHistory] = useState<SavedShipment[]>(() => {
    try { return JSON.parse(localStorage.getItem("cargoform.v6.history") || "[]"); } catch { return []; }
  });
  const [billing, setBilling] = useState<BillingRecord[]>(() => {
    try { return JSON.parse(localStorage.getItem("cargoform.v6.billing") || "[]"); } catch { return []; }
  });
  const [organisation, setOrganisation] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cargoform.v6.organisation") || "null") || { name: "Himalayan Cargo Workspace", pan: "", currency: "NPR", timezone: "Asia/Kathmandu" }; }
    catch { return { name: "Himalayan Cargo Workspace", pan: "", currency: "NPR", timezone: "Asia/Kathmandu" }; }
  });
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [loggedIn, setLoggedIn] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>(authModeFromPath);
  const registrationMode = authMode === "REGISTER";
  const [authForm, setAuthForm] = useState({ email: "", password: "", confirmPassword: "", newPassword: "", displayName: "", legalName: "", accountType: "ORGANISATION", phone: "", dateOfBirth: "", residentialAddress: "", identityType: "Citizenship / passport", identityNumber: "", registrationNumber: "", panVat: "", registeredAddress: "", contactPerson: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [authMessage, setAuthMessage] = useState(() => authModeFromPath() === "LOGIN" ? "Checking your secure session…" : "");
  const [sessionInfo, setSessionInfo] = useState<AuthSessionInfo | null>(null);
  const [adminApplications, setAdminApplications] = useState<AdminApplication[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminUserCounts, setAdminUserCounts] = useState<AdminUserCounts>({ total: 0, active: 0, disabled: 0, pending: 0 });
  const [adminEmailDelivery, setAdminEmailDelivery] = useState<AdminEmailRecord[]>([]);
  const [adminEmailStatus, setAdminEmailStatus] = useState<AdminEmailStatus>({ connected: false, sender: "app.netpack@gmail.com", queued: 0, failed: 0 });
  const [adminDecisionReasons, setAdminDecisionReasons] = useState<Record<string, string>>({});
  const [adminLoading, setAdminLoading] = useState(false);
  const [passwordChange, setPasswordChange] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordMessage, setPasswordMessage] = useState("");
  const [profile, setProfile] = useState<MainProfile>(() => {
    try { return JSON.parse(localStorage.getItem("cargoform.v7.profile") || "null") || { accountType: "ORGANISATION", status: "DRAFT", fullName: "", dateOfBirth: "", email: "", phone: "", address: "", identityType: "Citizenship / passport", identityNumber: "", legalName: "Himalayan Cargo Workspace", registrationNumber: "", panVat: "", incorporationDate: "", registeredAddress: "", contactPerson: "" }; }
    catch { return { accountType: "ORGANISATION", status: "DRAFT", fullName: "", dateOfBirth: "", email: "", phone: "", address: "", identityType: "Citizenship / passport", identityNumber: "", legalName: "", registrationNumber: "", panVat: "", incorporationDate: "", registeredAddress: "", contactPerson: "" }; }
  });
  const [messages, setMessages] = useState<ChatMessage[]>(() => { try { return JSON.parse(localStorage.getItem("cargoform.v7.messages") || "[]"); } catch { return []; } });
  const [messageThread, setMessageThread] = useState("ADMIN");
  const [messageBody, setMessageBody] = useState("");
  const [notifications, setNotifications] = useState<AppNotification[]>(() => { try { return JSON.parse(localStorage.getItem("cargoform.v7.notifications") || "[]"); } catch { return []; } });
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreference[]>(() => {
    try { return JSON.parse(localStorage.getItem("cargoform.v7.preferences") || "null") || [
      { event: "Registration and Admin decision", email: true, inApp: true, recipient: "Main User" },
      { event: "Staff or Client invitation", email: true, inApp: true, recipient: "Invitee + Main User" },
      { event: "Client shipment submission", email: true, inApp: true, recipient: "Owning Main User only" },
      { event: "Shipment confirmation or departure", email: true, inApp: true, recipient: "Main User + selected Client" },
      { event: "Carrier submission or response", email: true, inApp: true, recipient: "Main User operations" },
      { event: "Amendment status", email: true, inApp: true, recipient: "Requester + Main User" },
      { event: "Document generated or approved", email: false, inApp: true, recipient: "Selected shipment participants" },
      { event: "Invoice, payment or subscription", email: true, inApp: true, recipient: "Billing contacts" },
      { event: "New chat message", email: true, inApp: true, recipient: "Thread participants only" },
    ]; } catch { return []; }
  });
  const [emailConfig, setEmailConfig] = useState(() => { try { return JSON.parse(localStorage.getItem("cargoform.v8.emailConfig") || "null") || { sender: "app.netpack@gmail.com", adminRecipient: "app.netpack@gmail.com", provider: "Gmail OAuth", connected: false }; } catch { return { sender: "app.netpack@gmail.com", adminRecipient: "app.netpack@gmail.com", provider: "Gmail OAuth", connected: false }; } });
  const [emailOutbox, setEmailOutbox] = useState<OutboundEmail[]>(() => { try { return JSON.parse(localStorage.getItem("cargoform.v8.emailOutbox") || "[]"); } catch { return []; } });
  const goodsLines = [data.goods, ...extraGoods];
  const houseIssuerName = data.hawbIssuerName.trim() ||
    (profile.accountType === "ORGANISATION" ? profile.legalName : profile.fullName) ||
    organisation.name || data.exporterName;
  const houseBlIssuerName = data.hblIssuerName.trim() ||
    (profile.accountType === "ORGANISATION" ? profile.legalName : profile.fullName) ||
    organisation.name || data.exporterName;
  const activeDocumentNo = doc === "HAWB" ? data.hawbNumber : doc === "HBL" ? data.hblNumber : data.documentNo;
  const phyto = phytoAssessment(goodsLines);
  const totals = useMemo(
    () => shipmentMetrics(boxes, goodsLines, airDivisor),
    [boxes, data.goods, extraGoods, airDivisor],
  );
  const apiBase = import.meta.env.VITE_API_BASE_URL || "/api";
  useEffect(() => {
    fetch(`${apiBase}/auth/me`, { credentials: "include" }).then(async (response) => {
      if (!response.ok) throw new Error();
      const result = await response.json() as AuthSessionInfo;
      setSessionInfo(result); setLoggedIn(true); setAuthMessage("");
      if (result.role === "PLATFORM_ADMIN") setActiveSection("Admin dashboard");
      if (result.organisation?.legalName) setOrganisation((current: typeof organisation) => ({ ...current, name: result.organisation.legalName }));
    }).catch(() => { setSessionInfo(null); setLoggedIn(false); if (authMode === "LOGIN") setAuthMessage(""); });
  }, [apiBase]);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const gmail = query.get("gmail");
    if (!gmail) return;
    setAuthMessage(gmail === "connected" ? "Gmail connected. Previously failed authorization-related emails are being retried." : "Gmail authorization was not completed. Please try connecting the mailbox again.");
    window.history.replaceState({}, "", window.location.pathname);
  }, []);
  useEffect(() => {
    if (authMode !== "VERIFY") return;
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { setAuthMessage("The verification link is incomplete."); return; }
    setAuthMessage("Verifying your email address…");
    fetch(`${apiBase}/auth/verify-email`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error || "REQUEST_FAILED"); setAuthMessage("Email verified. Your registration is now awaiting Platform Admin approval."); })
      .catch((error) => setAuthMessage(friendlyAuthError(error instanceof Error ? error.message : "REQUEST_FAILED")));
  }, [apiBase, authMode]);
  useEffect(() => {
    if (!loggedIn || sessionInfo?.role !== "PLATFORM_ADMIN") return;
    setAdminLoading(true);
    Promise.allSettled([
      fetch(`${apiBase}/admin/applications`, { credentials: "include" }).then(async (response) => { if (!response.ok) throw new Error("APPLICATIONS_UNAVAILABLE"); return response.json(); }),
      fetch(`${apiBase}/admin/users`, { credentials: "include" }).then(async (response) => { if (!response.ok) throw new Error("USERS_UNAVAILABLE"); return response.json(); }),
      fetch(`${apiBase}/admin/email-delivery`, { credentials: "include" }).then(async (response) => { if (!response.ok) throw new Error("EMAIL_DELIVERY_UNAVAILABLE"); return response.json(); }),
      fetch(`${apiBase}/admin/email-status`, { credentials: "include" }).then(async (response) => { if (!response.ok) throw new Error("EMAIL_STATUS_UNAVAILABLE"); return response.json(); }),
    ]).then(([applications, users, delivery, emailStatus]) => {
      if (applications.status === "fulfilled") setAdminApplications(applications.value);
      if (users.status === "fulfilled") { setAdminUsers(users.value.users); setAdminUserCounts(users.value.counts); }
      if (delivery.status === "fulfilled") setAdminEmailDelivery(delivery.value);
      if (emailStatus.status === "fulfilled") {
        setAdminEmailStatus(emailStatus.value);
        setEmailConfig((current: typeof emailConfig) => ({ ...current, sender: emailStatus.value.sender, connected: emailStatus.value.connected }));
      }
      if ([applications, users, delivery, emailStatus].every((result) => result.status === "rejected")) setAuthMessage("CargoForm could not load the Admin overview. Please refresh the page.");
    })
      .finally(() => setAdminLoading(false));
  }, [apiBase, loggedIn, sessionInfo?.role]);
  useEffect(() => {
    localStorage.setItem("cargoform.v3.shipment", JSON.stringify(data));
    localStorage.setItem("cargoform.v3.status", status);
    localStorage.setItem("cargoform.v3.amendments", JSON.stringify(amendments));
  }, [data, status, amendments]);
  useEffect(() => {
    localStorage.setItem("cargoform.v4.goods", JSON.stringify(extraGoods));
    localStorage.setItem("cargoform.v4.contacts", JSON.stringify(contacts));
  }, [extraGoods, contacts]);
  useEffect(
    () => localStorage.setItem("cargoform.v5.boxes", JSON.stringify(boxes)),
    [boxes],
  );
  useEffect(() => localStorage.setItem("cargoform.v6.history", JSON.stringify(history)), [history]);
  useEffect(() => localStorage.setItem("cargoform.v6.billing", JSON.stringify(billing)), [billing]);
  useEffect(() => localStorage.setItem("cargoform.v6.organisation", JSON.stringify(organisation)), [organisation]);
  useEffect(() => localStorage.setItem("cargoform.v7.profile", JSON.stringify(profile)), [profile]);
  useEffect(() => localStorage.setItem("cargoform.v7.messages", JSON.stringify(messages)), [messages]);
  useEffect(() => localStorage.setItem("cargoform.v7.notifications", JSON.stringify(notifications)), [notifications]);
  useEffect(() => localStorage.setItem("cargoform.v7.preferences", JSON.stringify(notificationPreferences)), [notificationPreferences]);
  useEffect(() => localStorage.setItem("cargoform.v8.emailConfig", JSON.stringify(emailConfig)), [emailConfig]);
  useEffect(() => localStorage.setItem("cargoform.v8.emailOutbox", JSON.stringify(emailOutbox)), [emailOutbox]);
  useEffect(() => {
    const capture = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    const goOnline = () => setOnline(true), goOffline = () => setOnline(false);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("online", goOnline); window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("beforeinstallprompt", capture); window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);
  useEffect(() => {
    const clean = data.documentNo.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const match =
      doc === "MAWB"
        ? airCarriers[clean.slice(0, 3)]
        : doc === "BILL_OF_LADING" || doc === "HBL"
          ? oceanCarriers[clean.slice(0, 4)]
          : undefined;
    if (
      match &&
      (data.carrier !== match.name || data.carrierCode !== match.code)
    )
      setData((d) => ({
        ...d,
        carrier: match.name,
        carrierCode: match.code,
        trackingUrl: match.tracking,
        operationsUrl: match.ops,
      }));
  }, [doc, data.documentNo]);
  const rule = destinations[data.country];
  const errors = useMemo(() => {
    const e: string[] = [];
    if (!data.exporterName || !data.consigneeName)
      e.push("Exporter and consignee are required.");
    if (!/^\d{4}(\.\d{2})?/.test(data.goods.hsCode))
      e.push("Enter at least a 4-digit HS code.");
    if ((doc === "MAWB" || doc === "HAWB") && !data.departure)
      e.push("Departure airport is required for air waybills.");
    if (
      doc === "MAWB" &&
      data.documentNo &&
      !/^\d{3}[ -]?\d{8}$/.test(data.documentNo)
    )
      e.push(
        "MAWB number should contain the 3-digit airline prefix and 8-digit serial/check number.",
      );
    if (doc === "HAWB" && !data.hawbNumber.trim())
      e.push("Enter a House Air Waybill number.");
    if (doc === "HAWB" && !houseIssuerName.trim())
      e.push("Enter the Main User or client name issuing the House Air Waybill.");
    if (doc === "HBL" && !data.hblNumber.trim())
      e.push("Enter a House Bill of Lading number.");
    if (doc === "HBL" && !houseBlIssuerName.trim())
      e.push("Enter the freight forwarder, NVOCC, Main User or approved client issuing the House Bill of Lading.");
    if ((doc === "BILL_OF_LADING" || doc === "HBL") && (!data.loadingPort || !data.dischargePort))
      e.push("Loading and discharge ports are required.");
    if (
      doc === "BILL_OF_LADING" &&
      data.documentNo &&
      data.documentNo.replace(/\s/g, "").length < 8
    )
      e.push(
        "Enter the full carrier Bill of Lading number; no universal B/L length applies.",
      );
    if (
      (doc === "MAWB" || doc === "BILL_OF_LADING" || doc === "HBL") &&
      data.documentNo &&
      !data.carrierCode
    )
      e.push(
        "Carrier was not resolved from the starter directory—select or enter it manually and verify with the issuer.",
      );
    if (
      doc === "COO" &&
      rule.kind !== "ordinary" &&
      !data.goods.originCriterion
    )
      e.push("Origin criterion is required for a preferential proof.");
    if ((doc === "MAWB" || doc === "HAWB" || doc === "BILL_OF_LADING" || doc === "HBL") && boxes.length === 0)
      e.push("Add packing boxes: pieces in transport documents come only from the packing record.");
    if (boxes.length > 0 && boxes.some((box) => box.actualWeightKg <= 0))
      e.push("Every packing box requires an actual weight before shipment confirmation.");
    const enteredGross = goodsLines.reduce((sum, line) => sum + numeric(line.grossWeight), 0);
    if (boxes.length > 0 && enteredGross > 0 && Math.abs(enteredGross - totals.actualKg) > 0.01)
      e.push(`Goods-line gross weight (${enteredGross.toFixed(2)} kg) does not match packing actual weight (${totals.actualKg.toFixed(2)} kg). Packing weight controls MAWB/HAWB/B/L/HBL/email.`);
    return e;
  }, [data, doc, rule, boxes, extraGoods, airDivisor, totals.actualKg, houseIssuerName, houseBlIssuerName]);
  const set = (k: keyof FormData, v: string) =>
    setData((d) => {
      let next = { ...d, [k]: v };
      if (k === "documentNo") {
        const clean = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
        const match =
          doc === "MAWB"
            ? airCarriers[clean.slice(0, 3)]
            : doc === "BILL_OF_LADING" || doc === "HBL"
              ? oceanCarriers[clean.slice(0, 4)]
              : undefined;
        if (match)
          next = {
            ...next,
            carrier: match.name,
            carrierCode: match.code,
            trackingUrl: match.tracking,
            operationsUrl: match.ops,
          };
      }
      return next;
    });
  const setGood = (k: keyof Goods, v: string) =>
    setData((d) => ({ ...d, goods: { ...d.goods, [k]: v } }));
  const setExtraGood = (index: number, k: keyof Goods, v: string) =>
    setExtraGoods((gs) =>
      gs.map((g, i) => (i === index ? { ...g, [k]: v } : g)),
    );
  const addGoodsLine = () =>
    setExtraGoods((gs) => [
      ...gs,
      {
        description: "",
        botanicalName: "",
        hsCode: "",
        packages: "",
        grossWeight: "",
        netWeight: "",
        quantity: "",
        originCriterion: "",
      },
    ]);
  const addContact = () => {
    if (!contactEmail.includes("@")) return;
    setContacts((c) => [
      ...c,
      {
        id: crypto.randomUUID(),
        name: contactName || contactEmail,
        email: contactEmail.trim(),
        role: contactRole,
        status: contactRole === "CHILD_ACCOUNT" ? "INVITED" : "ACTIVE",
      },
    ]);
    setContactName("");
    setContactEmail("");
  };
  const makeEmailDraft = () => {
    const recipients = contacts
      .filter((c) => c.role === "CARRIER")
      .map((c) => c.email);
    const subject = `${activeDocumentNo || "PENDING"} | ${data.destination} | ${totals.actualKg.toFixed(2)} kg | ${totals.pieces} boxes | ${data.consigneeName}`;
    setEmailDraft({
      to: recipients,
      cc: contacts.filter((c) => c.role === "MAIN_USER").map((c) => c.email),
      subject,
      documents: selectedDocs,
      body: `Dear Cargo Operations,\n\nPlease find the shipment details for ${activeDocumentNo || "the pending transport document"}.\nCarrier: ${data.carrier}\nRouting: ${data.departure} to ${data.destination}\nConsignee: ${data.consigneeName}\nPieces: ${totals.pieces} boxes\nActual weight: ${totals.actualKg.toFixed(2)} kg\nVolumetric weight: ${totals.volumetricKg.toFixed(2)} kg\nChargeable weight: ${totals.chargeableKg.toFixed(2)} kg\nCBM: ${totals.cbm.toFixed(4)}\nGoods lines: ${goodsLines.length}\n\nSelected documents: ${selectedDocs.join(", ")}.\n\nPlease review and confirm.`,
    });
  };
  const sendEmail = () => {
    if (!emailDraft || emailDraft.to.length === 0) return;
    const query = new URLSearchParams({
      cc: emailDraft.cc.join(","),
      subject: emailDraft.subject,
      body: `${emailDraft.body}\n\nAttachments to add: ${emailDraft.documents.join(", ")}`,
    });
    window.location.href = `mailto:${emailDraft.to.join(",")}?${query.toString()}`;
  };
  const setBoxCount = (count: number) => {
    const n = Math.max(0, Math.min(100, Math.floor(count || 0)));
    setBoxes((current) =>
      Array.from(
        { length: n },
        (_, i) =>
          current[i] || {
            id: crypto.randomUUID(),
            lengthCm: 0,
            widthCm: 0,
            heightCm: 0,
            actualWeightKg: 0,
            manualCbm: 0,
            allocations: {},
          },
      ),
    );
  };
  const updateBox = (
    index: number,
    key: keyof Omit<PackingBox, "id" | "allocations">,
    value: number,
  ) =>
    setBoxes((bs) =>
      bs.map((b, i) =>
        i === index ? { ...b, [key]: Math.max(0, value || 0) } : b,
      ),
    );
  const allocatedForLine = (lineIndex: number, excludeBox = -1) =>
    boxes.reduce(
      (sum, b, i) =>
        sum + (i === excludeBox ? 0 : b.allocations[lineIndex] || 0),
      0,
    );
  const setAllocation = (
    boxIndex: number,
    lineIndex: number,
    value: number,
  ) => {
    const available = Math.max(
      0,
      numeric(goodsLines[lineIndex].quantity) -
        allocatedForLine(lineIndex, boxIndex),
    );
    const safe = Math.max(0, Math.min(value || 0, available));
    setBoxes((bs) =>
      bs.map((b, i) =>
        i === boxIndex
          ? { ...b, allocations: { ...b.allocations, [lineIndex]: safe } }
          : b,
      ),
    );
  };
  const locked = status === "DEPARTED";
  const addAmendment = () => {
    if (!amendValue.trim() || !amendReason.trim()) return;
    setAmendments((a) => [
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        field: amendField,
        requestedValue: amendValue,
        reason: amendReason,
        status: "DRAFT",
        clause:
          "Subject to carrier acceptance, manifest/customs revalidation, applicable cut-off and amendment fees.",
      },
      ...a,
    ]);
    setAmendValue("");
    setAmendReason("");
  };
  const deleteDraft = () => {
    if (status === "DEPARTED") return;
    if (window.confirm("Delete this pre-departure shipment draft?")) {
      setData(initial);
      setStatus("DRAFT");
      setAmendments([]);
      localStorage.removeItem("cargoform.v3.shipment");
    }
  };
  const title =
    doc === "MAWB"
      ? "MASTER AIR WAYBILL"
      : doc === "HAWB"
        ? "HOUSE AIR WAYBILL"
      : doc === "BILL_OF_LADING"
        ? "BILL OF LADING"
        : doc === "HBL"
          ? "HOUSE BILL OF LADING"
        : doc === "COMMERCIAL_INVOICE"
          ? "COMMERCIAL INVOICE"
          : doc === "PACKING_LIST"
            ? "PACKING LIST"
            : doc === "PHYTOSANITARY"
              ? "PHYTOSANITARY CERTIFICATE"
            : "CERTIFICATE OF ORIGIN";
  const preferenceActive =
    rule.kind === "preferential" ||
    (rule.kind === "mixed" && data.country !== "US");
  const rows =
    doc === "MAWB"
      ? [
          ["Airport of departure", data.departure],
          ["Airport of destination", data.destination],
          ["Issuing carrier", data.carrier],
          ["Flight / routing", data.flightVoyage],
          ["Charges", "Prepaid / collect — to be confirmed"],
        ]
      : doc === "HAWB"
        ? [
            ["House AWB number", data.hawbNumber || "Pending"],
            ["House AWB issuer", houseIssuerName],
            ["Number format", data.hawbNumberFormat || "Free-form"],
            ["Underlying carrier", data.carrier],
            ["Airport of departure", data.departure],
            ["Airport of destination", data.destination],
            ["Flight / routing", data.flightVoyage],
          ]
      : doc === "BILL_OF_LADING"
        ? [
            ["Port of loading", data.loadingPort],
            ["Port of discharge", data.dischargePort],
            ["Vessel / voyage", data.flightVoyage],
            ["Notify party", data.notifyParty],
            ["Freight", "As arranged"],
          ]
        : doc === "HBL"
          ? [
              ["House B/L number", data.hblNumber || "Pending"],
              ["House B/L issuer", houseBlIssuerName],
              ["Number format", data.hblNumberFormat || "Free-form"],
              ["Release / negotiability", data.hblReleaseType],
              ["Underlying master B/L", data.documentNo || "Pending"],
              ["Underlying carrier", data.carrier],
              ["Port of loading", data.loadingPort],
              ["Port of discharge", data.dischargePort],
              ["Vessel / voyage", data.flightVoyage],
            ]
        : doc === "COMMERCIAL_INVOICE" || doc === "PACKING_LIST" || doc === "PHYTOSANITARY"
          ? [
              ["Invoice", `${data.invoiceNo} dated ${data.invoiceDate}`],
              ["Transport document", data.documentNo || "Pending"],
              ["Carrier", data.carrier],
              ["Goods lines", String(goodsLines.length)],
              ["Total value", `${data.currency} ${data.invoiceValue}`],
            ]
          : [
              ["Destination", rule.name],
              [
                "Certificate basis",
                preferenceActive
                  ? rule.program
                  : "Non-preferential / ordinary origin",
              ],
              ["Country of origin", "NEPAL"],
              ["Proof route", rule.proof],
              [
                "Issuing authority",
                "Authorized Nepal chamber / authority, as applicable",
              ],
            ];
  async function exportDocx() {
    const tableRows = [
      ["Field", "Details"],
      ["Exporter", `${data.exporterName}\n${data.exporterAddress}`],
      ["Consignee", `${data.consigneeName}\n${data.consigneeAddress}`],
      ...rows,
      [
        "Goods",
        `${data.goods.description}; HS ${data.goods.hsCode}; ${data.goods.packages}; gross ${data.goods.grossWeight}`,
      ],
      [
        "Invoice",
        `${data.invoiceNo} dated ${data.invoiceDate}; ${data.currency} ${data.invoiceValue}`,
      ],
    ].map(
      (r, i) =>
        new TableRow({
          children: r.map(
            (x) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: x, bold: i === 0 })],
                  }),
                ],
              }),
          ),
        }),
    );
    const d = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: title,
              heading: HeadingLevel.TITLE,
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
              text: `Template v1.0 • Draft generated ${new Date().toLocaleDateString()}`,
              alignment: AlignmentType.CENTER,
            }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: tableRows,
            }),
            new Paragraph({
              text: "Exporter declaration",
              heading: HeadingLevel.HEADING_2,
            }),
            new Paragraph(
              "The undersigned declares that the information above is correct and that the goods originate in Nepal under the basis stated, subject to verification by the competent authority.",
            ),
            new Paragraph(`Manual notes: ${notes || "None"}`),
          ],
        },
      ],
    });
    saveAs(
      await Packer.toBlob(d),
      `${doc.toLowerCase()}-${activeDocumentNo || data.invoiceNo}.docx`,
    );
  }
  const saveShipmentSnapshot = (nextStatus: ShipmentStatus = status) => {
    const snapshot: SavedShipment = { id: crypto.randomUUID(), savedAt: new Date().toISOString(), status: nextStatus, data: structuredClone(data), goods: structuredClone(extraGoods), boxes: structuredClone(boxes) };
    setHistory((items) => [snapshot, ...items]);
  };
  const restoreShipment = (item: SavedShipment) => {
    setData(item.data); setExtraGoods(item.goods); setBoxes(item.boxes); setStatus(item.status); setActiveSection("Shipment data");
  };
  const updateContact = (id: string, patch: Partial<Contact>) => setContacts((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const removeContact = (id: string) => setContacts((items) => items.filter((item) => item.id !== id));
  const addBillingRecord = () => setBilling((items) => [{ id: crypto.randomUUID(), reference: `INV-${String(items.length + 1).padStart(4, "0")}`, party: "Main User organisation", amount: 0, currency: organisation.currency, dueDate: new Date().toISOString().slice(0, 10), status: "DRAFT" }, ...items]);
  const installApp = async () => { if (!installPrompt) return; await installPrompt.prompt(); const result = await installPrompt.userChoice; if (result.outcome === "accepted") setInstallPrompt(null); };
  const openDocument = (kind: DocType) => { setDoc(kind); setActiveSection("Shipment data"); };
  const navigateAuth = (mode: AuthMode) => {
    setAuthMode(mode); setAuthMessage("");
    const path = mode === "RESET" ? "/reset-password" : mode === "VERIFY" ? "/verify-email" : "/";
    if (mode !== "RESET" && mode !== "VERIFY") window.history.replaceState({}, "", path);
  };
  const establishAuthenticatedSession = async () => {
    const sessionResponse = await fetch(`${apiBase}/auth/me`, { credentials: "include" });
    if (!sessionResponse.ok) throw new Error("REQUEST_FAILED");
    const session = await sessionResponse.json() as AuthSessionInfo;
    setSessionInfo(session); setLoggedIn(true); setAuthMessage("");
    if (session.role === "PLATFORM_ADMIN") setActiveSection("Admin dashboard");
  };
  const submitAuthentication = async () => {
    setAuthMessage("Please wait…");
    const route = registrationMode ? "register" : "login";
    const payload = registrationMode
      ? { displayName: authForm.displayName, email: authForm.email, phone: authForm.phone, companyName: authForm.legalName || undefined, password: authForm.password }
      : { identifier: authForm.email, password: authForm.password };
    try {
      const response = await fetch(`${apiBase}/auth/${route}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "REQUEST_FAILED");
      if (registrationMode) { navigateAuth("LOGIN"); setAuthMessage("Registration saved. Verify your email address to submit it for Platform Administrator review."); }
      else await establishAuthenticatedSession();
    } catch (error) { const message = error instanceof Error ? error.message : "REQUEST_FAILED"; setAuthMessage(message === "Failed to fetch" ? "CargoForm could not reach the secure account service. Please try again." : friendlyAuthError(message)); }
  };
  const requestPasswordReset = async () => {
    setAuthMessage("Requesting a secure reset link…");
    try { const response = await fetch(`${apiBase}/auth/forgot-password`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: authForm.email }) }); if (!response.ok) throw new Error("REQUEST_FAILED"); setAuthMessage("If an active account uses that address, a password reset email has been queued."); }
    catch (error) { setAuthMessage(friendlyAuthError(error instanceof Error ? error.message : "REQUEST_FAILED")); }
  };
  const resendVerification = async () => {
    setAuthMessage("Requesting a new verification email…");
    try { const response = await fetch(`${apiBase}/auth/resend-verification`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: authForm.email }) }); if (!response.ok) throw new Error("REQUEST_FAILED"); setAuthMessage("If the registration is awaiting verification, a new email has been queued."); }
    catch (error) { setAuthMessage(friendlyAuthError(error instanceof Error ? error.message : "REQUEST_FAILED")); }
  };
  const resetPassword = async () => {
    if (authForm.newPassword !== authForm.confirmPassword) { setAuthMessage("The password confirmation does not match."); return; }
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { setAuthMessage("The reset link is incomplete."); return; }
    setAuthMessage("Updating your password…");
    try { const response = await fetch(`${apiBase}/auth/reset-password`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password: authForm.newPassword }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "REQUEST_FAILED"); window.history.replaceState({}, "", "/"); setAuthMode("LOGIN"); setAuthForm((current) => ({ ...current, password: "", newPassword: "", confirmPassword: "" })); setAuthMessage("Password updated. Sign in with your new password."); }
    catch (error) { setAuthMessage(friendlyAuthError(error instanceof Error ? error.message : "REQUEST_FAILED")); }
  };
  const refreshAdminData = async () => {
    setAdminLoading(true);
    try {
      const [applications, users, delivery, emailStatus] = await Promise.allSettled([
        fetch(`${apiBase}/admin/applications`, { credentials: "include" }).then(async (response) => { if (!response.ok) throw new Error("APPLICATIONS_UNAVAILABLE"); return response.json(); }),
        fetch(`${apiBase}/admin/users`, { credentials: "include" }).then(async (response) => { if (!response.ok) throw new Error("USERS_UNAVAILABLE"); return response.json(); }),
        fetch(`${apiBase}/admin/email-delivery`, { credentials: "include" }).then(async (response) => { if (!response.ok) throw new Error("EMAIL_DELIVERY_UNAVAILABLE"); return response.json(); }),
        fetch(`${apiBase}/admin/email-status`, { credentials: "include" }).then(async (response) => { if (!response.ok) throw new Error("EMAIL_STATUS_UNAVAILABLE"); return response.json(); }),
      ]);
      if (applications.status === "fulfilled") setAdminApplications(applications.value);
      if (users.status === "fulfilled") { setAdminUsers(users.value.users); setAdminUserCounts(users.value.counts); }
      if (delivery.status === "fulfilled") setAdminEmailDelivery(delivery.value);
      if (emailStatus.status === "fulfilled") { setAdminEmailStatus(emailStatus.value); setEmailConfig((current: typeof emailConfig) => ({ ...current, sender: emailStatus.value.sender, connected: emailStatus.value.connected })); }
      if ([applications, users, delivery, emailStatus].every((result) => result.status === "rejected")) throw new Error("REQUEST_FAILED");
    } catch (error) { setAuthMessage(friendlyAuthError(error instanceof Error ? error.message : "REQUEST_FAILED")); }
    finally { setAdminLoading(false); }
  };
  const retryFailedEmails = async () => {
    setAdminLoading(true);
    try { const response = await fetch(`${apiBase}/admin/email-delivery/retry-failed`, { method: "POST", credentials: "include" }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "REQUEST_FAILED"); setAuthMessage(`${result.queued} failed email${result.queued === 1 ? "" : "s"} returned to the delivery queue.`); await refreshAdminData(); }
    catch (error) { setAuthMessage(friendlyAuthError(error instanceof Error ? error.message : "REQUEST_FAILED")); setAdminLoading(false); }
  };
  const decideApplication = async (applicationId: string, decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED") => {
    const reason = adminDecisionReasons[applicationId]?.trim();
    if (!reason || reason.length < 5) { setAuthMessage("Enter a clear review reason of at least five characters."); return; }
    setAdminLoading(true);
    try { const response = await fetch(`${apiBase}/admin/applications/${applicationId}/decision`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, reason }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "REQUEST_FAILED"); setAuthMessage(`Registration ${decision.toLowerCase().replace("_", " ")}.`); await refreshAdminData(); }
    catch (error) { setAuthMessage(friendlyAuthError(error instanceof Error ? error.message : "REQUEST_FAILED")); setAdminLoading(false); }
  };
  const updateAdminUser = async (user: AdminUser) => {
    setAdminLoading(true);
    try {
      const response = await fetch(`${apiBase}/admin/users/${user.id}`, { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: user.displayName, email: user.email, phone: user.phone || "", companyName: user.companyName, disabled: user.disabled }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "REQUEST_FAILED");
      setAuthMessage(`User account for ${user.displayName} was updated.`); await refreshAdminData();
    } catch (error) { setAuthMessage(friendlyAuthError(error instanceof Error ? error.message : "REQUEST_FAILED")); setAdminLoading(false); }
  };
  const deleteAdminUserAccess = async (user: AdminUser) => {
    if (!window.confirm(`Delete login access for ${user.displayName}? Shipment and audit history will be retained.`)) return;
    setAdminLoading(true);
    try {
      const response = await fetch(`${apiBase}/admin/users/${user.id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || "REQUEST_FAILED"); }
      setAuthMessage(`Login access for ${user.displayName} was deleted and all sessions were revoked.`); await refreshAdminData();
    } catch (error) { setAuthMessage(friendlyAuthError(error instanceof Error ? error.message : "REQUEST_FAILED")); setAdminLoading(false); }
  };
  const connectGmail = async () => {
    try { const response = await fetch(`${apiBase}/integrations/gmail/start`, { credentials: "include" }); const result = await response.json(); if (!response.ok || !result.authorizationUrl) throw new Error(result.error || "REQUEST_FAILED"); window.location.assign(result.authorizationUrl); }
    catch (error) { setAuthMessage(friendlyAuthError(error instanceof Error ? error.message : "REQUEST_FAILED")); }
  };
  const changePassword = async () => {
    if (passwordChange.newPassword !== passwordChange.confirmPassword) { setPasswordMessage("The password confirmation does not match."); return; }
    setPasswordMessage("Updating password…");
    try { const response = await fetch(`${apiBase}/auth/change-password`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(passwordChange) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "REQUEST_FAILED"); setPasswordChange({ currentPassword: "", newPassword: "", confirmPassword: "" }); setPasswordMessage("Password changed. Other active sessions have been revoked."); }
    catch (error) { setPasswordMessage(friendlyAuthError(error instanceof Error ? error.message : "REQUEST_FAILED")); }
  };
  const notify = (category: string, title: string, detail: string) => setNotifications((items) => [{ id: crypto.randomUUID(), category, title, detail, createdAt: new Date().toISOString(), read: false }, ...items]);
  const submitProfile = () => {
    setProfile((current) => ({ ...current, status: "SUBMITTED" }));
    notify("Account", "Registration submitted", "Your Main User registration was sent to the Platform Admin for review.");
    const applicant = profile.accountType === "ORGANISATION" ? profile.legalName : profile.fullName;
    setEmailOutbox((items) => [{ id: crypto.randomUUID(), event: "MAIN_USER_REGISTRATION_SUBMITTED", from: emailConfig.sender, to: emailConfig.adminRecipient, subject: `[CargoForm Registration] ${applicant || "New Main User"} submitted for Admin review`, body: `A ${profile.accountType.toLowerCase()} Main User registration has been submitted.\n\nApplicant: ${applicant || "Not provided"}\nEmail: ${profile.email || "Not provided"}\nPhone: ${profile.phone || "Not provided"}\nStatus: SUBMITTED\n\nSign in to the CargoForm Admin workspace to review the application.`, createdAt: new Date().toISOString(), status: "QUEUED" }, ...items]);
  };
  const sendChatMessage = () => {
    if (!messageBody.trim()) return;
    const targetName = messageThread === "ADMIN" ? "Platform Admin" : contacts.find((item) => item.id === messageThread)?.name || "Client";
    setMessages((items) => [...items, { id: crypto.randomUUID(), thread: messageThread, sender: "MAIN_USER", senderName: profile.legalName || profile.fullName || "Main User", body: messageBody.trim(), createdAt: new Date().toISOString() }]);
    notify("Message", `Message sent to ${targetName}`, messageBody.trim());
    setMessageBody("");
  };
  const renderModule = () => {
    if (activeSection === "Admin dashboard") {
      const pendingVerification = adminApplications.filter((item) => item.status === "DRAFT").length;
      const pending = adminApplications.filter((item) => item.status === "SUBMITTED" || item.status === "CHANGES_REQUESTED").length;
      const approved = adminApplications.filter((item) => item.status === "APPROVED").length;
      const failedEmails = adminEmailDelivery.filter((item) => item.status === "FAILED").length;
      return <section className="module-page"><div className="module-head"><div><p className="eyebrow">PLATFORM ADMIN</p><h2>Administration dashboard</h2><small>Account governance is separated from confidential shipment content.</small></div><div className="button-pair"><button onClick={()=>setActiveSection("User management")}>Manage users</button><button onClick={()=>setActiveSection("Main User approvals")}>Review registrations</button><button disabled={adminLoading} onClick={refreshAdminData}>{adminLoading ? "Refreshing…" : "Refresh"}</button></div></div><div className="admin-metrics"><div><b>{adminUserCounts.total}</b><span>Total registered users</span></div><div><b>{adminUserCounts.active}</b><span>Active users</span></div><div><b>{adminUserCounts.disabled}</b><span>Disabled users</span></div><div><b>{pendingVerification}</b><span>Email verification pending</span></div><div><b>{pending}</b><span>Awaiting Admin review</span></div><div><b>{approved}</b><span>Approved Main Users</span></div><div><b>{adminEmailStatus.queued}</b><span>Queued emails</span></div><div className={failedEmails ? "attention" : ""}><b>{failedEmails}</b><span>Failed emails</span></div></div><div className={`admin-callout ${adminEmailStatus.connected ? "connected" : "attention"}`}><div><h3>{adminEmailStatus.connected ? "Gmail delivery connected" : "Action required: connect Gmail"}</h3><p>{adminEmailStatus.connected ? `${adminEmailStatus.sender} is authorized for CargoForm notifications.` : "Verification and approval emails cannot be delivered until app.netpack@gmail.com is authorized."}</p></div>{!adminEmailStatus.connected && <button onClick={connectGmail}>Connect Gmail securely</button>}</div>{authMessage && <p className="status-message">{authMessage}</p>}</section>;
    }
    if (activeSection === "User management") return <section className="module-page"><div className="module-head"><div><p className="eyebrow">ACCESS ADMINISTRATION</p><h2>Users</h2><small>Edit Main User identity and company details, restore disabled accounts, or delete login access. Operational and audit history is retained.</small></div><button disabled={adminLoading} onClick={refreshAdminData}>{adminLoading ? "Refreshing…" : "Refresh"}</button></div><div className="admin-metrics"><div><b>{adminUserCounts.total}</b><span>Total users</span></div><div><b>{adminUserCounts.active}</b><span>Active</span></div><div><b>{adminUserCounts.pending}</b><span>Pending approval</span></div><div><b>{adminUserCounts.disabled}</b><span>Disabled</span></div></div>{adminUsers.length === 0 ? <div className="empty-state">No Main Users have registered.</div> : <div className="application-list">{adminUsers.map((user)=><article className="application-card user-management-card" key={user.id}><div className="application-head"><div><h3>{user.displayName}</h3><p>{user.role.replaceAll("_", " ")} · Registered {new Date(user.createdAt).toLocaleDateString()}</p></div><span className={`status ${user.disabled ? "rejected" : "approved"}`}>{user.disabled ? "ACCESS DELETED" : "ACTIVE"}</span></div><div className="settings-grid"><label>Full name<input value={user.displayName} onChange={(e)=>setAdminUsers((items)=>items.map((item)=>item.id===user.id?{...item,displayName:e.target.value}:item))}/></label><label>Email ID<input type="email" value={user.email} onChange={(e)=>setAdminUsers((items)=>items.map((item)=>item.id===user.id?{...item,email:e.target.value}:item))}/></label><label>Mobile number<input value={user.phone || ""} onChange={(e)=>setAdminUsers((items)=>items.map((item)=>item.id===user.id?{...item,phone:e.target.value}:item))}/></label><label>Company name<input value={user.companyName} onChange={(e)=>setAdminUsers((items)=>items.map((item)=>item.id===user.id?{...item,companyName:e.target.value}:item))}/></label><label>Login access<select value={user.disabled ? "DISABLED" : "ACTIVE"} onChange={(e)=>setAdminUsers((items)=>items.map((item)=>item.id===user.id?{...item,disabled:e.target.value==="DISABLED"}:item))}><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option></select></label><label>Registration status<input value={user.applicationStatus || user.organisationStatus} readOnly/></label></div><div className="decision-actions"><button disabled={adminLoading} onClick={()=>updateAdminUser(user)}>Save changes</button><button className="danger" disabled={adminLoading || user.disabled} onClick={()=>deleteAdminUserAccess(user)}>Delete login access</button></div></article>)}</div>}{authMessage && <p className="status-message">{authMessage}</p>}</section>;
    if (activeSection === "Main User approvals") return <section className="module-page"><div className="module-head"><div><p className="eyebrow">ACCOUNT GOVERNANCE</p><h2>Main User registrations</h2><small>Unverified registrations remain visible, but approval starts only after email verification.</small></div><button disabled={adminLoading} onClick={refreshAdminData}>{adminLoading ? "Refreshing…" : "Refresh"}</button></div>{adminApplications.length === 0 ? <div className="empty-state">No Main User registrations have been received.</div> : <div className="application-list">{adminApplications.map((application) => <article className="application-card" key={application.id}><div className="application-head"><div><h3>{application.organisation.legalName}</h3><p>{application.applicantEmail} · {application.accountType.toLowerCase()}</p></div><span className={`status ${application.status.toLowerCase()}`}>{application.status === "DRAFT" ? "EMAIL VERIFICATION PENDING" : application.status.replaceAll("_", " ")}</span></div><dl><div><dt>Registration no.</dt><dd>{application.organisation.registrationNumber || "Not supplied"}</dd></div><div><dt>PAN / VAT</dt><dd>{application.organisation.panVat || "Not supplied"}</dd></div><div><dt>Phone</dt><dd>{String(application.payload?.phone || "Not supplied")}</dd></div><div><dt>Submitted</dt><dd>{application.submittedAt ? new Date(application.submittedAt).toLocaleString() : "Not submitted — email verification required"}</dd></div></dl>{application.status === "DRAFT" && <p className="application-guidance">The applicant must open the verification email before this registration can be reviewed. Check Email delivery if the message has failed.</p>}{application.status === "SUBMITTED" || application.status === "CHANGES_REQUESTED" ? <><label>Review reason<textarea value={adminDecisionReasons[application.id] || ""} onChange={(event)=>setAdminDecisionReasons((current)=>({ ...current, [application.id]: event.target.value }))} placeholder="Record the evidence reviewed and reason for this decision."/></label><div className="decision-actions"><button disabled={adminLoading} onClick={()=>decideApplication(application.id,"APPROVED")}>Approve and notify applicant</button><button disabled={adminLoading} onClick={()=>decideApplication(application.id,"CHANGES_REQUESTED")}>Request changes and notify</button><button className="danger" disabled={adminLoading} onClick={()=>decideApplication(application.id,"REJECTED")}>Reject and notify</button></div></> : null}</article>)}</div>}{authMessage && <p className="status-message">{authMessage}</p>}</section>;
    if (activeSection === "Email delivery") return <section className="module-page"><div className="module-head"><div><p className="eyebrow">DELIVERY OPERATIONS</p><h2>Email delivery monitor</h2><small>Verification, password reset, registration and operational messages.</small></div><div className="button-pair">{!adminEmailStatus.connected && <button onClick={connectGmail}>Connect Gmail</button>}<button disabled={adminLoading || adminEmailStatus.failed === 0} onClick={retryFailedEmails}>Retry failed</button><button disabled={adminLoading} onClick={refreshAdminData}>Refresh</button></div></div><div className={`delivery-summary ${adminEmailStatus.connected ? "connected" : "attention"}`}><b>{adminEmailStatus.connected ? "Gmail connected" : "Gmail connection required"}</b><span>{adminEmailStatus.connected ? `${adminEmailStatus.sender} is authorized.` : "Emails remain queued or failed until the sender mailbox is authorized."}</span></div>{adminEmailDelivery.length === 0 ? <div className="empty-state">No email delivery records.</div> : <div className="record-list">{adminEmailDelivery.map((item)=><div className="record-row" key={item.id}><div><b>{item.eventKey}</b><small>To: {item.toEmails.join(", ")}</small><small>{new Date(item.createdAt).toLocaleString()}{item.lastError ? ` · ${item.lastError.replaceAll("_", " ")}` : ""}</small></div><span className={`status ${item.status.toLowerCase()}`}>{item.status}</span><small>{item.attempts} attempt{item.attempts === 1 ? "" : "s"}</small></div>)}</div>}</section>;
    if (activeSection === "Profile") return <section className="module-page"><div className="module-head"><div><p className="eyebrow">MAIN USER ACCOUNT</p><h2>Profile and Admin registration</h2><small>Status: {profile.status.replace("_", " ")}</small></div><button disabled={profile.status === "SUBMITTED"} onClick={submitProfile}>{profile.status === "SUBMITTED" ? "Awaiting Admin review" : "Submit to Admin"}</button></div><div className="account-type"><button className={profile.accountType === "INDIVIDUAL" ? "chosen" : ""} onClick={()=>setProfile({...profile,accountType:"INDIVIDUAL",status:"DRAFT"})}>Individual</button><button className={profile.accountType === "ORGANISATION" ? "chosen" : ""} onClick={()=>setProfile({...profile,accountType:"ORGANISATION",status:"DRAFT"})}>Organisation</button></div><div className="settings-grid profile-fields">{profile.accountType === "INDIVIDUAL" ? <><label>Full legal name<input value={profile.fullName} onChange={(e)=>setProfile({...profile,fullName:e.target.value,status:"DRAFT"})}/></label><label>Date of birth<input type="date" value={profile.dateOfBirth} onChange={(e)=>setProfile({...profile,dateOfBirth:e.target.value,status:"DRAFT"})}/></label><label>Email<input type="email" value={profile.email} onChange={(e)=>setProfile({...profile,email:e.target.value,status:"DRAFT"})}/></label><label>Phone<input value={profile.phone} onChange={(e)=>setProfile({...profile,phone:e.target.value,status:"DRAFT"})}/></label><label className="wide">Residential address<input value={profile.address} onChange={(e)=>setProfile({...profile,address:e.target.value,status:"DRAFT"})}/></label><label>Identity document type<input value={profile.identityType} onChange={(e)=>setProfile({...profile,identityType:e.target.value,status:"DRAFT"})}/></label><label>Identity document number<input value={profile.identityNumber} onChange={(e)=>setProfile({...profile,identityNumber:e.target.value,status:"DRAFT"})}/></label></> : <><label>Registered legal name<input value={profile.legalName} onChange={(e)=>setProfile({...profile,legalName:e.target.value,status:"DRAFT"})}/></label><label>Company registration number<input value={profile.registrationNumber} onChange={(e)=>setProfile({...profile,registrationNumber:e.target.value,status:"DRAFT"})}/></label><label>PAN / VAT number<input value={profile.panVat} onChange={(e)=>setProfile({...profile,panVat:e.target.value,status:"DRAFT"})}/></label><label>Date of incorporation<input type="date" value={profile.incorporationDate} onChange={(e)=>setProfile({...profile,incorporationDate:e.target.value,status:"DRAFT"})}/></label><label className="wide">Registered office address<input value={profile.registeredAddress} onChange={(e)=>setProfile({...profile,registeredAddress:e.target.value,status:"DRAFT"})}/></label><label>Authorized contact person<input value={profile.contactPerson} onChange={(e)=>setProfile({...profile,contactPerson:e.target.value,status:"DRAFT"})}/></label><label>Official email<input type="email" value={profile.email} onChange={(e)=>setProfile({...profile,email:e.target.value,status:"DRAFT"})}/></label><label>Official phone<input value={profile.phone} onChange={(e)=>setProfile({...profile,phone:e.target.value,status:"DRAFT"})}/></label></>}</div><p className="privacy-note">Identity and company evidence must be uploaded to secured backend storage in production. Sensitive documents are deliberately not stored in this browser-only MVP.</p></section>;
    if (activeSection === "Messages") {
      const clientThreads = contacts.filter((item)=>item.role === "CHILD_ACCOUNT");
      const threadMessages = messages.filter((item)=>item.thread === messageThread);
      return <section className="module-page messages-page"><div className="module-head"><div><p className="eyebrow">CONTROLLED CHAT</p><h2>Messages</h2><small>Main User↔Admin and Client↔owning Main User only.</small></div></div><div className="message-layout"><div className="thread-list"><button className={messageThread === "ADMIN" ? "active" : ""} onClick={()=>setMessageThread("ADMIN")}><b>Platform Admin</b><small>Account and billing support</small></button>{clientThreads.map((client)=><button className={messageThread === client.id ? "active" : ""} key={client.id} onClick={()=>setMessageThread(client.id)}><b>{client.name}</b><small>Owned client account</small></button>)}</div><div className="conversation"><div className="message-stream">{threadMessages.length === 0 ? <div className="empty-state">No messages in this thread.</div> : threadMessages.map((message)=><div className={`message-bubble ${message.sender.toLowerCase()}`} key={message.id}><b>{message.senderName}</b><p>{message.body}</p><small>{new Date(message.createdAt).toLocaleString()}</small></div>)}</div><div className="message-compose"><textarea value={messageBody} onChange={(e)=>setMessageBody(e.target.value)} placeholder="Write a message…"/><button onClick={sendChatMessage}>Send</button></div></div></div></section>;
    }
    if (activeSection === "Email setup") return <section className="module-page"><div className="module-head"><div><p className="eyebrow">SYSTEM DELIVERY</p><h2>Email setup</h2><small>Google OAuth is required; CargoForm never stores the Gmail password.</small></div><span className={`connection-badge ${emailConfig.connected?"connected":"pending"}`}>{emailConfig.connected?"CONNECTED":"CONNECTION REQUIRED"}</span></div><div className="email-config-panel"><label>System sender<input type="email" value={emailConfig.sender} onChange={(e)=>setEmailConfig({...emailConfig,sender:e.target.value,connected:false})}/></label><label>Platform Admin recipient<input type="email" value={emailConfig.adminRecipient} onChange={(e)=>setEmailConfig({...emailConfig,adminRecipient:e.target.value})}/></label><div><b>{emailConfig.provider}</b><small>Authorize this exact mailbox through the Gmail connection.</small></div></div><h3>Registration email outbox</h3><div className="email-outbox">{emailOutbox.length===0?<div className="empty-state">No queued registration emails.</div>:emailOutbox.map((mail)=><div key={mail.id}><span><b>{mail.subject}</b><small>{mail.from} → {mail.to}</small><small>{new Date(mail.createdAt).toLocaleString()}</small></span><em>{mail.status}</em><button onClick={()=>setEmailOutbox((items)=>items.filter((item)=>item.id!==mail.id))}>Delete</button></div>)}</div><p className="privacy-note">Queued means the application event and message content are ready locally. It does not mean Gmail has accepted or sent the message.</p></section>;
    if (activeSection === "Notifications") return <section className="module-page"><div className="module-head"><div><p className="eyebrow">EMAIL & IN-APP EVENTS</p><h2>Notifications</h2><small>Recipient rules prevent client information from routing outside its owning Main User.</small></div><button onClick={()=>setNotifications((items)=>items.map((item)=>({...item,read:true})))}>Mark all read</button></div><div className="notification-layout"><div><h3>Delivery preferences</h3><div className="preference-list">{notificationPreferences.map((pref,index)=><div className="preference-row" key={pref.event}><div><b>{pref.event}</b><small>{pref.recipient}</small></div><label><input type="checkbox" checked={pref.email} onChange={(e)=>setNotificationPreferences((items)=>items.map((x,i)=>i===index?{...x,email:e.target.checked}:x))}/> Email</label><label><input type="checkbox" checked={pref.inApp} onChange={(e)=>setNotificationPreferences((items)=>items.map((x,i)=>i===index?{...x,inApp:e.target.checked}:x))}/> In-app</label></div>)}</div></div><div><h3>Notification inbox</h3><div className="record-list">{notifications.length===0?<div className="empty-state">No notifications.</div>:notifications.map((item)=><div className={`notification-row ${item.read?"read":"unread"}`} key={item.id} onClick={()=>setNotifications((all)=>all.map((x)=>x.id===item.id?{...x,read:true}:x))}><b>{item.title}</b><p>{item.detail}</p><small>{item.category} · {new Date(item.createdAt).toLocaleString()}</small><button onClick={(e)=>{e.stopPropagation();setNotifications((all)=>all.filter((x)=>x.id!==item.id));}}>Delete</button></div>)}</div></div></div></section>;
    if (activeSection === "Shipment history") return <section className="module-page"><div className="module-head"><div><p className="eyebrow">OPERATIONS</p><h2>Shipment history</h2></div><button onClick={() => saveShipmentSnapshot()}>Save current snapshot</button></div>{history.length === 0 ? <div className="empty-state">No saved shipment snapshots yet.</div> : <div className="record-list">{history.map((item) => <div className="record-row" key={item.id}><div><b>{item.data.documentNo || item.data.invoiceNo}</b><small>{item.data.consigneeName} · {item.data.destination} · {new Date(item.savedAt).toLocaleString()}</small></div><span className={`status ${item.status.toLowerCase()}`}>{item.status}</span><button onClick={() => restoreShipment(item)}>Open</button><button onClick={() => setHistory((all) => all.filter((x) => x.id !== item.id))}>Delete</button></div>)}</div>}</section>;
    if (activeSection === "Staffs" || activeSection === "Clients" || activeSection === "Carriers") {
      const role: Contact["role"] = activeSection === "Staffs" ? "MAIN_USER" : activeSection === "Clients" ? "CHILD_ACCOUNT" : "CARRIER";
      const items = contacts.filter((contact) => contact.role === role);
      return <section className="module-page"><div className="module-head"><div><p className="eyebrow">ACCOUNTS</p><h2>{activeSection}</h2><small>{activeSection === "Clients" ? "Client accounts submit only to their owning Main User." : activeSection === "Staffs" ? "Staff permissions remain inside this Main User organisation." : "Carrier contacts receive only reviewed Main User submissions."}</small></div><button onClick={() => { setContactRole(role); setActiveSection("Shipment data"); }}>Add from shipment workspace</button></div>{items.length === 0 ? <div className="empty-state">No {activeSection.toLowerCase()} added.</div> : <div className="record-list">{items.map((item) => <div className="record-editor" key={item.id}><input value={item.name} onChange={(e) => updateContact(item.id,{name:e.target.value})}/><input type="email" value={item.email} onChange={(e) => updateContact(item.id,{email:e.target.value})}/><select value={item.status} onChange={(e) => updateContact(item.id,{status:e.target.value as Contact["status"]})}><option>ACTIVE</option><option>INVITED</option><option>PENDING_REVIEW</option></select><button onClick={() => removeContact(item.id)}>Delete</button></div>)}</div>}</section>;
    }
    if (activeSection === "Documents") {
      const docs: [DocType,string][] = [["MAWB","Master Air Waybill"],["HAWB","House Air Waybill"],["BILL_OF_LADING","Bill of Lading"],["HBL","House Bill of Lading"],["COO","Certificate of Origin"],["COMMERCIAL_INVOICE","Commercial Invoice"],["PACKING_LIST","Packing List"],["PHYTOSANITARY","Phytosanitary Certificate"]];
      return <section className="module-page"><div className="module-head"><div><p className="eyebrow">TEMPLATES</p><h2>Documents</h2></div></div><div className="module-cards">{docs.map(([kind,name]) => <button key={kind} onClick={() => openDocument(kind)}><FileText/><b>{name}</b><small>Open editable A4 draft</small></button>)}</div></section>;
    }
    if (activeSection === "Billing & payments") return <section className="module-page"><div className="module-head"><div><p className="eyebrow">FINANCE</p><h2>Billing & payments</h2><small>Platform subscription ledger. Client freight invoices remain a separate Main User ledger.</small></div><button onClick={addBillingRecord}>New invoice</button></div><div className="payment-options"><b>Payment priority</b><span>Bank transfer / connectIPS · eSewa ePay · Khalti</span></div>{billing.length === 0 ? <div className="empty-state">No billing records.</div> : <div className="record-list">{billing.map((item) => <div className="record-editor billing-row" key={item.id}><input value={item.reference} onChange={(e) => setBilling((all)=>all.map((x)=>x.id===item.id?{...x,reference:e.target.value}:x))}/><input value={item.party} onChange={(e) => setBilling((all)=>all.map((x)=>x.id===item.id?{...x,party:e.target.value}:x))}/><input type="number" value={item.amount} onChange={(e) => setBilling((all)=>all.map((x)=>x.id===item.id?{...x,amount:Number(e.target.value)}:x))}/><select value={item.status} onChange={(e)=>setBilling((all)=>all.map((x)=>x.id===item.id?{...x,status:e.target.value as BillingRecord["status"]}:x))}><option>DRAFT</option><option>ISSUED</option><option>PAID</option><option>VOID</option></select><button onClick={()=>setBilling((all)=>all.filter((x)=>x.id!==item.id))}>Delete</button></div>)}</div>}</section>;
    if (activeSection === "Settings") return <section className="module-page"><div className="module-head"><div><p className="eyebrow">WORKSPACE</p><h2>Organisation and security settings</h2></div>{installPrompt && <button onClick={installApp}>Install CargoForm app</button>}</div><div className="settings-grid"><label>Organisation name<input value={organisation.name} onChange={(e)=>setOrganisation({...organisation,name:e.target.value})}/></label><label>PAN / registration<input value={organisation.pan} onChange={(e)=>setOrganisation({...organisation,pan:e.target.value})}/></label><label>Base currency<input value={organisation.currency} onChange={(e)=>setOrganisation({...organisation,currency:e.target.value.toUpperCase()})}/></label><label>Timezone<input value={organisation.timezone} onChange={(e)=>setOrganisation({...organisation,timezone:e.target.value})}/></label></div><div className="security-panel"><div><h3>Change password</h3><p>Use at least 12 characters with uppercase, lowercase and a number.</p></div><label>Current password<input type="password" autoComplete="current-password" value={passwordChange.currentPassword} onChange={(e)=>setPasswordChange({...passwordChange,currentPassword:e.target.value})}/></label><label>New password<input type="password" autoComplete="new-password" value={passwordChange.newPassword} onChange={(e)=>setPasswordChange({...passwordChange,newPassword:e.target.value})}/></label><label>Confirm new password<input type="password" autoComplete="new-password" value={passwordChange.confirmPassword} onChange={(e)=>setPasswordChange({...passwordChange,confirmPassword:e.target.value})}/></label><button onClick={changePassword}>Update password</button>{passwordMessage && <small>{passwordMessage}</small>}</div><div className={`offline-state ${online ? "online" : "offline"}`}><b>{online ? "Online" : "Offline mode"}</b><span>{online ? "Changes are saved on this device." : "The cached app remains available; network submissions wait until connectivity returns."}</span></div></section>;
    return null;
  };
  const sections = sessionInfo?.role === "PLATFORM_ADMIN"
    ? ["Admin dashboard", "User management", "Main User approvals", "Email delivery", "Notifications", "Messages", "Billing & payments", "Settings"]
    : ["Shipment data", "Shipment history", "Staffs", "Clients", "Carriers", "Documents", "Profile", "Messages", "Notifications", "Email setup", "Billing & payments", "Settings"];
  if (!loggedIn) return <div className="auth-screen"><div className="auth-card"><div className="brand auth-brand"><span><Box size={21}/></span><b>CargoForm</b></div><p className="eyebrow">SECURE WORKSPACE</p><h1>{authMode === "REGISTER" ? "Create your Main User account" : authMode === "FORGOT" ? "Reset your password" : authMode === "RESET" ? "Choose a new password" : authMode === "VERIFY" ? "Verify your email" : "Welcome back"}</h1><p>{authMode === "REGISTER" ? "Enter the essential details below. After registration, verify your email and the Platform Admin will review your account." : authMode === "FORGOT" ? "We will send a time-limited reset link if this account is active." : authMode === "RESET" ? "Use at least 12 characters with uppercase, lowercase and a number." : authMode === "VERIFY" ? "CargoForm is validating this secure registration link." : "Sign in with your email address or mobile number and password."}</p>
    {authMode === "REGISTER" && <><label>Full name<input value={authForm.displayName} onChange={(e)=>setAuthForm({...authForm,displayName:e.target.value})} autoComplete="name"/></label><label>Email ID<input type="email" value={authForm.email} onChange={(e)=>setAuthForm({...authForm,email:e.target.value})} autoComplete="email"/></label><label>Mobile number<input type="tel" value={authForm.phone} onChange={(e)=>setAuthForm({...authForm,phone:e.target.value})} autoComplete="tel" placeholder="+977…"/></label><label>Company name <small>(optional)</small><input value={authForm.legalName} onChange={(e)=>setAuthForm({...authForm,legalName:e.target.value})} autoComplete="organization"/></label><label>Password<input type={showPassword?"text":"password"} value={authForm.password} onChange={(e)=>setAuthForm({...authForm,password:e.target.value})} autoComplete="new-password"/></label><label className="show-password"><input type="checkbox" checked={showPassword} onChange={(e)=>setShowPassword(e.target.checked)}/> Show password</label><small className="password-rule">Use at least 12 characters, including uppercase, lowercase and a number.</small></>}
    {authMode === "LOGIN" && <><label>Email ID or mobile number<input value={authForm.email} onChange={(e)=>setAuthForm({...authForm,email:e.target.value})} autoComplete="username"/></label><label>Password<input type={showPassword?"text":"password"} value={authForm.password} onChange={(e)=>setAuthForm({...authForm,password:e.target.value})} autoComplete="current-password"/></label><label className="show-password"><input type="checkbox" checked={showPassword} onChange={(e)=>setShowPassword(e.target.checked)}/> Show password</label></>}
    {authMode === "FORGOT" && <label>Email ID<input type="email" value={authForm.email} onChange={(e)=>setAuthForm({...authForm,email:e.target.value})} autoComplete="email"/></label>}
    {authMode === "RESET" && <><label>New password<input type="password" value={authForm.newPassword} onChange={(e)=>setAuthForm({...authForm,newPassword:e.target.value})} autoComplete="new-password"/></label><label>Confirm new password<input type="password" value={authForm.confirmPassword} onChange={(e)=>setAuthForm({...authForm,confirmPassword:e.target.value})} autoComplete="new-password"/></label></>}
    {authMode === "LOGIN" && <button className="auth-primary" onClick={submitAuthentication}>Sign in</button>}
    {authMode === "REGISTER" && <button className="auth-primary" onClick={submitAuthentication}>Submit secure registration</button>}
    {authMode === "FORGOT" && <button className="auth-primary" onClick={requestPasswordReset}>Send reset link</button>}
    {authMode === "RESET" && <button className="auth-primary" onClick={resetPassword}>Update password</button>}
    {authMode === "VERIFY" && <button className="auth-primary" onClick={()=>navigateAuth("LOGIN")}>Continue to sign in</button>}
    {authMode === "LOGIN" && <><div className="auth-links"><button onClick={()=>navigateAuth("FORGOT")}>Forgot password?</button><button onClick={resendVerification}>Resend verification</button></div><button className="auth-secondary" onClick={()=>navigateAuth("REGISTER")}>New Main User? Create account</button></>}
    {(authMode === "REGISTER" || authMode === "FORGOT" || authMode === "RESET") && <button className="auth-secondary" onClick={()=>navigateAuth("LOGIN")}>Back to sign in</button>}
    {authMessage && <small className="auth-message" role="status">{authMessage}</small>}<small>Platform Admin: app.netpack@gmail.com. Public Admin registration is disabled; Main User registrations require verified email and Admin approval.</small></div></div>;
  return (
    <div className="app">
      <aside>
        <div className="brand">
          <span>
            <Box size={21} />
          </span>
          <b>CargoForm</b>
        </div>
        <p className="eyebrow">CARGO WORKSPACE</p>
        {sections.map((section) => (
          <button
            key={section}
            className={`nav ${activeSection === section ? "active" : ""}`}
            onClick={() => setActiveSection(section)}
          >
            {section}
            <ChevronRight size={15} />
          </button>
        ))}
        <div className="aside-card">
          <ShieldCheck size={20} />
          <b>Rules checked</b>
          <small>
            Rule pack v1.0
            <br />
            Sources reviewed 17 Aug 2026
          </small>
        </div>
        <button className="logout-button" onClick={async()=>{await fetch(`${apiBase}/auth/logout`,{method:"POST",credentials:"include"});setSessionInfo(null);setLoggedIn(false);setActiveSection("Shipment data");}}>
          Logout
        </button>
      </aside>
      <main>
        <header>
          <div>
            <p className="eyebrow">{sessionInfo?.role === "PLATFORM_ADMIN" ? "PLATFORM CONTROL" : "NEW EXPORT PACK"}</p>
            <h1>{sessionInfo?.role === "PLATFORM_ADMIN" ? "CargoForm administration" : "One shipment. Every document."}</h1>
            <p>
              {sessionInfo?.role === "PLATFORM_ADMIN" ? "Approve Main Users, monitor delivery and govern platform access." : "Enter shipment data once, choose the right origin route, then edit the generated document before export."}
            </p>
          </div>
          <div className="saved">
            <Check size={14} /> {online ? "Saved on this device" : "Offline · saved locally"}
          </div>
        </header>
        {activeSection !== "Shipment data" && renderModule()}
        <div className={activeSection === "Shipment data" ? "shipment-module" : "shipment-module hidden"}>
        <div className="doc-tabs">
          <button
            className={doc === "MAWB" ? "selected" : ""}
            onClick={() => setDoc("MAWB")}
          >
            <Plane />
            MAWB<small>Air cargo</small>
          </button>
          <button
            className={doc === "HAWB" ? "selected" : ""}
            onClick={() => setDoc("HAWB")}
          >
            <Plane />
            HAWB<small>House air cargo</small>
          </button>
          <button
            className={doc === "BILL_OF_LADING" ? "selected" : ""}
            onClick={() => setDoc("BILL_OF_LADING")}
          >
            <Ship />
            Bill of Lading<small>Sea cargo</small>
          </button>
          <button
            className={doc === "HBL" ? "selected" : ""}
            onClick={() => setDoc("HBL")}
          >
            <Ship />
            HBL<small>House sea cargo</small>
          </button>
          <button
            className={doc === "COO" ? "selected" : ""}
            onClick={() => setDoc("COO")}
          >
            <FileText />
            Certificate of Origin<small>Origin proof</small>
          </button>
          <button
            className={doc === "COMMERCIAL_INVOICE" ? "selected" : ""}
            onClick={() => setDoc("COMMERCIAL_INVOICE")}
          >
            <FileText />
            Commercial Invoice<small>Customs value</small>
          </button>
          <button
            className={doc === "PACKING_LIST" ? "selected" : ""}
            onClick={() => setDoc("PACKING_LIST")}
          >
            <Box />
            Packing List<small>Package detail</small>
          </button>
          <button
            className={doc === "PHYTOSANITARY" ? "selected" : ""}
            onClick={() => setDoc("PHYTOSANITARY")}
          >
            <ShieldCheck />
            Phytosanitary<small>Plant health</small>
          </button>
        </div>
        <section className="shipment-control">
          <div>
            <p className="eyebrow">SHIPMENT LIFECYCLE</p>
            <b>{activeDocumentNo || "Unnumbered shipment"}</b>
            <span className={`status ${status.toLowerCase()}`}>{status}</span>
          </div>
          <div className="lifecycle-actions">
            <button onClick={() => setStatus("DRAFT")} disabled={locked}>
              Draft
            </button>
            <button
              onClick={() => { setStatus("CONFIRMED"); saveShipmentSnapshot("CONFIRMED"); }}
              disabled={locked || !activeDocumentNo}
            >
              Confirm shipment
            </button>
            <button
              onClick={() => setStatus("DEPARTED")}
              disabled={status !== "CONFIRMED"}
            >
              Mark departed
            </button>
            <button className="danger" onClick={deleteDraft} disabled={locked}>
              Delete
            </button>
            {data.trackingUrl && (
              <a href={data.trackingUrl} target="_blank">
                Track with carrier ↗
              </a>
            )}
            {status === "CONFIRMED" && data.operationsUrl && (
              <a href={data.operationsUrl} target="_blank">
                Cargo operations ↗
              </a>
            )}
          </div>
          {data.carrier !== "To be assigned" && (
            <div className="carrier-resolved">
              <ShieldCheck size={17} />
              <span>
                <b>{data.carrier}</b>
                <small>
                  {data.carrierCode} · Automatically suggested from{" "}
                  {doc === "MAWB"
                    ? "IATA accounting prefix"
                    : doc === "HAWB"
                      ? "house issuer selected by the Main User"
                      : doc === "HBL"
                        ? "underlying master B/L carrier prefix"
                      : "known carrier/SCAC-style prefix"}
                  ; always verify and edit.
                </small>
              </span>
            </div>
          )}
        </section>
        {locked && (
          <section className="amendment-panel">
            <div className="amend-title">
              <div>
                <p className="eyebrow">POST-DEPARTURE CONTROL</p>
                <h2>Amendment requests</h2>
              </div>
              <span>Original shipment remains preserved</span>
            </div>
            <div className="amend-compose">
              <label>
                Field / clause
                <select
                  value={amendField}
                  onChange={(e) => setAmendField(e.target.value)}
                >
                  <option>Consignee / notify party</option>
                  <option>Cargo description / HS code</option>
                  <option>Weight / packages</option>
                  <option>Freight payer / terms</option>
                  <option>Port / place of delivery</option>
                  <option>Other document data</option>
                </select>
              </label>
              <label>
                Requested value
                <input
                  value={amendValue}
                  onChange={(e) => setAmendValue(e.target.value)}
                />
              </label>
              <label>
                Reason
                <input
                  value={amendReason}
                  onChange={(e) => setAmendReason(e.target.value)}
                />
              </label>
              <button onClick={addAmendment}>Create request</button>
            </div>
            <div className="clause-notice">
              <Info size={16} />
              <span>
                <b>Carrier clause gateway</b> Post-departure changes are
                requests—not direct edits. The carrier may charge fees,
                revalidate customs/manifests, request originals or endorsements,
                or decline a change. Use the carrier operations link to submit
                after review.
              </span>
            </div>
            {amendments.map((a) => (
              <div className="amend-row" key={a.id}>
                <span className={`status ${a.status.toLowerCase()}`}>
                  {a.status}
                </span>
                <div>
                  <b>
                    {a.field}: {a.requestedValue}
                  </b>
                  <small>
                    {a.reason} · {new Date(a.createdAt).toLocaleString()}
                  </small>
                  <p>{a.clause}</p>
                </div>
                {a.status === "DRAFT" && (
                  <button
                    onClick={() =>
                      setAmendments((x) =>
                        x.map((y) =>
                          y.id === a.id ? { ...y, status: "SUBMITTED" } : y,
                        ),
                      )
                    }
                  >
                    Mark submitted
                  </button>
                )}
              </div>
            ))}
          </section>
        )}
        <section className="collaboration-panel">
          <div className="collab-head">
            <div>
              <p className="eyebrow">ACCOUNTS & COMMUNICATION</p>
              <h2>Main User workspace and controlled contacts</h2>
            </div>
            <span>Admin → Main User → Child Account</span>
          </div>
          <div className="account-flow">
            <span>
              <b>ADMIN</b> Registers and governs Main Users
            </span>
            <i>→</i>
            <span>
              <b>MAIN USER</b> Owns workspace, reviews and submits
            </span>
            <i>→</i>
            <span>
              <b>CHILD ACCOUNT</b> Supplies data only to its Main User
            </span>
            <em>MAIN USER → MATCHED CARRIER only after review</em>
          </div>
          <div className="contact-compose">
            <input
              placeholder="Contact name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
            <input
              type="email"
              placeholder="name@company.com"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
            <select
              value={contactRole}
              onChange={(e) =>
                setContactRole(e.target.value as Contact["role"])
              }
            >
              <option value="CHILD_ACCOUNT">Child account / client</option>
              <option value="MAIN_USER">Main user / reviewer email</option>
              <option value="CARRIER">Carrier operations</option>
            </select>
            <button onClick={addContact}>Add contact</button>
          </div>
          <div className="contact-list">
            {contacts.map((c) => (
              <div key={c.id}>
                <span className={`avatar ${c.role.toLowerCase()}`}>
                  {c.name.slice(0, 2).toUpperCase()}
                </span>
                <p>
                  <b>{c.name}</b>
                  <small>
                    {c.email} · {c.role.replace("_", " ")}
                  </small>
                </p>
                <span className={`status ${c.status.toLowerCase()}`}>
                  {c.status}
                </span>
                <button
                  onClick={() =>
                    setContacts((x) => x.filter((y) => y.id !== c.id))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            {!contacts.length && (
              <small>
                No contacts added. Add multiple users, client accounts, and
                verified carrier-operation addresses.
              </small>
            )}
          </div>
          <div className="email-builder">
            <div>
              <b>Email package</b>
              <small>
                Child submissions route only to Main User emails. This carrier
                package routes only to the matched carrier, with Main Users in
                CC.
              </small>
            </div>
            <div className="doc-checks">
              {[
                "MAWB / B/L",
                "House Air Waybill",
                "House Bill of Lading",
                "Certificate of Origin",
                "Commercial Invoice",
                "Packing List",
                "Phytosanitary Certificate",
              ].map((x) => (
                <label key={x}>
                  <input
                    type="checkbox"
                    checked={selectedDocs.includes(x)}
                    onChange={() =>
                      setSelectedDocs((s) =>
                        s.includes(x) ? s.filter((y) => y !== x) : [...s, x],
                      )
                    }
                  />
                  {x}
                </label>
              ))}
            </div>
            <button onClick={makeEmailDraft}>Prepare email draft</button>
          </div>
          {emailDraft && (
            <div className="email-preview">
              <small>
                TO: {emailDraft.to.join("; ") || "Add carrier/user email"}
              </small>
              <small>CC: {emailDraft.cc.join("; ") || "None"}</small>
              <b>SUBJECT: {emailDraft.subject}</b>
              <pre>{emailDraft.body}</pre>
              <p>
                Attachments selected:{" "}
                {emailDraft.documents.join(", ") || "None"}
              </p>
              <button className="send-email" disabled={emailDraft.to.length === 0} onClick={sendEmail}>
                Send email
              </button>
              <div className="clause-notice">
                <Info size={14} /> This MVP opens the addressed message in the device email app. Add the selected generated files before sending. Automatic server delivery and attachment upload require a connected Gmail/Outlook or transactional-email service.
              </div>
            </div>
          )}
        </section>
        <section className="workspace">
          <div className="form-pane">
            <div className="pane-title">
              <div>
                <p className="eyebrow">STRUCTURED DATA</p>
                <h2>Shipment details</h2>
              </div>
              <span>
                {locked ? "Locked issued snapshot" : "Reusable profile"}
              </span>
            </div>
            <div className="weight-source">
              <div><small>Pieces</small><b>{totals.pieces} boxes</b></div>
              <div><small>Actual</small><b>{totals.actualKg.toFixed(2)} kg</b></div>
              <div><small>Volumetric</small><b>{totals.volumetricKg.toFixed(2)} kg</b></div>
              <div><small>Chargeable</small><b>{totals.chargeableKg.toFixed(2)} kg</b></div>
              <div><small>Measurement</small><b>{totals.cbm.toFixed(4)} CBM</b></div>
              <p>Packing boxes are the single source of truth for transport-document pieces, actual weight, volumetric weight, chargeable weight, CBM and email summaries.</p>
            </div>
            {Object.entries(fields).map(([group, fs]) => (
              <fieldset key={group}>
                <legend>{group}</legend>
                <div className="grid">
                  {fs.map((f) => (
                    <label key={f.key}>
                      {f.label}
                      <input
                        disabled={locked}
                        type={
                          f.key === "invoiceDate"
                            ? "date"
                            : f.key === "estimatedDeparture"
                              ? "datetime-local"
                              : "text"
                        }
                        value={data[f.key] as string}
                        onChange={(e) => set(f.key, e.target.value)}
                      />
                      {f.key === "documentNo" && (
                        <small className="field-help">
                          MAWB: enter 3-digit prefix + 8 digits. B/L: enter the
                          full carrier document number. For HBL, this field is the underlying master B/L number.
                        </small>
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            {doc === "HAWB" && (
              <fieldset>
                <legend>House Air Waybill control</legend>
                <div className="grid">
                  <label className="wide">
                    HAWB issued by
                    <input
                      disabled={locked}
                      value={data.hawbIssuerName}
                      placeholder={houseIssuerName}
                      onChange={(e) => set("hawbIssuerName", e.target.value)}
                    />
                    <small className="field-help">
                      Defaults to the Main User’s organisation or legal name. Enter an approved client company or person only when they are the house issuer.
                    </small>
                  </label>
                  <label>
                    HAWB number
                    <input disabled={locked} value={data.hawbNumber} onChange={(e) => set("hawbNumber", e.target.value)} />
                  </label>
                  <label>
                    Number format / pattern
                    <input disabled={locked} value={data.hawbNumberFormat} onChange={(e) => set("hawbNumberFormat", e.target.value)} />
                    <small className="field-help">
                      You control this internal pattern. Optional conventions include {'{YYYY}'}, {'{YY}'} and {'{####}'}; the issued number always remains editable.
                    </small>
                  </label>
                </div>
              </fieldset>
            )}
            {doc === "HBL" && (
              <fieldset>
                <legend>House Bill of Lading control</legend>
                <div className="grid">
                  <label className="wide">
                    HBL issued by
                    <input
                      disabled={locked}
                      value={data.hblIssuerName}
                      placeholder={houseBlIssuerName}
                      onChange={(e) => set("hblIssuerName", e.target.value)}
                    />
                    <small className="field-help">
                      Defaults to the Main User’s organisation or legal name. Use an approved freight forwarder, NVOCC or client identity only when that party is the actual house-bill issuer.
                    </small>
                  </label>
                  <label>
                    HBL number
                    <input disabled={locked} value={data.hblNumber} onChange={(e) => set("hblNumber", e.target.value)} />
                  </label>
                  <label>
                    Number format / pattern
                    <input disabled={locked} value={data.hblNumberFormat} onChange={(e) => set("hblNumberFormat", e.target.value)} />
                    <small className="field-help">
                      The house issuer controls this pattern. The issued number remains editable.
                    </small>
                  </label>
                  <label>
                    Release / negotiability
                    <select disabled={locked} value={data.hblReleaseType} onChange={(e) => set("hblReleaseType", e.target.value)}>
                      <option>ORIGINAL — NEGOTIABLE</option>
                      <option>NON-NEGOTIABLE</option>
                      <option>SEA WAYBILL / EXPRESS RELEASE</option>
                      <option>SURRENDERED</option>
                    </select>
                  </label>
                  <label>
                    Number of originals
                    <input disabled={locked} value={data.hblOriginals} onChange={(e) => set("hblOriginals", e.target.value)} />
                  </label>
                </div>
                <p className="privacy-note">
                  This is a UN Layout Key-aligned house-bill draft. It is not a licensed FIATA FBL and becomes an issued transport document only through the authorized house issuer’s controlled terms, signature and release process.
                </p>
              </fieldset>
            )}
            <fieldset>
              <legend>
                Goods & details · {goodsLines.length} line
                {goodsLines.length !== 1 ? "s" : ""}
              </legend>
              {goodsLines.map((line, index) => (
                <div className="goods-line" key={index}>
                  <div className="goods-line-head">
                    <b>Item {index + 1}</b>
                    {index > 0 && !locked && (
                      <button
                        onClick={() =>
                          setExtraGoods((gs) =>
                            gs.filter((_, i) => i !== index - 1),
                          )
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid">
                    {(
                      [
                        ["Description", "description"],
                        ["Botanical name", "botanicalName"],
                        ["Packages", "packages"],
                        ["Quantity", "quantity"],
                        ["Gross weight", "grossWeight"],
                        ["Net weight", "netWeight"],
                        ["Origin criterion", "originCriterion"],
                      ] as [string, keyof Goods][]
                    ).map(([l, k]) => (
                      <label
                        className={
                          k === "description" || k === "originCriterion"
                            ? "wide"
                            : ""
                        }
                        key={k}
                      >
                        {l}
                        <input
                          disabled={locked}
                          value={line[k]}
                          onChange={(e) =>
                            index === 0
                              ? setGood(k, e.target.value)
                              : setExtraGood(index - 1, k, e.target.value)
                          }
                        />
                      </label>
                    ))}
                    <label className="wide hs-selector">
                      WCO HS 2022 candidate
                      <select disabled={locked} value={line.hsCode} onChange={(e) => {
                        const chosen = hsCatalog.find((entry) => entry.code === e.target.value);
                        if (!chosen) return;
                        if (index === 0) { setGood("hsCode", chosen.code); setGood("description", chosen.name); }
                        else { setExtraGood(index - 1, "hsCode", chosen.code); setExtraGood(index - 1, "description", chosen.name); }
                      }}>
                        <option value="">Type a goods name, then choose an HS result</option>
                        {line.hsCode && !hsCandidates(line.description).some((entry) => entry.code === line.hsCode) && <option value={line.hsCode}>{line.hsCode} — Current selection</option>}
                        {hsCandidates(line.description).map((entry) => <option key={entry.code} value={entry.code}>{entry.code} — {entry.name}</option>)}
                      </select>
                      <small className="field-help">Selecting a result replaces the goods wording with the WCO nomenclature name. Confirm classification against the GIRs, legal notes and Nepal/destination tariff before filing.</small>
                      <a href="https://www.wcotradetools.org/en/harmonized-system" target="_blank" rel="noreferrer">Search the official WCO nomenclature ↗</a>
                    </label>
                  </div>
                </div>
              ))}
              {!locked && (
                <button className="add-line" onClick={addGoodsLine}>
                  + Add goods item
                </button>
              )}
              <div className={`phyto-alert ${phyto.possible ? "possible" : "clear"}`}>
                <ShieldCheck size={17} />
                <div>
                  <b>{phyto.possible ? "Possible phytosanitary control" : "No obvious phytosanitary trigger detected"}</b>
                  <small>{phyto.possible ? `${phyto.matches.length} goods line(s) match plant/product indicators. Confirm against the destination import permit and PQPMC requirements.` : "Screening is indicative only; the importing country or PQPMC may still require certification."}</small>
                  <a href="https://nnsw.gov.np/trade/" target="_blank" rel="noreferrer">Open Nepal National Single Window to request/track LPCO ↗</a>
                </div>
              </div>
            </fieldset>
            {doc === "PACKING_LIST" && (
              <fieldset className="packing-builder">
                <legend>Box allocation & freight calculator</legend>
                <div className="packing-config">
                  <label>
                    Exact number of boxes
                    <input
                      type="number"
                      min="0"
                      max="100"
                      disabled={locked}
                      value={boxes.length || ""}
                      onChange={(e) => setBoxCount(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Air volume divisor (cm³/kg)
                    <input
                      type="number"
                      min="1"
                      disabled={locked}
                      value={airDivisor}
                      onChange={(e) =>
                        setAirDivisor(Number(e.target.value) || 6000)
                      }
                    />
                  </label>
                  <div>
                    <b>IATA/general air:</b> dimensions ÷ 6,000. Carrier
                    exceptions remain configurable.
                  </div>
                </div>
                {boxes.map((box, boxIndex) => {
                  const m = boxMetrics(box, airDivisor);
                  return (
                    <div className="box-card" key={box.id}>
                      <div className="box-card-head">
                        <b>
                          BOX {boxIndex + 1} / {boxes.length}
                        </b>
                        <span>
                          {m.cbm.toFixed(4)} CBM · {m.volumetricKg.toFixed(2)}{" "}
                          kg volumetric · {m.chargeableKg.toFixed(2)} kg box
                          chargeable
                        </span>
                      </div>
                      <div className="box-dimensions">
                        <label>
                          Length (cm)
                          <input
                            type="number"
                            min="0"
                            disabled={locked}
                            value={box.lengthCm || ""}
                            onChange={(e) =>
                              updateBox(
                                boxIndex,
                                "lengthCm",
                                Number(e.target.value),
                              )
                            }
                          />
                        </label>
                        <label>
                          Width (cm)
                          <input
                            type="number"
                            min="0"
                            disabled={locked}
                            value={box.widthCm || ""}
                            onChange={(e) =>
                              updateBox(
                                boxIndex,
                                "widthCm",
                                Number(e.target.value),
                              )
                            }
                          />
                        </label>
                        <label>
                          Height (cm)
                          <input
                            type="number"
                            min="0"
                            disabled={locked}
                            value={box.heightCm || ""}
                            onChange={(e) =>
                              updateBox(
                                boxIndex,
                                "heightCm",
                                Number(e.target.value),
                              )
                            }
                          />
                        </label>
                        <label>
                          Actual kg
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={locked}
                            value={box.actualWeightKg || ""}
                            onChange={(e) =>
                              updateBox(
                                boxIndex,
                                "actualWeightKg",
                                Number(e.target.value),
                              )
                            }
                          />
                        </label>
                        <label>
                          CBM override
                          <input
                            type="number"
                            min="0"
                            step="0.0001"
                            disabled={locked}
                            value={box.manualCbm || ""}
                            onChange={(e) =>
                              updateBox(
                                boxIndex,
                                "manualCbm",
                                Number(e.target.value),
                              )
                            }
                          />
                        </label>
                      </div>
                      <div className="allocations">
                        <small>
                          Allocate only goods already declared above. The
                          available balance updates across boxes.
                        </small>
                        {goodsLines.map((g, lineIndex) => {
                          const remaining = Math.max(
                            0,
                            numeric(g.quantity) - allocatedForLine(lineIndex),
                          );
                          return (
                            <label key={lineIndex}>
                              <span>
                                <b>
                                  {g.description ||
                                    `Goods item ${lineIndex + 1}`}
                                </b>
                                <small>
                                  Declared {g.quantity || 0} · remaining{" "}
                                  {remaining}
                                </small>
                              </span>
                              <input
                                type="number"
                                min="0"
                                max={
                                  remaining + (box.allocations[lineIndex] || 0)
                                }
                                disabled={locked}
                                value={box.allocations[lineIndex] || ""}
                                onChange={(e) =>
                                  setAllocation(
                                    boxIndex,
                                    lineIndex,
                                    Number(e.target.value),
                                  )
                                }
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {boxes.length > 0 && (
                  <div className="calculator-summary">
                    {(() => {
                      const ms = boxes.map((b) => boxMetrics(b, airDivisor));
                      const actual = boxes.reduce(
                          (s, b) => s + b.actualWeightKg,
                          0,
                        ),
                        vol = ms.reduce((s, m) => s + m.volumetricKg, 0),
                        cbm = ms.reduce((s, m) => s + m.cbm, 0),
                        perBox = ms.reduce((s, m) => s + m.chargeableKg, 0);
                      return (
                        <>
                          <span>
                            Total actual <b>{actual.toFixed(2)} kg</b>
                          </span>
                          <span>
                            Total volumetric <b>{vol.toFixed(2)} kg</b>
                          </span>
                          <span>
                            Total CBM <b>{cbm.toFixed(4)}</b>
                          </span>
                          <span>
                            Shipment max{" "}
                            <b>{Math.max(actual, vol).toFixed(2)} kg</b>
                          </span>
                          <span>
                            Per-box higher sum <b>{perBox.toFixed(2)} kg</b>
                          </span>
                          <strong>
                            Final displayed chargeable:{" "}
                            {Math.max(actual, vol, perBox).toFixed(2)} kg
                          </strong>
                          <small>
                            Ocean LCL reference: {cbm.toFixed(4)} CBM versus{" "}
                            {(actual / 1000).toFixed(4)} weight tonnes (W/M
                            basis); carrier tariff controls. FCL is
                            container-rated.
                          </small>
                        </>
                      );
                    })()}
                  </div>
                )}
              </fieldset>
            )}
            {doc === "COO" && (
              <fieldset>
                <legend>Destination ruleset</legend>
                <div className="countries">
                  {(Object.keys(destinations) as Destination[]).map((k) => (
                    <button
                      disabled={locked}
                      className={data.country === k ? "chosen" : ""}
                      onClick={() => setData((d) => ({ ...d, country: k }))}
                      key={k}
                    >
                      {k === "GULF" ? "GCC" : k}
                    </button>
                  ))}
                </div>
                <div className={`rule-card ${rule.kind}`}>
                  <div>
                    <b>{rule.program}</b>
                    <span>{rule.status}</span>
                  </div>
                  <p>{rule.proof}</p>
                  <ul>
                    {rule.rules.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                  <a href={rule.url} target="_blank">
                    {rule.source} ↗
                  </a>
                </div>
              </fieldset>
            )}
          </div>
          <div className="preview-pane">
            <div className="preview-actions">
              <div>
                <p className="eyebrow">LIVE PREVIEW</p>
                <span className="version">
                  A4 · 210 × 297 mm · auto-pagination
                </span>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={doc === "PACKING_LIST" ? false : edit}
                  disabled={doc === "PACKING_LIST"}
                  onChange={(e) => setEdit(e.target.checked)}
                />
                <span />{" "}
                {doc === "PACKING_LIST"
                  ? "Derived from box allocation"
                  : "Edit document"}
              </label>
            </div>
            {errors.length > 0 && (
              <div className="errors">
                <Info size={17} />
                <div>
                  <b>
                    {errors.length} item{errors.length > 1 ? "s" : ""} to review
                  </b>
                  {errors.map((x) => (
                    <small key={x}>{x}</small>
                  ))}
                </div>
              </div>
            )}
            <article
              className="paper source-paper"
              contentEditable={edit && doc !== "PACKING_LIST"}
              suppressContentEditableWarning
            >
              <div className="draft-ribbon">DRAFT · NOT ISSUED</div>
              {doc === "MAWB" ? (
                <AwbForm d={data} lines={goodsLines} boxes={boxes} divisor={airDivisor} />
              ) : doc === "HAWB" ? (
                <AwbForm d={data} lines={goodsLines} boxes={boxes} divisor={airDivisor} houseIssuerName={houseIssuerName} />
              ) : doc === "BILL_OF_LADING" ? (
                <BlForm d={data} lines={goodsLines} boxes={boxes} divisor={airDivisor} />
              ) : doc === "HBL" ? (
                <BlForm d={data} lines={goodsLines} boxes={boxes} divisor={airDivisor} houseIssuerName={houseBlIssuerName} />
              ) : doc === "COMMERCIAL_INVOICE" ? (
                <CommercialInvoice d={data} lines={goodsLines} />
              ) : doc === "PACKING_LIST" ? (
                <PackingList
                  d={data}
                  lines={goodsLines}
                  boxes={boxes}
                  divisor={airDivisor}
                />
              ) : doc === "PHYTOSANITARY" ? (
                <PhytosanitaryCertificate d={data} lines={goodsLines} />
              ) : data.country === "UK" ? (
                <StatementOrigin d={data} kind="UK" />
              ) : data.country === "EU" ? (
                <StatementOrigin d={data} kind="EU" />
              ) : data.country === "CA" || data.country === "AU" ? (
                <FormA d={data} destination={rule.name} />
              ) : data.country === "IN" ? (
                <TreatyCoo d={data} kind="IN" />
              ) : data.country === "CN" ? (
                <TreatyCoo d={data} kind="CN" />
              ) : (
                <OrdinaryCoo d={data} destination={rule.name} />
              )}
            </article>
            <label className="notes">
              Manual notes (included in DOCX)
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add filing notes or special instructions…"
              />
            </label>
            <div className="export-bar">
              <div>
                <Sparkles size={18} />
                <span>
                  <b>Ready for authority/carrier review</b>
                  <small>
                    Layout follows the applicable document family; official
                    serials, carrier terms, signatures and stamps remain
                    controlled by the issuer.
                  </small>
                </span>
              </div>
              <button onClick={() => window.print()}>
                <Download size={17} /> PDF
              </button>
              <button className="primary" onClick={exportDocx}>
                <Download size={17} /> DOCX
              </button>
            </div>
          </div>
        </section>
        </div>
        <footer>
          <Info size={14} /> This tool prepares drafts; it does not issue or
          certify a COO, MAWB/HAWB, or carrier/house Bill of Lading. Carrier, house issuer and
          competent-authority approval remain required.
        </footer>
      </main>
    </div>
  );
}
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}
createRoot(document.getElementById("root")!).render(<App />);
