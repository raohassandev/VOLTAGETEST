# VOLTAGETEST / UMS v2.1.0 Linux Native Package

This package installs UMS without Docker.

Default paths:

- App: `/opt/voltagetest`
- Environment: `/etc/voltagetest/voltagetest.env`
- Data: `/var/lib/voltagetest`
- Logs: `/var/log/voltagetest`
- Service: `voltagetest.service`

## Install

```bash
sudo ./install.sh
sudo systemctl status voltagetest.service
curl -sf http://localhost:3303/api/health
```

Before installation, prepare PostgreSQL and provide a real Automatrix Ed25519 public key in `UMS_LICENSE_PUBLIC_KEY_PEM`.

## Required Environment

Copy `voltagetest.env.example` to `/etc/voltagetest/voltagetest.env` or pass values interactively to the installer. Production startup requires:

- `DATABASE_URL`
- `UPS_AUTH_TOKEN`
- `UPS_AUTH_PASSWORD_HASH`
- `UMS_LICENSE_PUBLIC_KEY_PEM`
- `NODE_ENV=production`

## Operations

```bash
sudo /opt/voltagetest/scripts/health-check.sh
sudo /opt/voltagetest/scripts/backup.sh
sudo /opt/voltagetest/scripts/restore.sh /var/lib/voltagetest/backups/<file>.sql.gz
```

## Uninstall

```bash
sudo ./uninstall.sh
```

Data is preserved by default. To remove data and logs:

```bash
sudo ./uninstall.sh --purge-data
```
