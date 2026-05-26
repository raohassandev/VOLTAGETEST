#!/usr/bin/env bash
# Generate the Mosquitto passwords file for production deployment.
# Run this before starting the Docker stack for the first time.
#
# Usage:
#   bash deployment/mosquitto/setup-passwords.sh
#
# You will be prompted for passwords interactively.
# The generated 'passwords' file is placed in deployment/mosquitto/.
#
# Never commit the passwords file to version control.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASSWORDS_FILE="${SCRIPT_DIR}/passwords"

echo "=== UMS Mosquitto Password Setup ==="
echo "This will create: ${PASSWORDS_FILE}"
echo ""

# Create the passwords file with the dashboard user (broker subscriber).
echo "Creating user: dashboard (MQTT worker / dashboard subscriber)"
docker run --rm -i \
  -v "${SCRIPT_DIR}:/mosquitto/config" \
  eclipse-mosquitto:2 \
  mosquitto_passwd -c /mosquitto/config/passwords dashboard

# Add the CI/certification smoke-test device user.
# certify.sh publishes as DOCKER-SMOKE-001 — this user must exist in passwords.
# It uses the same password as the dashboard user (set via MQTT_PASSWORD in .env).
echo ""
echo "Creating user: DOCKER-SMOKE-001 (certification smoke-test device)"
echo "Enter the same password you will use for MQTT_PASSWORD in .env"
docker run --rm -i \
  -v "${SCRIPT_DIR}:/mosquitto/config" \
  eclipse-mosquitto:2 \
  mosquitto_passwd /mosquitto/config/passwords DOCKER-SMOKE-001

# Add device users — one per ESP32 module deployed in the field.
# The username MUST match the device_id configured in the board's MQTT settings.
# Repeat for each device, or add them manually later with:
#   docker run --rm -i -v "${SCRIPT_DIR}:/mosquitto/config" eclipse-mosquitto:2 \
#     mosquitto_passwd /mosquitto/config/passwords <device_id>
#
# Example:
# echo ""
# echo "Adding device user: UMS-3076F5A5AD54"
# docker run --rm -i \
#   -v "${SCRIPT_DIR}:/mosquitto/config" \
#   eclipse-mosquitto:2 \
#   mosquitto_passwd /mosquitto/config/passwords UMS-3076F5A5AD54

echo ""
echo "Done. File created: ${PASSWORDS_FILE}"
echo "Keep this file secret — never commit it to version control."
