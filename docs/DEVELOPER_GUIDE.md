# Automatrix VOLTAGETEST / UMS Developer Guide

**Release:** v1.0.0  
**Product:** Automatrix Engineering VOLTAGETEST / UMS - Industrial UPS Monitoring System

## Branch Strategy

Long-term branches:

- `dev`: ongoing development and Codex work
- `main`: stable tested release-candidate work
- `production`: released customer versions only

Release flow: `dev -> main -> production -> tag`.

## Repository Structure

- `web-dashboard/`: Next.js dashboard, API routes, Prisma schema, tests, packaging scripts
- `release/windows-service/`: Windows service package scripts
- `release/linux-native/`: Linux native/systemd package scripts
- `docs/`: customer, commissioning, security, and developer documentation
- `firmware/`: ESP32 firmware source
- `scripts/`: release certification helpers

## Architecture

The dashboard provides local UPS monitoring, inventory management, telemetry ingestion, alarms, backup/restore, and offline signed licensing. Prisma manages PostgreSQL schema and migrations. Licensing uses Automatrix-held Ed25519 private signing keys outside the repository and a public key configured in production.

## Environment Variables

Important production variables:

- `DATABASE_URL`
- `UPS_AUTH_USERNAME`
- `UPS_AUTH_PASSWORD_HASH`
- `UPS_AUTH_TOKEN`
- `UMS_LICENSE_PUBLIC_KEY_PEM`
- `UMS_LICENSE_DIR`
- `PORT`
- `ENABLE_EMBEDDED_BROKER`
- `ENABLE_INPROCESS_WORKER`
- `ENABLE_MANUAL_TELEMETRY_POST`

Never commit private keys, `.env` secrets, customer data, local tool settings, `.claude`, or `settings.local.json`.

## Local Development

```bash
cd web-dashboard
npm ci
npm run db:generate
npm run lint
npm run typecheck
npm run license:test
npm run build
```

## Packaging

```bash
cd web-dashboard
npm run package:build
```

Expected artifacts:

- `VOLTAGETEST-v1.0.0-windows-offline-installer.zip`
- `VOLTAGETEST-v1.0.0-linux-native-offline.tar.gz`
- `VOLTAGETEST-v1.0.0-source-clean.zip`

Inspect artifacts with:

```bash
node web-dashboard/scripts/clean-package-inspect.js VOLTAGETEST-v1.0.0-source-clean.zip
```

## CI Certification

`.github/workflows/release-certification.yml` builds packages, inspects artifacts, runs license tests, runs Windows package certification, runs Linux native certification, simulates rollback, and runs browser-based manual UI proof.

## Adding Future UPS Or Energy Analyzer Features

- Keep telemetry parsing backward-compatible.
- Add Prisma migrations for schema changes.
- Add API and license gate tests for premium or seat-consuming behavior.
- Keep live monitoring and alarm safety paths resilient during license expiry.
- Update commissioning and calibration guides for any field wiring/register changes.

## Troubleshooting

- Prisma generation fails: verify network access to Prisma engines or use the pinned package cache used by CI.
- Build fails after `npm prune`: generate and build before pruning dev dependencies.
- License startup fails: validate `UMS_LICENSE_PUBLIC_KEY_PEM` with Node `crypto.createPublicKey()`.
- CI package certification fails: inspect proof artifacts and job logs before changing runtime logic.
