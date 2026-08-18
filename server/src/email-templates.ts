import type { NotificationEventInput, NotificationRecipient } from "./notification-events.js";

function label(type: string) {
  return type.toLowerCase().split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

export function renderNotificationEmail(event: NotificationEventInput, recipient: NotificationRecipient) {
  const action = event.actionUrl ? `\n\nOpen CargoForm to review or take action:\n${event.actionUrl}` : "";
  return {
    subject: `[CargoForm] ${event.title}`,
    textBody: `Dear ${recipient.displayName || "CargoForm User"},

${event.detail}${action}

Event: ${label(event.eventType)}
Reference: ${event.entityId || "Not applicable"}

This notification was sent according to your CargoForm communication preferences. Please sign in directly to CargoForm before viewing confidential shipment, account or payment information.

Kind regards,
CargoForm Notification Service
Netpack Logistic
app.netpack@gmail.com`,
  };
}

