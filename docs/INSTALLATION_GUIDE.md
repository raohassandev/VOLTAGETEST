# Automatrix VOLTAGETEST / UMS Installation Guide

**Release:** v1.0.0  
**Product:** Automatrix Engineering VOLTAGETEST / UMS - Industrial UPS Monitoring System  
**Release status:** PASS WITH CONDITIONS - live board proof/calibration pending.

## Package Contents

Official v1.0.0 packages:

- `VOLTAGETEST-v1.0.0-windows-offline-installer.zip`
- `VOLTAGETEST-v1.0.0-linux-native-offline.tar.gz`
- `VOLTAGETEST-v1.0.0-source-clean.zip`

The Windows and Linux packages include the application source/runtime build inputs, install/uninstall/rollback scripts, backup/restore scripts, environment templates, licensing documentation, and commissioning guides. They do not include private signing keys, customer secrets, `.env` files, database dumps, local tool settings, or customer data.

## Supported Systems

Windows package:

- Windows Server 2022/2025 or Windows 10/11 Pro/Enterprise
- Node.js 22 LTS or newer available on the host, unless a bundled runtime is added by the deployment team
- PostgreSQL 16 available on the host or installed by the commissioning engineer
- NSSM service wrapper available on the host or supplied in the package `tools/` folder

Linux package:

- Ubuntu 22.04/24.04 LTS or compatible systemd Linux
- Node.js 22 LTS or newer
- PostgreSQL 16 client/server access
- `rsync`, `curl`, and `systemd`

Offline mode is the preferred customer delivery model. If Node.js, PostgreSQL, or NSSM are not bundled in `runtime/`, `database/`, or `tools/`, the package must be treated as an online/lightweight package and those dependencies must be installed before running the installer.

## Configuration Required Before Install

Prepare the following:

- Application port, default `3303`
- PostgreSQL `DATABASE_URL`
- Initial admin username and password
- Automatrix-provided `UMS_LICENSE_PUBLIC_KEY_PEM`
- Data directory path
- Backup directory path
- Firewall allowance for the selected application port

Never write the admin password to `.env`. The installer stores only `UPS_AUTH_PASSWORD_HASH`.

## Windows Installation

1. Extract `VOLTAGETEST-v1.0.0-windows-offline-installer.zip`.
2. Open PowerShell as Administrator.
3. Confirm `node`, `npm`, `psql`, and `nssm` are available.
4. Run `release/windows-service/install.ps1` with the required database URL, admin password, port, and license public key.
5. The installer validates the license public key, creates the environment file, applies Prisma migrations, installs `Automatrix VOLTAGETEST UMS Service`, starts the service, and checks `/api/health`.
6. Open `http://localhost:3303/login`.
7. Log in with the configured admin account.
8. Open `/admin/license` and install the offline signed license.

## Linux Installation

1. Extract `VOLTAGETEST-v1.0.0-linux-native-offline.tar.gz`.
2. Create `/etc/voltagetest/voltagetest.env` from `release/linux-native/voltagetest.env.example`.
3. Set `DATABASE_URL`, `UPS_AUTH_PASSWORD_HASH`, `UPS_AUTH_TOKEN`, `UMS_LICENSE_PUBLIC_KEY_PEM`, and `PORT`.
4. Run `sudo release/linux-native/install.sh`.
5. The installer validates Node/PostgreSQL requirements, validates the Ed25519 license public key, applies migrations, installs `voltagetest.service`, starts the service, and checks `/api/health`.
6. Open `http://localhost:3303/login`.
7. Install the offline signed license at `/admin/license`.

## First Login And License Activation

1. Browse to `/login`.
2. Sign in as the configured admin user.
3. Go to `License`.
4. Confirm the machine code.
5. Install the Automatrix-issued signed license file.
6. Add active UPS assets only after a valid license is installed.

No valid license blocks new UPS additions. Existing monitoring and alarm safety paths remain available for already configured live systems.

## Backup And Restore

Windows:

- Backup: `release/windows-service/backup.ps1`
- Restore: `release/windows-service/restore.ps1`

Linux:

- Backup: `release/linux-native/backup.sh`
- Restore: `release/linux-native/restore.sh`

Always take a backup before upgrade, rollback, or commissioning changes.

## Service Operations

Windows:

- Service display name: `Automatrix VOLTAGETEST UMS Service`
- Logs: `%ProgramData%\VOLTAGETEST\logs`

Linux:

- Service name: `voltagetest.service`
- Description: `Automatrix VOLTAGETEST UMS`
- Logs: `/var/log/voltagetest`
- Data: `/var/lib/voltagetest`
- Config: `/etc/voltagetest/voltagetest.env`

## Upgrade And Rollback

The installers detect existing installations, stop the service, back up the current application/configuration, apply the update, run migrations, restart, and verify health. If a critical install step fails, rollback restores the previous application/configuration and preserves customer data.

See `docs/ROLLBACK_RECOVERY_GUIDE.md` before field upgrades.

## Uninstall

Uninstall preserves customer data by default. Data deletion must be explicitly requested with the purge option.

## Troubleshooting

- Health check fails: verify `PORT`, `DATABASE_URL`, PostgreSQL connectivity, and service logs.
- Login fails: verify `UPS_AUTH_USERNAME`, `UPS_AUTH_PASSWORD_HASH`, and `UPS_AUTH_TOKEN`.
- License validation fails: verify the public key is Ed25519 and not placeholder text.
- UPS add fails: verify license status and seat count.
- Telemetry missing: verify MQTT/board network settings and database persistence.
