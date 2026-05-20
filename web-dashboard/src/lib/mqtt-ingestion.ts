import mqtt, { type MqttClient } from "mqtt";

import { readJsonFile, writeJsonFile } from "@/lib/server-store";
import { normalizeTelemetry, telemetryDeviceId, type RawTelemetry, type TelemetryStore } from "@/lib/telemetry-types";

const telemetryFile = "telemetry.json";
const maxHistoryPerDevice = 500;

let client: MqttClient | null = null;
let started = false;
let store: TelemetryStore = { history: {}, latest: {} };
let storeLoaded = false;
let saveTimer: NodeJS.Timeout | null = null;

export async function ensureMqttIngestionStarted() {
  if (started) return;
  started = true;
  await loadStore();

  const brokerUrl = process.env.MQTT_BROKER_URL;
  const topic = process.env.MQTT_TOPIC || "building/+/ups/+/telemetry";

  if (!brokerUrl) {
    return;
  }

  client = mqtt.connect(brokerUrl, {
    clean: true,
    clientId: `ups-dashboard-ingestor-${Math.random().toString(16).slice(2)}`,
    password: process.env.MQTT_PASSWORD,
    reconnectPeriod: 3000,
    username: process.env.MQTT_USERNAME,
  });

  client.on("connect", () => {
    client?.subscribe(topic, { qos: 0 });
  });

  client.on("message", (receivedTopic, payload) => {
    try {
      const parsed = JSON.parse(payload.toString()) as Partial<RawTelemetry>;
      recordTelemetry(normalizeTelemetry(parsed, receivedTopic));
    } catch {
      // Invalid telemetry is ignored for now; production should log/audit this.
    }
  });
}

export async function getTelemetryStore() {
  await ensureMqttIngestionStarted();
  return store;
}

export async function recordTelemetry(telemetry: RawTelemetry) {
  await loadStore();
  const received = {
    ...telemetry,
    received_at: telemetry.received_at || new Date().toISOString(),
  };
  const id = telemetryDeviceId(received);
  store.latest[id] = received;
  store.history[id] = [...(store.history[id] || []), received].slice(-maxHistoryPerDevice);
  scheduleSave();
}

async function loadStore() {
  if (storeLoaded) return;
  store = await readJsonFile<TelemetryStore>(telemetryFile, { history: {}, latest: {} });
  storeLoaded = true;
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    writeJsonFile(telemetryFile, store).catch(() => undefined);
  }, 250);
}

