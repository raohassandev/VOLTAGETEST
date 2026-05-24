/**
 * Pre-handover DB cleanup script.
 *
 * Removes smoke-test / CI devices and their telemetry from the database
 * before handing over to the client.
 *
 * Usage:
 *   npx tsx scripts/cleanup-test-devices.ts [--dry-run]
 *
 * Add more device IDs to TEST_DEVICE_IDS as needed.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["warn", "error"] });

/** Device IDs that are smoke-test / CI artefacts — NOT real field devices. */
const TEST_DEVICE_IDS = [
  "DOCKER-SMOKE-001",
  "DEV-COM11-TEST",
  "TEST-DEVICE",
  "TEST-DEVICE-DUMMY",
];

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN (no changes will be made) ===" : "=== CLEANUP: removing test devices ===");

  const existing = await prisma.device.findMany({
    where: { deviceId: { in: TEST_DEVICE_IDS } },
    select: { deviceId: true },
  });

  if (existing.length === 0) {
    console.log("No test devices found in DB — nothing to do.");
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${existing.length} test device(s): ${existing.map((d) => d.deviceId).join(", ")}`);

  for (const { deviceId } of existing) {
    // Count rows before deleting
    const [rawCount, latestCount, alarmCount] = await Promise.all([
      prisma.telemetryRaw.count({ where: { deviceId } }),
      prisma.telemetryLatest.count({ where: { deviceId } }),
      prisma.alarm.count({ where: { deviceId } }),
    ]);

    console.log(`  ${deviceId}: raw=${rawCount}, latest=${latestCount}, alarms=${alarmCount}`);

    if (!DRY_RUN) {
      // Delete in dependency order
      await prisma.telemetryRaw.deleteMany({ where: { deviceId } });
      await prisma.telemetryLatest.deleteMany({ where: { deviceId } });
      // Delete alarm events before alarms (no FK cascade)
      const alarms = await prisma.alarm.findMany({ where: { deviceId }, select: { id: true } });
      if (alarms.length > 0) {
        await prisma.alarmEvent.deleteMany({ where: { alarmId: { in: alarms.map((a) => a.id) } } });
        await prisma.alarm.deleteMany({ where: { deviceId } });
      }
      await prisma.calibrationProfile.deleteMany({ where: { deviceId } });
      await prisma.device.delete({ where: { deviceId } });
      console.log(`  ✓ Deleted ${deviceId}`);
    }
  }

  if (DRY_RUN) {
    console.log("\nDry-run complete. Re-run without --dry-run to apply changes.");
  } else {
    console.log("\nCleanup complete.");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
