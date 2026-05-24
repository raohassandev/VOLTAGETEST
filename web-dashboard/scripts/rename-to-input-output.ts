/**
 * Rename Primary→Input / Secondary→Output in DB alarm rules and alarm messages
 */
import { prisma } from "../src/lib/db";

const renames: [string, string][] = [
  ["Primary Voltage",  "Input Voltage"],
  ["Secondary Voltage","Output Voltage"],
  ["Primary Current",  "Input Current"],
  ["Secondary Current","Output Current"],
  ["Primary Apparent Power",  "Input Apparent Power"],
  ["Secondary Apparent Power","Output Apparent Power"],
  ["Primary Active Power",  "Input Active Power"],
  ["Secondary Active Power","Output Active Power"],
  ["Primary Power Factor",  "Input Power Factor"],
  ["Secondary Power Factor","Output Power Factor"],
  ["Primary Reactive Power",  "Input Reactive Power"],
  ["Secondary Reactive Power","Output Reactive Power"],
  ["Primary Energy",  "Input Energy"],
  ["Secondary Energy","Output Energy"],
  ["Primary Frequency",  "Input Frequency"],
  ["Secondary Frequency","Output Frequency"],
];

async function main() {
  // AlarmRule labels
  for (const [from, to] of renames) {
    const r = await prisma.alarmRule.updateMany({ where: { label: from }, data: { label: to } });
    if (r.count > 0) console.log(`Rule label: "${from}" → "${to}" (${r.count})`);
  }

  // Alarm messages (fetch+update, no string fn in Prisma)
  const alarms = await prisma.alarm.findMany();
  for (const a of alarms) {
    let msg = a.message;
    for (const [from, to] of renames) msg = msg.replaceAll(from, to);
    if (msg !== a.message) {
      await prisma.alarm.update({ where: { id: a.id }, data: { message: msg } });
      console.log(`Alarm msg: "${a.message}" → "${msg}"`);
    }
  }

  // Final state
  const rules = await prisma.alarmRule.findMany({ orderBy: { metric: "asc" } });
  console.log("\nRules:");
  for (const r of rules) console.log(" ", r.enabled ? "[ON]" : "[OFF]", r.label, `(${r.metric})`);

  await prisma.$disconnect();
  console.log("\nDone.");
}
main().catch((e) => { console.error(e); process.exit(1); });
