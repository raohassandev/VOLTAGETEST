# VOLTAGETEST / UMS v2.1.0 Release Notes

**Branch:** `energy-analyzer-integration`
**Release type:** Offline-capable commercial release candidate
**Status:** Software certification required before shipment; live board proof/calibration remains a field condition.

## Highlights

- Offline Ed25519 signed licensing with machine-bound activation.
- One active assigned UPS consumes one license seat.
- Backend enforcement for UPS inventory expansion and premium feature access.
- Manufacturer-only license administration page at `/admin/license`.
- Docker deployment includes web, PostgreSQL, Mosquitto, and MQTT worker services.
- Energy analyzer telemetry fields are supported through MQTT ingestion, database persistence, dashboard views, and alarms.
- Clean source package target: `VOLTAGETEST-v2.1.0-source-clean.zip`.

## Licensing

- Automatrix private signing keys must stay outside this repository.
- The UMS runtime stores only the public Ed25519 key in `UMS_LICENSE_PUBLIC_KEY_PEM`.
- A valid license is required before adding an active UPS.
- License expiry blocks expansion and premium features, but must not stop already-running safety monitoring, alarms, or telemetry ingestion.

## Certification

The release certification command is:

```bash
cd deployment
CERT_ADMIN_PASSWORD=<actual-admin-password> UMS_LICENSE_PUBLIC_KEY_PEM="$(cat public-key.pem)" bash certify.sh
```

Final proof files are expected at:

- `docs/audit/logs/2026-05-25/certify.txt`
- `docs/audit/logs/2026-05-25/docker-compose-ps.txt`

`certify.txt` must end with:

```text
ALL CERTIFICATION STEPS PASSED
```

## Known Remaining Condition

Do not claim full release PASS until live board proof and calibration are complete using `docs/CALIBRATION_GUIDE.md` and `release/UMS_FIELD_TEST_REPORT_TEMPLATE.md`.
