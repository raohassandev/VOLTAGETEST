import { prisma } from "../src/lib/db";

async function main() {
  const alarms = await prisma.alarm.findMany({ orderBy: { firstSeenAt: "desc" } });
  const active  = alarms.filter((a) => a.state === "active");
  const cleared = alarms.filter((a) => a.state === "cleared");

  console.log(`\n=== ACTIVE ALARMS (${active.length}) ===`);
  for (const a of active) {
    console.log(`  [${a.severity.toUpperCase()}] ${a.deviceId} | ${a.metric} | ${a.message}`);
    console.log(`    first: ${a.firstSeenAt.toISOString()}  last: ${a.lastSeenAt.toISOString()}  acked: ${a.acknowledgedAt}`);
  }

  console.log(`\n=== CLEARED ALARMS (${cleared.length}) ===`);
  for (const a of cleared) {
    console.log(`  [${a.severity.toUpperCase()}] ${a.deviceId} | ${a.metric} | ${a.message}  (cleared: ${a.clearedAt?.toISOString() ?? "?"})`);
  }

  const rules = await prisma.alarmRule.findMany({ orderBy: { createdAt: "asc" } });
  console.log(`\n=== ALARM RULES (${rules.length}) — RAW ===`);
  console.log(JSON.stringify(rules, null, 2));

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
