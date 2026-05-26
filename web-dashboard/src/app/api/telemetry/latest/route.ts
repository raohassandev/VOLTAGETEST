import { NextResponse } from "next/server";
import { requireApiAuth, requireRole } from "@/lib/api-auth";

import { prisma, isDbEnabled } from "@/lib/db";
import { getTelemetryStore, recordTelemetry } from "@/lib/mqtt-ingestion";
import { normalizeTelemetry, type RawTelemetry } from "@/lib/telemetry-types";

// Firmware v1.0.0 publishes volt_dc already calibrated in volts (firmware applies vDcScale/vDcOffset
// from NVS before publishing). The worker stores the firmware value as-is. This route returns it
// as-is. No server-side re-calibration.
// Example: firmware sends 24.4 V â†’ stored as 24.4 â†’ returned as 24.4.

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  if (isDbEnabled()) {
    const rows = await prisma.telemetryLatest.findMany({
      where: { device: { active: true } },
      include: { device: { include: { upsUnit: true } } },
    });

    const latest: Record<string, RawTelemetry> = {};
    for (const row of rows) {
      latest[row.deviceId] = {
        volt_in: row.voltIn,
        volt_out: row.voltOut,
        volt_dc: row.voltDc, // firmware-calibrated; no server re-scaling
        ct_in: row.ctIn,
        ct_out: row.ctOut,
        s_in_va: row.sInVa,
        s_out_va: row.sOutVa,
        p_in_w: row.pInW ?? null,
        p_out_w: row.pOutW ?? null,
        pf_in: row.pfIn ?? null,
        pf_out: row.pfOut ?? null,
        e_in_kwh: row.eInKwh ?? null,
        e_out_kwh: row.eOutKwh ?? null,
        freq_in: row.freqIn ?? null,
        freq_out: row.freqOut ?? null,
        q_in_var: row.qInVar ?? null,
        q_out_var: row.qOutVar ?? null,
        device_id: row.deviceId,
        ups_id: row.upsId ?? undefined,
        site_id: row.siteId ?? undefined,
        ip: row.ip ?? "",
        firmware: row.firmware ?? undefined,
        rssi: row.rssi ?? undefined,
        received_at: row.receivedAt.toISOString(),
        uptime_ms: 0,
      };
    }
    return NextResponse.json({ latest });
  }

  const store = await getTelemetryStore();
  return NextResponse.json({ latest: store.latest });
}

export async function POST(request: Request) {
  // Manual telemetry injection is disabled by default.
  // Enable with ENABLE_MANUAL_TELEMETRY_POST=true; even then, only admin/manufacturer may inject.
  if (process.env.ENABLE_MANUAL_TELEMETRY_POST !== "true") {
    return NextResponse.json(
      { error: "Manual telemetry injection is disabled. Set ENABLE_MANUAL_TELEMETRY_POST=true to enable." },
      { status: 403 },
    );
  }

  // Require admin or manufacturer â€” viewer and technician must never inject telemetry.
  const auth = requireRole(request, "admin");
  if (!auth.ok) return auth.response;

  const payload = (await request.json()) as Partial<RawTelemetry>;
  const telemetry = normalizeTelemetry(payload, "api/manual");
  await recordTelemetry(telemetry);
  if (isDbEnabled()) {
    const deviceId = telemetry.device_id ?? "api/manual";
    await prisma.device.upsert({
      where: { deviceId },
      create: { deviceId, lastSeenAt: new Date(), online: true },
      update: { lastSeenAt: new Date(), online: true },
    });
    const data = {
      deviceId,
      upsId: telemetry.ups_id ?? null,
      siteId: telemetry.site_id ?? null,
      receivedAt: new Date(),
      voltIn: telemetry.volt_in,
      voltOut: telemetry.volt_out,
      voltDc: telemetry.volt_dc,
      ctIn: telemetry.ct_in,
      ctOut: telemetry.ct_out,
      sInVa: telemetry.s_in_va ?? telemetry.volt_in * telemetry.ct_in,
      sOutVa: telemetry.s_out_va ?? telemetry.volt_out * telemetry.ct_out,
      pInW: telemetry.p_in_w ?? null,
      pOutW: telemetry.p_out_w ?? null,
      pfIn: telemetry.pf_in ?? null,
      pfOut: telemetry.pf_out ?? null,
      qInVar: telemetry.q_in_var ?? null,
      qOutVar: telemetry.q_out_var ?? null,
      eInKwh: telemetry.e_in_kwh ?? null,
      eOutKwh: telemetry.e_out_kwh ?? null,
      freqIn: telemetry.freq_in ?? null,
      freqOut: telemetry.freq_out ?? null,
      rssi: telemetry.rssi ?? null,
      ip: telemetry.ip ?? null,
      firmware: telemetry.firmware ?? null,
      rawJson: telemetry,
    };
    await prisma.telemetryRaw.create({ data });
    await prisma.telemetryLatest.upsert({
      where: { deviceId },
      create: data,
      update: data,
    });
  }
  return NextResponse.json({ telemetry });
}
