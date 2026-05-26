# Deployment

Initial deployment skeleton for a building server or VPS.

## Components

- `web`: Next.js dashboard.
- `mosquitto`: private MQTT broker.

## Files

- `docker-compose.yml`
- `mosquitto/mosquitto.conf`
- `mosquitto/acl.example`
- `mosquitto/passwords.example`

## First Production Notes

- Replace all example credentials.
- Generate Mosquitto password file with `mosquitto_passwd`.
- Put dashboard auth values in environment variables.
- Add HTTPS reverse proxy before exposing to users.
- Keep MQTT reachable only by ESP32 devices and backend/dashboard services.

