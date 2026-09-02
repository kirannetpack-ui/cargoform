import type { NotificationEventInput, NotificationRecipient } from "./notification-events.js";

function label(type: string) {
  return type.toLowerCase().split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

export function renderNotificationEmail(event: NotificationEventInput, recipient: NotificationRecipient, senderName = "CargoForm") {
  const action = event.actionUrl ? `\n\nOpen CargoForm securely to review or take action:\n${event.actionUrl}` : "";
  return {
    subject: `[CargoForm] ${event.title}`.replace(/[\r\n]+/g, " "),
    textBody: `Dear ${recipient.displayName || "CargoForm User"},

${event.detail}${action}

Event: ${label(event.eventType)}
Reference: ${event.entityId || "Not applicable"}

For your protection, this notice does not include confidential shipment, account, payment or document data. Please sign in directly to CargoForm before taking action.

Kind regards,
${senderName}
CargoForm Notification Service`,
  };
}
