-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpsUnit" (
    "id" TEXT NOT NULL,
    "upsId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "serial" TEXT NOT NULL DEFAULT '',
    "siteId" TEXT,
    "floor" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "capacityVa" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "batteryNominalV" DOUBLE PRECISION NOT NULL DEFAULT 48,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UpsUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "upsUnitId" TEXT,
    "siteId" TEXT,
    "mac" TEXT,
    "ip" TEXT,
    "firmware" TEXT,
    "mqttUsername" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "online" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibrationProfile" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "vInScale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "vInOffset" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vOutScale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "vOutOffset" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vDcScale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "vDcOffset" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "iInScale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "iInOffset" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "iOutScale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "iOutOffset" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalibrationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlarmRule" (
    "id" TEXT NOT NULL,
    "siteId" TEXT,
    "upsUnitId" TEXT,
    "deviceId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "lowWarning" DOUBLE PRECISION,
    "lowCritical" DOUBLE PRECISION,
    "highWarning" DOUBLE PRECISION,
    "highCritical" DOUBLE PRECISION,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "debounceSeconds" INTEGER NOT NULL DEFAULT 30,
    "hysteresisPercent" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlarmRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemetryRaw" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "upsId" TEXT,
    "siteId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tsDevice" TIMESTAMP(3),
    "seq" INTEGER,
    "voltIn" DOUBLE PRECISION NOT NULL,
    "voltOut" DOUBLE PRECISION NOT NULL,
    "voltDc" DOUBLE PRECISION NOT NULL,
    "ctIn" DOUBLE PRECISION NOT NULL,
    "ctOut" DOUBLE PRECISION NOT NULL,
    "sInVa" DOUBLE PRECISION NOT NULL,
    "sOutVa" DOUBLE PRECISION NOT NULL,
    "pInW" DOUBLE PRECISION,
    "pOutW" DOUBLE PRECISION,
    "pfIn" DOUBLE PRECISION,
    "pfOut" DOUBLE PRECISION,
    "eInKwh" DOUBLE PRECISION,
    "eOutKwh" DOUBLE PRECISION,
    "rssi" INTEGER,
    "ip" TEXT,
    "firmware" TEXT,
    "rawJson" JSONB NOT NULL,

    CONSTRAINT "TelemetryRaw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemetryLatest" (
    "deviceId" TEXT NOT NULL,
    "upsId" TEXT,
    "siteId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "seq" INTEGER,
    "voltIn" DOUBLE PRECISION NOT NULL,
    "voltOut" DOUBLE PRECISION NOT NULL,
    "voltDc" DOUBLE PRECISION NOT NULL,
    "ctIn" DOUBLE PRECISION NOT NULL,
    "ctOut" DOUBLE PRECISION NOT NULL,
    "sInVa" DOUBLE PRECISION NOT NULL,
    "sOutVa" DOUBLE PRECISION NOT NULL,
    "pInW" DOUBLE PRECISION,
    "pOutW" DOUBLE PRECISION,
    "pfIn" DOUBLE PRECISION,
    "pfOut" DOUBLE PRECISION,
    "eInKwh" DOUBLE PRECISION,
    "eOutKwh" DOUBLE PRECISION,
    "rssi" INTEGER,
    "ip" TEXT,
    "firmware" TEXT,
    "rawJson" JSONB NOT NULL,

    CONSTRAINT "TelemetryLatest_pkey" PRIMARY KEY ("deviceId")
);

