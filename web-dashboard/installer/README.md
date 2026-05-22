# UMS Windows Installer

## Prerequisites

- [Inno Setup 6](https://jrsoftware.org/isdl.php) installed
- Node.js 24 LTS (`node-v24.15.0-x64.msi`) placed in `installer/tools/`
- [NSSM 2.24](https://nssm.cc/download) (`nssm.exe` 64-bit) placed in `installer/tools/`
- PostgreSQL 16 already installed on the target machine (or run `setup-db.ps1` first)

## Build the installer

```powershell
# 1. Build the Next.js standalone bundle
npm run package:build

# 2. Compile the installer
iscc installer\setup.iss
```

Output: `installer\dist\UMS-Setup-1.0.0.exe`

## Installer wizard pages

| Page | Fields |
|------|--------|
| PostgreSQL connection | Host, Port, Database name, DB Username, DB Password |
| Admin password | Password + confirm (min 8 chars) |
| Ports | MQTT port (default 1883), Dashboard port (default 3303) |

## What the installer does

1. Copies app bundle to `C:\Program Files\UMS\app\`
2. Writes `.env` with DB connection string, auth token, and bcrypt-hashed admin password
3. Runs `prisma migrate deploy` (falls back to `prisma db push` if needed)
4. Seeds the database with demo data
5. Installs UMS as a Windows auto-start service via NSSM
6. Opens firewall rules for MQTT (1883) and HTTP (3303)
7. Starts the service

## Service management

```powershell
# Status
Get-Service UMSDashboard

# Restart
Restart-Service UMSDashboard

# Logs
Get-Content "C:\Program Files\UMS\logs\ums-stdout.log" -Tail 50
```

## Uninstall

Use Windows "Add or Remove Programs" — the uninstaller stops the service and removes
firewall rules automatically. To also drop the database, run:

```powershell
& "C:\Program Files\UMS\scripts\uninstall.ps1" -DropDatabase
```

## First-time DB setup (if PostgreSQL is fresh)

Run as Administrator before the installer:

```powershell
.\installer\scripts\setup-db.ps1 -PgSuperPass "your_postgres_password"
```

This creates the `ums_user` role and `ums_local` database.

## Firewall / mDNS note

Board auto-discovery uses mDNS (UDP port 5353 multicast). On Windows 11 with
default firewall settings this should work. If boards cannot find the server,
add an inbound rule for UDP 5353.
