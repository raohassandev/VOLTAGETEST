import { prisma } from "../src/lib/db";
async function main() {
  const r = await prisma.alarmRule.updateMany({
    where: { metric: { in: ["ct_in", "ct_out"] } },
    data: { highWarning: 50, highCritical: 60 },
  });
  console.log("Updated", r.count, "rules");
  const rules = await prisma.alarmRule.findMany({ where: { metric: { in: ["ct_in", "ct_out"] } } });
  for (const rule of rules)
    console.log(`  ${rule.label} (${rule.metric}): highWarn=${rule.highWarning} highCrit=${rule.highCritical}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
