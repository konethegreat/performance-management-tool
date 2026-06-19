// Cron-ready reminder sweep. Notifies reviewers of due-soon/overdue feedback and
// emails each owning manager a team digest (log-only unless EMAIL_ENABLED).
//
// Run on a schedule, e.g. Windows Task Scheduler or cron:
//   cd backend && npm run reminders      (or: node scripts/reminders.js)

import "dotenv/config";
import { sweepReminders } from "../src/lib/reminders.js";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const summary = await sweepReminders();
  console.log("Reminder sweep complete:", JSON.stringify(summary, null, 2));
}

main()
  .catch((e) => { console.error("Reminder sweep failed:", e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
