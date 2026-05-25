# UMS License Activation Guide

This UMS release requires an offline signed license before adding active UPS units.

## Activate

1. Sign in with a manufacturer account.
2. Open `Admin > License`.
3. Copy the machine code.
4. Provide the machine code and requested active UPS count to Automatrix.
5. Paste the activation JSON from Automatrix into the page.
6. Click `Activate`.

## Seat Rule

One active UPS equals one license seat. Boards discovered from MQTT do not consume seats until assigned to an active UPS.

## Expiry Behavior

If a license expires, existing live monitoring and alarms continue. Adding UPS units, history/report access, OTA, and board configuration are blocked until a valid license is installed.

## Required Production Environment

```env
UMS_LICENSE_ENFORCEMENT=enabled
UMS_LICENSE_PATH=/app/data/license/ums-license.json
UMS_LICENSE_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```
