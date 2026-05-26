# VOLTAGETEST / UMS v2.1.0

Professional offline-capable UPS monitoring system with signed licensing, dashboard inventory, telemetry persistence, alarms, backup/restore, and field calibration workflow.

## Official Release Packages

- Windows Installer Package: `VOLTAGETEST-v2.1.0-windows-installer.zip`
- Linux Native Package: `VOLTAGETEST-v2.1.0-linux-native.tar.gz`
- Optional clean source package: `VOLTAGETEST-v2.1.0-source-clean.zip`

Docker is an optional development/deployment path and is not certified as an official package for this release.

## Core Runtime

- Dashboard/API: `web-dashboard/`
- Firmware: `firmware/VOLTAGETEST/`
- Linux native package scripts: `release/linux-native/`
- Windows installer scripts: `web-dashboard/installer/`
- License docs: `docs/LICENSING.md`

## Required Production Secrets

Production startup requires:

- `DATABASE_URL`
- `UPS_AUTH_TOKEN`
- `UPS_AUTH_PASSWORD_HASH`
- `UMS_LICENSE_PUBLIC_KEY_PEM`

Plaintext admin passwords are not accepted in production.

## Verification

Release readiness is based on the Windows installer/service package and Linux native/systemd package. Live board proof/calibration is a separate hardware condition and must be documented with `release/UMS_FIELD_TEST_REPORT_TEMPLATE.md`.
