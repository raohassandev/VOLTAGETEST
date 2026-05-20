# UPS Monitoring Dashboard

Next.js dashboard for live UPS monitoring.

## Environment

Create `.env.local` from `.env.example` and set:

```text
UPS_AUTH_USERNAME=admin
UPS_AUTH_PASSWORD=change-this-password
UPS_AUTH_TOKEN=replace-with-a-long-random-session-token
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
- Fleet summary and table.
- Local UPS inventory management.
- Alarm thresholds stored in browser localStorage.

