/**
 * Usage: npx tsx scripts/delete-device.ts <deviceId>
 * Hard-deletes a device and all its associated data (telemetry, alarms, audit logs).
 */
import { prisma } from "../src/lib/db";

const PROTECTED = ["UMS-3076F5A5AD54"];

async function main() {
  const deviceId = process.argv[2];
  if (!deviceId) { console.error("Usage: npx tsx scripts/delete-device.ts <deviceId>"); process.exit(1); }
  if (PROTECTED.includes(deviceId)) { console.error(`BLOCKED: ${deviceId} is a protected device.`); process.exit(1); }

  const device = await prisma.device.findUnique({ where: { deviceId } });
  if (!device) { console.error(`Device not found: ${deviceId}`); process.exit(1); }

  // Must delete in FK dependency order
  await prisma.telemetryRaw.deleteMany({ where: { deviceId } });
  await prisma.telemetryLatest.deleteMany({ where: { deviceId } });
  await prisma.telemetry1m.deleteMany({ where: { deviceId } });
  await prisma.alarm.deleteMany({ where: { deviceId } });
  await prisma.auditLog.deleteMany({ where: { entity: "device", entityId: deviceId } });
  await prisma.device.delete({ where: { deviceId } });

  console.log(`Deleted ${deviceId} and all its data.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
