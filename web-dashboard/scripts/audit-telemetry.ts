import { prisma } from "../src/lib/db";

async function main() {
  const all = await prisma.telemetryLatest.findMany({ select: { deviceId: true } });
  console.log("All TelemetryLatest deviceIds:", all.map((r) => r.deviceId));

  const active = await prisma.device.findMany({ where: { active: true }, select: { deviceId: true, online: true } });
  console.log("Active devices:", active);

  const allDevices = await prisma.device.findMany({ select: { deviceId: true, active: true } });
  console.log("All devices:", allDevices);

  // Delete orphaned TelemetryLatest (device was hard-deleted)
  const activeIds = new Set(allDevices.map((d) => d.deviceId));
  const orphaned = all.filter((r) => !activeIds.has(r.deviceId));
  if (orphaned.length > 0) {
    console.log("Deleting orphaned TelemetryLatest rows:", orphaned.map((r) => r.deviceId));
    await prisma.telemetryLatest.deleteMany({ where: { deviceId: { in: orphaned.map((r) => r.deviceId) } } });
    console.log("Done.");
  } else {
    console.log("No orphaned rows.");
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
