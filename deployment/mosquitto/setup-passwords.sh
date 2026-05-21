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

# Add device users — one per ESP32 module.
# The username MUST match the device_id configured in the board's MQTT settings.
# Uncomment and repeat for each device, or add them manually later with:
#   docker run --rm -i -v "${SCRIPT_DIR}:/mosquitto/config" eclipse-mosquitto:2 \
#     mosquitto_passwd /mosquitto/config/passwords <device_id>
#
# echo ""
# echo "Adding device user: DEV-COM11-TEST"
# docker run --rm -i \
#   -v "${SCRIPT_DIR}:/mosquitto/config" \
#   eclipse-mosquitto:2 \
#   mosquitto_passwd /mosquitto/config/passwords DEV-COM11-TEST

echo ""
echo "Done. File created: ${PASSWORDS_FILE}"
echo "Keep this file secret — never commit it to version control."
