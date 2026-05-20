import { NextResponse } from "next/server";

import { defaultSystemSettings, type SystemSettings } from "@/lib/telemetry";
import { readJsonFile, writeJsonFile } from "@/lib/server-store";

const settingsFile = "settings.json";

export async function GET() {
  const settings = await readJsonFile<SystemSettings>(settingsFile, defaultSystemSettings);
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { settings?: Partial<SystemSettings> };
  const source = body.settings || {};
  const settings: SystemSettings = {
    alarmRetentionMonths: clampNumber(source.alarmRetentionMonths, 1, 120, defaultSystemSettings.alarmRetentionMonths),
    rawRetentionDays: clampNumber(source.rawRetentionDays, 1, 365, defaultSystemSettings.rawRetentionDays),
    rollupRetentionMonths: clampNumber(source.rollupRetentionMonths, 1, 120, defaultSystemSettings.rollupRetentionMonths),
  };

  await writeJsonFile(settingsFile, settings);
  return NextResponse.json({ settings });
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

