-- Add v2 telemetry fields missing from init migration

ALTER TABLE "TelemetryRaw"
  ADD COLUMN IF NOT EXISTS "qInVar"  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "qOutVar" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "freqIn"  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "freqOut" DOUBLE PRECISION;

ALTER TABLE "TelemetryLatest"
  ADD COLUMN IF NOT EXISTS "qInVar"  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "qOutVar" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "freqIn"  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "freqOut" DOUBLE PRECISION;

ALTER TABLE "Telemetry1m"
  ADD COLUMN IF NOT EXISTS "freqInAvg"  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "freqOutAvg" DOUBLE PRECISION;

-- CreateTable DeviceDiscovered (boards found by LAN scanner, may not have connected via MQTT)
CREATE TABLE IF NOT EXISTS "DeviceDiscovered" (
    "id"             TEXT        NOT NULL,
    "ip"             TEXT        NOT NULL,
    "mac"            TEXT,
    "hostname"       TEXT,
    "boardConfirmed" BOOLEAN     NOT NULL DEFAULT false,
    "deviceId"       TEXT,
    "firmware"       TEXT,
    "firstSeenAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawInfo"        JSONB,

    CONSTRAINT "DeviceDiscovered_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeviceDiscovered_ip_key"         ON "DeviceDiscovered"("ip");
CREATE INDEX        IF NOT EXISTS "DeviceDiscovered_mac_idx"        ON "DeviceDiscovered"("mac");
CREATE INDEX        IF NOT EXISTS "DeviceDiscovered_lastSeenAt_idx" ON "DeviceDiscovered"("lastSeenAt");
