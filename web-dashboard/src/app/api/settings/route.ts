import { NextResponse } from "next/server";
import { requireApiAuth, requireRole } from "@/lib/api-auth";

import { prisma, isDbEnabled } from "@/lib/db";
import { defaultSystemSettings, type SystemSettings } from "@/lib/telemetry";
import { readJsonFile, writeJsonFile } from "@/lib/server-store";
import { logAudit, requestIp } from "@/lib/audit";

const settingsFile = "settings.json";

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  if (isDbEnabled()) {
    const row = await prisma.systemSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        rawRetentionDays: defaultSystemSettings.rawRetentionDays,
        rollupRetentionMonths: defaultSystemSettings.rollupRetentionMonths,
        alarmRetentionMonths: defaultSystemSettings.alarmRetentionMonths,
        offlineThresholdSecs: 60,
      },
      update: {},
    });
    const settings: SystemSettings = {
      rawRetentionDays: row.rawRetentionDays,
      rollupRetentionMonths: row.rollupRetentionMonths,
      alarmRetentionMonths: row.alarmRetentionMonths,
      offlineThresholdSecs: row.offlineThresholdSecs,
    };
    return NextResponse.json({ settings, offlineThresholdSecs: row.offlineThresholdSecs });
  }

  const settings = await readJsonFile<SystemSettings>(settingsFile, defaultSystemSettings);
  return NextResponse.json({ settings, offlineThresholdSecs: settings.offlineThresholdSecs ?? 60 });
}

export async function PUT(request: Request) {
  const auth = requireRole(request, "admin");
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as { settings?: Partial<SystemSettings>; offlineThresholdSecs?: number };
  const source = body.settings || {};
  const offlineThresholdSecs = clampNumber(body.offlineThresholdSecs ?? source.offlineThresholdSecs, 10, 3600, defaultSystemSettings.offlineThresholdSecs);
  const settings: SystemSettings = {
    alarmRetentionMonths: clampNumber(source.alarmRetentionMonths, 1, 120, defaultSystemSettings.alarmRetentionMonths),
    rawRetentionDays: clampNumber(source.rawRetentionDays, 1, 365, defaultSystemSettings.rawRetentionDays),
    rollupRetentionMonths: clampNumber(source.rollupRetentionMonths, 1, 120, defaultSystemSettings.rollupRetentionMonths),
    offlineThresholdSecs,
  };

  if (isDbEnabled()) {
    await prisma.systemSettings.upsert({
      where: { id: "default" },
      create: { id: "default", rawRetentionDays: settings.rawRetentionDays, rollupRetentionMonths: settings.rollupRetentionMonths, alarmRetentionMonths: settings.alarmRetentionMonths, offlineThresholdSecs },
      update: { rawRetentionDays: settings.rawRetentionDays, rollupRetentionMonths: settings.rollupRetentionMonths, alarmRetentionMonths: settings.alarmRetentionMonths, offlineThresholdSecs },
    });
    await logAudit({ userId: auth.user.username, action: "settings.update", entity: "SystemSettings", entityId: "default", data: settings, ip: requestIp(request) });
    return NextResponse.json({ settings, offlineThresholdSecs });
  }

  await writeJsonFile(settingsFile, settings);
  return NextResponse.json({ settings, offlineThresholdSecs });
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}
