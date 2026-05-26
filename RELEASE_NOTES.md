# VOLTAGETEST / UMS v1.0.0 Release Notes

**Branch:** `energy-analyzer-integration`
**Official package targets:** Windows Installer Package and Linux Native Package
**Docker status:** Optional deployment path, not certified in this release

## Highlights

- Offline Ed25519 signed licensing with machine-bound activation.
- One active assigned UPS consumes one license seat.
- Backend enforcement for UPS inventory expansion and premium feature access.
- Manufacturer-only license administration page at `/admin/license`.
- Windows installer now collects and persists `UMS_LICENSE_PUBLIC_KEY_PEM`.
- Linux native package includes systemd service, install/uninstall, backup, restore, health check, env template, and README.
- Clean artifact inspection rejects local agent files, secrets, private keys, dependency folders, failed proof logs, and local cache output.

## Release Artifacts

- `VOLTAGETEST-v1.0.0-windows-offline-installer.zip`
- `VOLTAGETEST-v1.0.0-linux-native-offline.tar.gz`
- `VOLTAGETEST-v1.0.0-source-clean.zip`

## Current Certification Rule

Docker certification is not a release blocker. Release is blocked only by failures in the official Windows or Linux native package paths, licensing, dashboard/runtime, UPS management, telemetry, backup/restore, security validation, clean package inspection, or live board proof when claiming hardware readiness.

## Known Remaining Condition

Live board proof/calibration must be completed before claiming hardware-ready PASS.
