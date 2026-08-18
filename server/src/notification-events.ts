import type { Prisma } from "@prisma/client";

export const notificationEventTypes = [
  "REGISTRATION_SUBMITTED",
  "REGISTRATION_APPROVED",
  "REGISTRATION_CHANGES_REQUESTED",
  "REGISTRATION_REJECTED",
  "EMAIL_VERIFICATION",
  "PASSWORD_RESET",
  "SECURITY_ALERT",
  "STAFF_INVITED",
  "CLIENT_INVITED",
  "INVITATION_ACCEPTED",
  "CLIENT_SHIPMENT_SUBMITTED",
  "SHIPMENT_RETURNED_FOR_CORRECTION",
  "SHIPMENT_CONFIRMED",
  "SHIPMENT_DEPARTED",
  "SHIPMENT_DELIVERED",
  "SHIPMENT_CANCELLED",
  "CARRIER_PACKAGE_READY",
  "CARRIER_PACKAGE_SENT",
  "CARRIER_RESPONSE_RECEIVED",
  "AMENDMENT_SUBMITTED",
  "AMENDMENT_ACCEPTED",
  "AMENDMENT_DECLINED",
  "DOCUMENT_GENERATED",
  "DOCUMENT_APPROVED",
  "DOCUMENT_REPLACED",
  "LPCO_ACTION_REQUIRED",
  "INVOICE_ISSUED",
  "PAYMENT_RECEIVED",
  "PAYMENT_FAILED",
  "SUBSCRIPTION_CHANGED",
  "CHAT_MESSAGE_RECEIVED",
] as const;

export type NotificationEventType = (typeof notificationEventTypes)[number];
export type NotificationRecipient = { userId: string; email: string; displayName: string };

export type NotificationEventInput = {
  eventKey: string;
  eventType: NotificationEventType;
  organisationId: string;
  actorUserId?: string;
  entityType: string;
  entityId?: string;
  recipients: NotificationRecipient[];
  title: string;
  detail: string;
  actionUrl?: string;
  metadata?: Prisma.InputJsonValue;
};

// Recipient lists must come from tenant-scoped domain services. Never accept an
// arbitrary recipient list directly from a browser request.
export const routingPolicy: Record<NotificationEventType, string> = {
  REGISTRATION_SUBMITTED: "Platform Admin reviewers and applicant",
  REGISTRATION_APPROVED: "Applicant and authorized Main User owners",
  REGISTRATION_CHANGES_REQUESTED: "Applicant and authorized Main User owners",
  REGISTRATION_REJECTED: "Applicant only",
  EMAIL_VERIFICATION: "Identity owner only",
  PASSWORD_RESET: "Identity owner only",
  SECURITY_ALERT: "Identity owner and permitted security administrators",
  STAFF_INVITED: "Invited staff member and Main User owners",
  CLIENT_INVITED: "Invited client and owning Main User",
  INVITATION_ACCEPTED: "Invitee and owning Main User",
  CLIENT_SHIPMENT_SUBMITTED: "Owning Main User operations/reviewers only",
  SHIPMENT_RETURNED_FOR_CORRECTION: "Submitting client and owning Main User",
  SHIPMENT_CONFIRMED: "Owning Main User and explicitly selected client contacts",
  SHIPMENT_DEPARTED: "Owning Main User and explicitly selected client contacts",
  SHIPMENT_DELIVERED: "Owning Main User and explicitly selected client contacts",
  SHIPMENT_CANCELLED: "Owning Main User and affected client contacts",
  CARRIER_PACKAGE_READY: "Owning Main User operations/reviewers only",
  CARRIER_PACKAGE_SENT: "Selected carrier recipients and owning Main User operations",
  CARRIER_RESPONSE_RECEIVED: "Owning Main User operations/reviewers only",
  AMENDMENT_SUBMITTED: "Owning Main User operations and permitted carrier recipients",
  AMENDMENT_ACCEPTED: "Requester and owning Main User operations",
  AMENDMENT_DECLINED: "Requester and owning Main User operations",
  DOCUMENT_GENERATED: "Selected shipment participants",
  DOCUMENT_APPROVED: "Selected shipment participants",
  DOCUMENT_REPLACED: "Recipients of the superseded document",
  LPCO_ACTION_REQUIRED: "Owning Main User compliance/operations contacts",
  INVOICE_ISSUED: "Payer billing contacts and issuer finance contacts",
  PAYMENT_RECEIVED: "Payer and issuer finance contacts",
  PAYMENT_FAILED: "Payer and issuer finance contacts",
  SUBSCRIPTION_CHANGED: "Main User owners and Platform Admin billing contacts",
  CHAT_MESSAGE_RECEIVED: "Members of that exact chat thread only",
};

