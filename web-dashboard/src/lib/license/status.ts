import type { PrismaClient } from "@prisma/client";
import { getMachineCode } from "./machine-code";
import { isLicenseEnforcementEnabled } from "./keys";
import { verifyLicenseEnvelope } from "./verify";
import type { LicenseFeature, LicensePayload, LicenseStatus } from "./types";

const ALL_FEATURES: LicenseFeature[] = ["history", "reports", "ota", "board_config"];

export async function getUsedUpsCount(prisma: PrismaClient) {
  return prisma.upsUnit.count({ where: { active: true } });
}

function normalizeFeatures(payload?: LicensePayload) {
  return Object.fromEntries(
    ALL_FEATURES.map((feature) => [feature, Boolean(payload?.features?.[feature])]),
  ) as Record<LicenseFeature, boolean>;
}

export async function getLicenseStatus(prisma: PrismaClient, now = new Date()): Promise<LicenseStatus> {
  const machineCode = getMachineCode();
  const usedUps = await getUsedUpsCount(prisma);
  const enforcementEnabled = isLicenseEnforcementEnabled();

  if (!enforcementEnabled) {
    return {
      enforcementEnabled,
      state: "disabled",
      canAddUps: true,
      liveMonitoringAllowed: true,
      alarmsAllowed: true,
      usedUps,
      maxUps: null,
      remainingUps: null,
      machineCode,
      message: "License enforcement is disabled for this environment.",
      features: normalizeFeatures({ features: { history: true, reports: true, ota: true, board_config: true } } as LicensePayload),
    };
  }

  const row = await prisma.systemLicense.findUnique({ where: { id: "active" } });
  if (!row || row.status === "deactivated") {
    return {
      enforcementEnabled,
      state: "missing",
      canAddUps: false,
      liveMonitoringAllowed: true,
      alarmsAllowed: true,
      usedUps,
      maxUps: null,
      remainingUps: null,
      machineCode,
      message: "No valid license is installed. Add UPS units is blocked.",
      features: normalizeFeatures(),
    };
  }

  try {
    const payload = verifyLicenseEnvelope({ payload: row.payloadB64, signature: row.signatureB64, algorithm: "Ed25519" });
    if (payload.machineCode !== machineCode) {
      return {
        enforcementEnabled,
        state: "wrong_machine",
        canAddUps: false,
        liveMonitoringAllowed: true,
        alarmsAllowed: true,
        usedUps,
        maxUps: payload.maxUps,
        remainingUps: Math.max(payload.maxUps - usedUps, 0),
        machineCode,
        message: "Installed license is for a different machine code.",
        license: payload,
        features: normalizeFeatures(payload),
      };
    }

    const validFrom = new Date(payload.validFrom);
    const validUntil = payload.validUntil ? new Date(payload.validUntil) : null;
    const graceDays = payload.graceDays ?? 30;
    const graceEnds = validUntil ? new Date(validUntil.getTime() + graceDays * 24 * 60 * 60 * 1000) : null;
    let state: LicenseStatus["state"] = "active";
    let message = "License is active.";
    if (Number.isNaN(validFrom.getTime()) || validFrom > now) {
      state = "invalid";
      message = "License validity start date is invalid or in the future.";
    } else if (validUntil && now > validUntil && graceEnds && now <= graceEnds) {
      state = "grace";
      message = "License is expired and in grace period. Existing live monitoring and alarms continue.";
    } else if (validUntil && now > validUntil) {
      state = "expired";
      message = "License is expired. Existing live monitoring and alarms continue.";
    } else if (usedUps > payload.maxUps) {
      state = "over_limit";
      message = "Active UPS count exceeds licensed seats.";
    }

    return {
      enforcementEnabled,
      state,
      canAddUps: state === "active" && usedUps < payload.maxUps,
      liveMonitoringAllowed: true,
      alarmsAllowed: true,
      usedUps,
      maxUps: payload.maxUps,
      remainingUps: Math.max(payload.maxUps - usedUps, 0),
      machineCode,
      message,
      license: payload,
      features: normalizeFeatures(payload),
      expiresAt: validUntil?.toISOString() ?? null,
      graceEndsAt: graceEnds?.toISOString() ?? null,
    };
  } catch (error) {
    return {
      enforcementEnabled,
      state: "invalid",
      canAddUps: false,
      liveMonitoringAllowed: true,
      alarmsAllowed: true,
      usedUps,
      maxUps: row.maxUps,
      remainingUps: Math.max(row.maxUps - usedUps, 0),
      machineCode,
      message: error instanceof Error ? error.message : "License verification failed.",
      features: normalizeFeatures(),
    };
  }
}
