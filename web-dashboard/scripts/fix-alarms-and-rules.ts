/**
 * 1. Rename old "Input/Output" labels in alarm messages to "Primary/Secondary"
 * 2. Rename AlarmRule labels from "Input Voltage"/"Output Voltage" to "Primary/Secondary"
 * 3. Seed missing ct_in / ct_out alarm rules into the DB
 */
import { prisma } from "../src/lib/db";

async function main() {
  // ── 1. Fix active alarm messages (fetch-and-update, no string fn in Prisma) ─
  const messageRenames: [string, string][] = [
    ["Input Current",  "Primary Current"],
    ["Output Current", "Secondary Current"],
    ["Input Voltage",  "Primary Voltage"],
    ["Output Voltage", "Secondary Voltage"],
  ];

  for (const [from, to] of messageRenames) {
    const alarms = await prisma.alarm.findMany({ where: { message: { contains: from } } });
    for (const a of alarms) {
      const newMsg = a.message.replaceAll(from, to);
      await prisma.alarm.update({ where: { id: a.id }, data: { message: newMsg } });
      console.log(`  Alarm msg: "${a.message}" → "${newMsg}"`);
    }
  }

  // ── 2. Fix AlarmRule labels ────────────────────────────────────────────────
  const labelFixes: [string, string][] = [
    ["Input Voltage",  "Primary Voltage"],
    ["Output Voltage", "Secondary Voltage"],
  ];
  for (const [from, to] of labelFixes) {
    const updated = await prisma.alarmRule.updateMany({ where: { label: from }, data: { label: to } });
    if (updated.count > 0) console.log(`Rule label: "${from}" → "${to}" (${updated.count})`);
  }

  // ── 3. Seed ct_in / ct_out rules if missing ────────────────────────────────
  const ctMetrics = [
    { metric: "ct_in",  label: "Primary Current",  key: "ct_in_default"  },
    { metric: "ct_out", label: "Secondary Current", key: "ct_out_default" },
  ];
  for (const m of ctMetrics) {
    const exists = await prisma.alarmRule.findFirst({
      where: { metric: m.metric, deviceId: null, upsUnitId: null, siteId: null },
    });
    if (!exists) {
      await prisma.alarmRule.create({
        data: {
          key: m.key, label: m.label, metric: m.metric,
          highWarning: 28, highCritical: 32,
          debounceSeconds: 30, hysteresisPercent: 2, enabled: true,
        },
      });
      console.log(`Created rule: ${m.label} (highWarn=28 A, highCrit=32 A)`);
    } else {
      console.log(`Rule already exists for ${m.metric} — skipped`);
    }
  }

  // ── 4. Final state ─────────────────────────────────────────────────────────
  const rules = await prisma.alarmRule.findMany({ orderBy: { createdAt: "asc" } });
  console.log(`\nAlarm rules (${rules.length}):`);
  for (const r of rules) {
    console.log(`  [${r.enabled ? "ON" : "OFF"}] ${r.label} (${r.metric}) — lowW:${r.lowWarning ?? "—"} lowC:${r.lowCritical ?? "—"} highW:${r.highWarning ?? "—"} highC:${r.highCritical ?? "—"}`);
  }

  const active = await prisma.alarm.findMany({ where: { state: "active" }, orderBy: { firstSeenAt: "desc" } });
  console.log(`\nActive alarms (${active.length}):`);
  for (const a of active) {
    console.log(`  [${a.severity.toUpperCase()}] ${a.metric}: ${a.message}`);
  }

  console.log("\nDone.");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
