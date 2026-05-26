# Third-Party Notices

VOLTAGETEST / UMS v1.0.0 uses open-source dependencies from the Node.js, Next.js, Prisma, React, PostgreSQL client, and tooling ecosystems.

The definitive dependency list is in:

- `web-dashboard/package.json`
- `web-dashboard/package-lock.json`

Customer packages do not include private Automatrix signing keys, customer secrets, database dumps, or local development credentials.

Before redistribution, review dependency licenses with:

```bash
cd web-dashboard
npm audit --omit=dev
npm ls --omit=dev
```

Node.js, PostgreSQL, and NSSM may be supplied by the target system, bundled by the deployment team, or installed through an approved offline dependency pack according to the project delivery contract.
