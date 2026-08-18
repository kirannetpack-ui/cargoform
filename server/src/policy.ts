export type StaffRole = "OWNER" | "OPERATIONS" | "REVIEWER" | "FINANCE" | "READ_ONLY";
export type Permission =
  | "ORGANISATION_MANAGE" | "STAFF_MANAGE" | "CLIENT_MANAGE" | "SHIPMENT_EDIT"
  | "CLIENT_SUBMISSION_REVIEW" | "SHIPMENT_CONFIRM" | "TRANSPORT_NUMBER_ASSIGN"
  | "CARRIER_PACKAGE_SEND" | "AMENDMENT_REQUEST" | "DOCUMENT_APPROVE"
  | "CLIENT_BILLING_MANAGE" | "SUBSCRIPTION_VIEW" | "RECORD_VIEW";

const permissions: Record<StaffRole, ReadonlySet<Permission>> = {
  OWNER: new Set(["ORGANISATION_MANAGE", "STAFF_MANAGE", "CLIENT_MANAGE", "SHIPMENT_EDIT", "CLIENT_SUBMISSION_REVIEW", "SHIPMENT_CONFIRM", "TRANSPORT_NUMBER_ASSIGN", "CARRIER_PACKAGE_SEND", "AMENDMENT_REQUEST", "DOCUMENT_APPROVE", "CLIENT_BILLING_MANAGE", "SUBSCRIPTION_VIEW", "RECORD_VIEW"]),
  OPERATIONS: new Set(["CLIENT_MANAGE", "SHIPMENT_EDIT", "CLIENT_SUBMISSION_REVIEW", "SHIPMENT_CONFIRM", "TRANSPORT_NUMBER_ASSIGN", "CARRIER_PACKAGE_SEND", "AMENDMENT_REQUEST", "RECORD_VIEW"]),
  REVIEWER: new Set(["SHIPMENT_EDIT", "CLIENT_SUBMISSION_REVIEW", "SHIPMENT_CONFIRM", "TRANSPORT_NUMBER_ASSIGN", "CARRIER_PACKAGE_SEND", "AMENDMENT_REQUEST", "DOCUMENT_APPROVE", "RECORD_VIEW"]),
  FINANCE: new Set(["CLIENT_BILLING_MANAGE", "SUBSCRIPTION_VIEW", "RECORD_VIEW"]),
  READ_ONLY: new Set(["RECORD_VIEW"]),
};

export function can(role: StaffRole, permission: Permission) { return permissions[role].has(permission); }

export type OperationalShipmentStatus = "DRAFT" | "CLIENT_SUBMITTED" | "UNDER_REVIEW" | "RETURNED_FOR_CORRECTION" | "APPROVED_FOR_BOOKING" | "CONFIRMED" | "DEPARTED" | "DELIVERED" | "CLOSED" | "ON_HOLD" | "CANCELLED";
const transitions: Record<OperationalShipmentStatus, ReadonlySet<OperationalShipmentStatus>> = {
  DRAFT: new Set(["CLIENT_SUBMITTED", "UNDER_REVIEW", "CANCELLED"]),
  CLIENT_SUBMITTED: new Set(["UNDER_REVIEW", "RETURNED_FOR_CORRECTION", "CANCELLED"]),
  UNDER_REVIEW: new Set(["RETURNED_FOR_CORRECTION", "APPROVED_FOR_BOOKING", "CANCELLED", "ON_HOLD"]),
  RETURNED_FOR_CORRECTION: new Set(["CLIENT_SUBMITTED", "UNDER_REVIEW", "CANCELLED"]),
  APPROVED_FOR_BOOKING: new Set(["CONFIRMED", "RETURNED_FOR_CORRECTION", "CANCELLED", "ON_HOLD"]),
  CONFIRMED: new Set(["DEPARTED", "CANCELLED", "ON_HOLD"]),
  DEPARTED: new Set(["DELIVERED", "ON_HOLD"]),
  DELIVERED: new Set(["CLOSED", "ON_HOLD"]),
  CLOSED: new Set(),
  ON_HOLD: new Set(["UNDER_REVIEW", "APPROVED_FOR_BOOKING", "CONFIRMED", "DEPARTED", "DELIVERED", "CANCELLED"]),
  CANCELLED: new Set(),
};

export function canTransitionShipment(from: OperationalShipmentStatus, to: OperationalShipmentStatus) { return transitions[from].has(to); }
export function requiresAmendment(status: OperationalShipmentStatus) { return status === "DEPARTED" || status === "DELIVERED" || status === "CLOSED"; }

export type DocumentStatus = "DRAFT" | "UNDER_REVIEW" | "APPROVED_FOR_SUBMISSION" | "SUBMITTED" | "ISSUED" | "RECEIVED" | "SUPERSEDED";
const documentTransitions: Record<DocumentStatus, ReadonlySet<DocumentStatus>> = {
  DRAFT: new Set(["UNDER_REVIEW"]), UNDER_REVIEW: new Set(["DRAFT", "APPROVED_FOR_SUBMISSION"]),
  APPROVED_FOR_SUBMISSION: new Set(["DRAFT", "SUBMITTED"]), SUBMITTED: new Set(["ISSUED", "RECEIVED"]),
  ISSUED: new Set(["SUPERSEDED"]), RECEIVED: new Set(["SUPERSEDED"]), SUPERSEDED: new Set(),
};
export function canTransitionDocument(from: DocumentStatus, to: DocumentStatus) { return documentTransitions[from].has(to); }

