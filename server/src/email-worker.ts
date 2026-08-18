import { db } from "./db.js";
import { sendOutboxEmail } from "./gmail.js";

async function runBatch() {
  await db.emailOutbox.updateMany({ where: { status: "PROCESSING", updatedAt: { lt: new Date(Date.now() - 15 * 60_000) } }, data: { status: "QUEUED", nextAttemptAt: new Date() } });
  const pending = await db.emailOutbox.findMany({ where: { status: "QUEUED", nextAttemptAt: { lte: new Date() } }, orderBy: { createdAt: "asc" }, take: 20 });
  for (const item of pending) {
    const claimed = await db.emailOutbox.updateMany({ where: { id: item.id, status: "QUEUED" }, data: { status: "PROCESSING", attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    try { await sendOutboxEmail(item.id); }
    catch (error) {
      const delayMinutes = Math.min(60, 2 ** Math.min(item.attempts + 1, 6));
      await db.emailOutbox.update({ where: { id: item.id }, data: { status: item.attempts >= 5 ? "FAILED" : "QUEUED", nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000), lastError: error instanceof Error ? error.message.slice(0, 500) : "UNKNOWN_EMAIL_ERROR" } });
    }
  }
}

async function run() {
  for (;;) {
    try { await runBatch(); }
    catch (error) { console.error("Email worker batch failed", error instanceof Error ? error.message : "UNKNOWN_ERROR"); }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
run().finally(() => db.$disconnect());
