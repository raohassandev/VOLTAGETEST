/**
 * Seed script — run with: npm run db:seed
 *
 * Always:
 *   - Creates default SystemSettings if missing.
 *
 * With --demo flag only:
 *   - Creates a demo site, two UPS units, and two devices.
 *   - Never inserts demo data in production unless --demo is explicitly passed.
 *
 * Usage:
 *   npm run db:seed            # production-safe: settings only
 *   npm run db:seed -- --demo  # development: also insert demo data
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["warn", "error"] });
const isDemo = process.argv.includes("--demo");

async function main() {
  console.log("[seed] Starting…");

  // Always: ensure SystemSettings row exists
  const settings = await prisma.systemSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      rawRetentionDays: 30,
      rollupRetentionMonths: 12,
      alarmRetentionMonths: 24,
      offlineThresholdSecs: 60,
    },
    update: {},
  });
  console.log(`[seed] SystemSettings: rawRetentionDays=${settings.rawRetentionDays}, rollupRetentionMonths=${settings.rollupRetentionMonths}`);

  if (!isDemo) {
    console.log("[seed] Done. Pass --demo to also insert sample site/UPS/device data.");
    return;
  }

  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    console.error("[seed] BLOCKED: --demo must not run in production without --force.");
    process.exit(1);
  }

  console.log("[seed] Inserting demo data…");

  const site = await prisma.site.upsert({
    where: { siteId: "SITE-DEMO" },
    create: { siteId: "SITE-DEMO", name: "Demo Headquarters" },
    update: {},
  });

  const ups1 = await prisma.upsUnit.upsert({
    where: { upsId: "UPS-DEMO-F1-01" },
    create: {
      upsId: "UPS-DEMO-F1-01",
      name: "Server Room A",
      serial: "DEMO-SN-001",
      siteId: site.id,
      floor: "Floor 1",
      location: "Server Room A",
      capacityVa: 3000,
      batteryNominalV: 48,
    },
    update: {},
  });

  const ups2 = await prisma.upsUnit.upsert({
    where: { upsId: "UPS-DEMO-F2-01" },
    create: {
      upsId: "UPS-DEMO-F2-01",
      name: "Server Room B",
      serial: "DEMO-SN-002",
      siteId: site.id,
      floor: "Floor 2",
      location: "Server Room B",
      capacityVa: 6000,
      batteryNominalV: 48,
    },
    update: {},
  });

  await prisma.device.upsert({
    where: { deviceId: "UPSMON-DEMO-01" },
    create: {
      deviceId: "UPSMON-DEMO-01",
      upsUnitId: ups1.id,
      siteId: site.id,
      firmware: "0.4.0",
      online: false,
    },
    update: {},
  });

  await prisma.device.upsert({
    where: { deviceId: "UPSMON-DEMO-02" },
    create: {
      deviceId: "UPSMON-DEMO-02",
      upsUnitId: ups2.id,
      siteId: site.id,
      firmware: "0.4.0",
      online: false,
    },
    update: {},
  });

  console.log("[seed] Demo data inserted: 1 site, 2 UPS units, 2 devices.");
}

main()
  .catch((err) => {
    console.error("[seed] Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
