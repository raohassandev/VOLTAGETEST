# Automatrix VOLTAGETEST / UMS Windows Offline Installer Package

This package installs Automatrix Engineering VOLTAGETEST / UMS v1.0.0 as the Windows service `Automatrix VOLTAGETEST UMS Service` without Docker.

This package is offline-capable when Node.js, PostgreSQL, and NSSM are supplied in the approved customer dependency pack or already installed on the target machine. If those dependencies are not bundled, treat the package as an online/lightweight installer and install dependencies first.

## Install

Run PowerShell as Administrator from the extracted release package:

```powershell
.\release\windows-service\install.ps1 `
  -DatabaseUrl "postgresql://ums_user:ums_password@localhost:5432/ums_local" `
  -AdminPassword "<new-admin-password>" `
  -LicensePublicKeyPath ".\release\public-license-key.pem"
```

The installer writes only `UPS_AUTH_PASSWORD_HASH`; it never writes the plaintext admin password.

Default paths:

- App: `C:\Program Files\VOLTAGETEST`
- Data: `C:\ProgramData\VOLTAGETEST`
- Logs: `C:\ProgramData\VOLTAGETEST\logs`
- Env: `C:\ProgramData\VOLTAGETEST\voltagetest.env`
- Service name: `VOLTAGETESTDashboard`
- Service display name: `Automatrix VOLTAGETEST UMS Service`
- Rollback log: `C:\ProgramData\VOLTAGETEST\logs\rollback.log`

## Operations

```powershell
.\release\windows-service\health-check.ps1
.\release\windows-service\backup.ps1
.\release\windows-service\restore.ps1 -BackupFile C:\ProgramData\VOLTAGETEST\backups\backup.sql
.\release\windows-service\rollback.ps1 -BackupDir C:\ProgramData\VOLTAGETEST\rollback\<timestamp>
.\release\windows-service\uninstall.ps1
```

`uninstall.ps1` preserves customer data by default. Use `-PurgeData` only when the customer explicitly wants local data removed.
