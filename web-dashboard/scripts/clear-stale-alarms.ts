import { prisma } from "../src/lib/db";
async function main() {
  const r = await prisma.alarm.updateMany({
    where: { metric: { in: ["ct_in", "ct_out"] }, state: "active" },
    data: { state: "cleared", clearedAt: new Date() },
  });
  console.log("Cleared", r.count, "stale current alarms (old 28A limit)");

  const active = await prisma.alarm.findMany({ where: { state: "active" } });
  console.log("Active alarms remaining:", active.length);
  for (const a of active) console.log(" ", a.severity.toUpperCase(), a.metric, a.message);

  const rules = await prisma.alarmRule.findMany({ orderBy: { metric: "asc" } });
  console.log("\nAll rules:");
  for (const r of rules)
    console.log(" ", r.enabled ? "[ON]" : "[OFF]", r.label, `(${r.metric})`, "highWarn:", r.highWarning ?? "—", "highCrit:", r.highCritical ?? "—");

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
