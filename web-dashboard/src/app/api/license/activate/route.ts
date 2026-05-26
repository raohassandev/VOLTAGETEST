import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma, isDbEnabled } from "@/lib/db";
import { logAudit, requestIp } from "@/lib/audit";
import { getMachineCode } from "@/lib/license/machine-code";
import { decodeLicenseEnvelope, verifyLicenseEnvelope } from "@/lib/license/verify";

export async function POST(request: Request) {
  const auth = requireRole(request, "manufacturer");
  if (!auth.ok) return auth.response;
  if (!isDbEnabled()) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });

  try {
    const body = await request.json();
    const rawLicense = body.license ?? body.activationKey ?? body;
    const envelope = decodeLicenseEnvelope(rawLicense);
    const payload = verifyLicenseEnvelope(envelope);
    const machineCode = getMachineCode();
    if (payload.machineCode !== machineCode) {
      return NextResponse.json({ error: "License is for a different machine code.", machineCode }, { status: 400 });
    }

    await prisma.systemLicense.upsert({
      where: { id: "active" },
      create: {
        id: "active",
        licenseId: payload.licenseId,
        customerName: payload.customerName,
        resellerName: payload.resellerName ?? null,
        siteName: payload.siteName ?? null,
        plan: payload.plan ?? "basic",
        maxUps: payload.maxUps,
        features: payload.features as never,
        validFrom: new Date(payload.validFrom),
        validUntil: payload.validUntil ? new Date(payload.validUntil) : null,
        graceDays: payload.graceDays ?? 30,
        machineCode: payload.machineCode,
        fingerprintVersion: payload.fingerprintVersion ?? "v1",
        payloadB64: envelope.payload,
        signatureB64: envelope.signature,
        rawLicense: envelope as never,
        status: "active",
        lastVerifiedAt: new Date(),
        clockLastSeenAt: new Date(),
      },
      update: {
        licenseId: payload.licenseId,
        customerName: payload.customerName,
        resellerName: payload.resellerName ?? null,
        siteName: payload.siteName ?? null,
        plan: payload.plan ?? "basic",
        maxUps: payload.maxUps,
        features: payload.features as never,
        validFrom: new Date(payload.validFrom),
        validUntil: payload.validUntil ? new Date(payload.validUntil) : null,
        graceDays: payload.graceDays ?? 30,
        machineCode: payload.machineCode,
        fingerprintVersion: payload.fingerprintVersion ?? "v1",
        payloadB64: envelope.payload,
        signatureB64: envelope.signature,
        rawLicense: envelope as never,
        status: "active",
        lastVerifiedAt: new Date(),
        clockLastSeenAt: new Date(),
      },
    });

    await logAudit({
      userId: auth.user.username,
      action: "license.activate",
      entity: "SystemLicense",
      entityId: payload.licenseId,
      data: { maxUps: payload.maxUps, machineCode: payload.machineCode },
      ip: requestIp(request),
    });
    return NextResponse.json({ ok: true, licenseId: payload.licenseId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid license upload." },
      { status: 400 },
    );
  }
}
