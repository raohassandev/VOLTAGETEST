-- Offline license state. Only one active system license row is used in V1.
CREATE TABLE "SystemLicense" (
    "id" TEXT NOT NULL DEFAULT 'active',
    "licenseId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "resellerName" TEXT,
    "siteName" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'basic',
    "maxUps" INTEGER NOT NULL,
    "features" JSONB NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "graceDays" INTEGER NOT NULL DEFAULT 30,
    "machineCode" TEXT NOT NULL,
    "fingerprintVersion" TEXT NOT NULL DEFAULT 'v1',
    "payloadB64" TEXT NOT NULL,
    "signatureB64" TEXT NOT NULL,
    "rawLicense" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3),
    "clockLastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemLicense_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SystemLicense_licenseId_key" ON "SystemLicense"("licenseId");

-- Seat allocation is intentionally string-based in V1 to keep licensing independent
-- of future inventory relation refactors.
CREATE TABLE "LicenseSeat" (
    "id" TEXT NOT NULL,
    "seatNo" INTEGER NOT NULL,
    "upsId" TEXT NOT NULL,
    "deviceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,
    "releasedAt" TIMESTAMP(3),
    "releaseEligibleAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LicenseSeat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LicenseSeat_upsId_key" ON "LicenseSeat"("upsId");
CREATE INDEX "LicenseSeat_status_idx" ON "LicenseSeat"("status");
CREATE INDEX "LicenseSeat_deviceId_idx" ON "LicenseSeat"("deviceId");