-- CreateTable
CREATE TABLE "Alarm" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "upsId" TEXT,
    "siteId" TEXT,
    "ruleId" TEXT,
    "upsUnitId" TEXT,
    "metric" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'active',
    "message" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "comment" TEXT,

    CONSTRAINT "Alarm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlarmEvent" (
    "id" TEXT NOT NULL,
    "alarmId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "AlarmEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "rawRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "rollupRetentionMonths" INTEGER NOT NULL DEFAULT 12,
    "alarmRetentionMonths" INTEGER NOT NULL DEFAULT 24,
    "offlineThresholdSecs" INTEGER NOT NULL DEFAULT 60,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Telemetry1m" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "voltInAvg" DOUBLE PRECISION NOT NULL,
    "voltInMin" DOUBLE PRECISION NOT NULL,
    "voltInMax" DOUBLE PRECISION NOT NULL,
    "voltOutAvg" DOUBLE PRECISION NOT NULL,
    "voltOutMin" DOUBLE PRECISION NOT NULL,
    "voltOutMax" DOUBLE PRECISION NOT NULL,
    "voltDcAvg" DOUBLE PRECISION NOT NULL,
    "voltDcMin" DOUBLE PRECISION NOT NULL,
    "voltDcMax" DOUBLE PRECISION NOT NULL,
    "ctInAvg" DOUBLE PRECISION NOT NULL,
    "ctInMax" DOUBLE PRECISION NOT NULL,
    "ctOutAvg" DOUBLE PRECISION NOT NULL,
    "ctOutMax" DOUBLE PRECISION NOT NULL,
    "sInVaAvg" DOUBLE PRECISION NOT NULL,
    "sInVaMax" DOUBLE PRECISION NOT NULL,
    "sOutVaAvg" DOUBLE PRECISION NOT NULL,
    "sOutVaMax" DOUBLE PRECISION NOT NULL,
    "rssiAvg" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Telemetry1m_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "data" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Site_siteId_key" ON "Site"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "UpsUnit_upsId_key" ON "UpsUnit"("upsId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_deviceId_key" ON "Device"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "CalibrationProfile_deviceId_key" ON "CalibrationProfile"("deviceId");

-- CreateIndex
CREATE INDEX "TelemetryRaw_deviceId_receivedAt_idx" ON "TelemetryRaw"("deviceId", "receivedAt");

-- CreateIndex
CREATE INDEX "TelemetryRaw_receivedAt_idx" ON "TelemetryRaw"("receivedAt");

-- CreateIndex
CREATE INDEX "Alarm_deviceId_state_idx" ON "Alarm"("deviceId", "state");

-- CreateIndex
CREATE INDEX "Alarm_state_firstSeenAt_idx" ON "Alarm"("state", "firstSeenAt");

-- CreateIndex
CREATE INDEX "AlarmEvent_alarmId_idx" ON "AlarmEvent"("alarmId");

-- CreateIndex
CREATE INDEX "Telemetry1m_deviceId_bucketStart_idx" ON "Telemetry1m"("deviceId", "bucketStart");

-- CreateIndex
CREATE INDEX "Telemetry1m_bucketStart_idx" ON "Telemetry1m"("bucketStart");

-- CreateIndex
CREATE UNIQUE INDEX "Telemetry1m_deviceId_bucketStart_key" ON "Telemetry1m"("deviceId", "bucketStart");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "UpsUnit" ADD CONSTRAINT "UpsUnit_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_upsUnitId_fkey" FOREIGN KEY ("upsUnitId") REFERENCES "UpsUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlarmRule" ADD CONSTRAINT "AlarmRule_upsUnitId_fkey" FOREIGN KEY ("upsUnitId") REFERENCES "UpsUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlarmRule" ADD CONSTRAINT "AlarmRule_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("deviceId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetryRaw" ADD CONSTRAINT "TelemetryRaw_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("deviceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetryLatest" ADD CONSTRAINT "TelemetryLatest_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("deviceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alarm" ADD CONSTRAINT "Alarm_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("deviceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alarm" ADD CONSTRAINT "Alarm_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlarmRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alarm" ADD CONSTRAINT "Alarm_upsUnitId_fkey" FOREIGN KEY ("upsUnitId") REFERENCES "UpsUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Telemetry1m" ADD CONSTRAINT "Telemetry1m_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("deviceId") ON DELETE RESTRICT ON UPDATE CASCADE;
