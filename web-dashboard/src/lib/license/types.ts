export type LicenseFeature = "history" | "reports" | "ota" | "board_config";

export interface LicensePayload {
  schema: "ums-license-v1";
  licenseId: string;
  customerName: string;
  resellerName?: string;
  siteName?: string;
  plan?: string;
  maxUps: number;
  features: Partial<Record<LicenseFeature, boolean>>;
  validFrom: string;
  validUntil?: string | null;
  graceDays?: number;
  machineCode: string;
  fingerprintVersion?: string;
  issuedAt: string;
}

export interface LicenseEnvelope {
  payload: string;
  signature: string;
  algorithm: "Ed25519";
}

export type LicenseState =
  | "disabled"
  | "missing"
  | "active"
  | "grace"
  | "expired"
  | "invalid"
  | "wrong_machine"
  | "over_limit";

export interface LicenseStatus {
  enforcementEnabled: boolean;
  state: LicenseState;
  canAddUps: boolean;
  liveMonitoringAllowed: boolean;
  alarmsAllowed: boolean;
  usedUps: number;
  maxUps: number | null;
  remainingUps: number | null;
  machineCode: string;
  message: string;
  license?: LicensePayload;
  features: Record<LicenseFeature, boolean>;
  expiresAt?: string | null;
  graceEndsAt?: string | null;
}
