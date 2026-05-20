# UPS Monitoring Dashboard

Next.js dashboard for live UPS monitoring.

## Environment

Create `.env.local` from `.env.example` and set:

```text
UPS_AUTH_USERNAME=admin
UPS_AUTH_PASSWORD=change-this-password
UPS_AUTH_TOKEN=replace-with-a-long-random-session-token
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=dashboard
MQTT_PASSWORD=change-this-mqtt-password
MQTT_TOPIC=building/+/ups/+/telemetry
```

If these are not set, development defaults are used.

## Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## Build Checks

```bash
npm run lint
npm run build
```

## Current Features

- Fixed-credential login.
- Live MQTT telemetry.
- Server-side MQTT ingestion when `MQTT_BROKER_URL` is configured.
- Fleet summary and table.
- Local UPS inventory management.
- Alarm thresholds stored in browser localStorage.
