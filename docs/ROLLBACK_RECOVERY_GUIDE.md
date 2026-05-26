# Automatrix VOLTAGETEST / UMS Rollback And Recovery Guide

**Release:** v1.0.0  
**Product:** Automatrix Engineering VOLTAGETEST / UMS - Industrial UPS Monitoring System

## When Rollback Is Required

Rollback is required when an install or upgrade cannot complete safely, the health endpoint does not recover, migrations fail, required configuration is invalid, or service startup fails after replacement.

## Automatic Rollback Behavior

Windows and Linux installers:

- Detect an existing installation.
- Stop the service before replacement.
- Back up application files and configuration.
- Preserve customer data directories.
- Apply migrations only after configuration validation.
- Verify `/api/health`.
- Restore the previous application/configuration if a critical step fails.
- Write rollback logs to the platform log directory.

## Manual Windows Rollback

1. Stop `Automatrix VOLTAGETEST UMS Service`.
2. Locate the latest backup under `%ProgramData%\VOLTAGETEST\rollback`.
3. Run `release/windows-service/rollback.ps1` with the backup directory.
4. Confirm the service starts and `/api/health` returns healthy.
5. Review `%ProgramData%\VOLTAGETEST\logs`.

## Manual Linux Rollback

1. Run `sudo systemctl stop voltagetest.service`.
2. Locate the latest backup under `/var/lib/voltagetest/rollback`.
3. Run `sudo release/linux-native/rollback.sh <backup-dir>`.
4. Run `sudo systemctl restart voltagetest.service`.
5. Confirm `/api/health` returns healthy.
6. Review `/var/log/voltagetest`.

## Database Restore

Restore only from a known-good backup. Confirm the target database and customer with the site owner before running restore. Never delete database data directories manually.

## Configuration Restore

Restore `voltagetest.env` only from the matching site backup. Confirm the file contains no plaintext password and includes `UPS_AUTH_PASSWORD_HASH` and `UMS_LICENSE_PUBLIC_KEY_PEM`.

## Logs To Collect

- Installer output
- Rollback log
- Service stdout/stderr logs
- PostgreSQL migration output
- Health check result
- License status response with secrets removed

## What Not To Delete

- `/var/lib/voltagetest`
- `/etc/voltagetest/voltagetest.env`
- `%ProgramData%\VOLTAGETEST`
- Customer backup files
- License files
- PostgreSQL data directories

## Support Handover Checklist

- Site name and contact
- Installed version and package name
- Database backup timestamp
- Rollback backup path
- Error message and step that failed
- Service status
- Health endpoint response
- License status
- Live board/calibration status
