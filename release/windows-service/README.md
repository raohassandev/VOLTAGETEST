# VOLTAGETEST Windows Service Package

This portable package installs VOLTAGETEST / UMS v2.1.0 as a Windows service without Docker.

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
- Service: `VOLTAGETESTDashboard`

## Operations

```powershell
.\release\windows-service\health-check.ps1
.\release\windows-service\backup.ps1
.\release\windows-service\restore.ps1 -BackupFile C:\ProgramData\VOLTAGETEST\backups\backup.sql
.\release\windows-service\uninstall.ps1
```

`uninstall.ps1` preserves customer data by default. Use `-PurgeData` only when the customer explicitly wants local data removed.
