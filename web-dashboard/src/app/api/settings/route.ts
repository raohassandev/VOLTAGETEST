import { NextResponse } from "next/server";

import { prisma, isDbEnabled } from "@/lib/db";
import { defaultSystemSettings, type SystemSettings } from "@/lib/telemetry";
import { readJsonFile, writeJsonFile } from "@/lib/server-store";

const settingsFile = "settings.json";

export async function GET() {
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
    };
    return NextResponse.json({ settings, offlineThresholdSecs: row.offlineThresholdSecs });
  }

  const settings = await readJsonFile<SystemSettings>(settingsFile, defaultSystemSettings);
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { settings?: Partial<SystemSettings>; offlineThresholdSecs?: number };
  const source = body.settings || {};
  const settings: SystemSettings = {
    alarmRetentionMonths: clampNumber(source.alarmRetentionMonths, 1, 120, defaultSystemSettings.alarmRetentionMonths),
    rawRetentionDays: clampNumber(source.rawRetentionDays, 1, 365, defaultSystemSettings.rawRetentionDays),
    rollupRetentionMonths: clampNumber(source.rollupRetentionMonths, 1, 120, defaultSystemSettings.rollupRetentionMonths),
  };
  const offlineThresholdSecs = clampNumber(body.offlineThresholdSecs, 10, 3600, 60);

  if (isDbEnabled()) {
    await prisma.systemSettings.upsert({
      where: { id: "default" },
      create: { id: "default", ...settings, offlineThresholdSecs },
      update: { ...settings, offlineThresholdSecs },
    });
    return NextResponse.json({ settings, offlineThresholdSecs });
  }

  await writeJsonFile(settingsFile, settings);
  return NextResponse.json({ settings });
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}
