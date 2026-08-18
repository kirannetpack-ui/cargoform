import type { Prisma } from "@prisma/client";
import { config } from "./config.js";
import { renderNotificationEmail } from "./email-templates.js";
import type { NotificationEventInput } from "./notification-events.js";

export async function publishNotification(tx: Prisma.TransactionClient, event: NotificationEventInput) {
  const uniqueRecipients = [...new Map(event.recipients.map((recipient) => [recipient.userId, recipient])).values()];
  const preferences = await tx.notificationPreference.findMany({
    where: { organisationId: event.organisationId, eventType: event.eventType, userId: { in: uniqueRecipients.map((recipient) => recipient.userId) } },
  });
  const byUser = new Map(preferences.map((preference) => [preference.userId, preference]));
  const inAppRecipients = uniqueRecipients.filter((recipient) => byUser.get(recipient.userId)?.inAppEnabled !== false);
  const emailRecipients = uniqueRecipients.filter((recipient) => byUser.get(recipient.userId)?.emailEnabled !== false);

  if (inAppRecipients.length) {
    await tx.notification.createMany({
      data: inAppRecipients.map((recipient) => ({ userId: recipient.userId, eventKey: event.eventKey, eventType: event.eventType, category: event.entityType, title: event.title, detail: event.detail })),
      skipDuplicates: true,
    });
  }

  // One provider message per recipient prevents accidental disclosure of other
  // users' addresses and gives each delivery its own idempotency key.
  for (const recipient of emailRecipients) {
    const rendered = renderNotificationEmail(event, recipient);
    await tx.emailOutbox.upsert({
      where: { eventKey: `${event.eventKey}:email:${recipient.userId}` },
      update: {},
      create: { organisationId: event.organisationId, eventKey: `${event.eventKey}:email:${recipient.userId}`, fromEmail: config.GMAIL_EXPECTED_SENDER, toEmails: [recipient.email], ccEmails: [], subject: rendered.subject, textBody: rendered.textBody },
    });
  }

  await tx.auditEvent.create({
    data: { organisationId: event.organisationId, actorUserId: event.actorUserId, action: `NOTIFICATION_${event.eventType}`, entityType: event.entityType, entityId: event.entityId, metadata: event.metadata },
  });
}
