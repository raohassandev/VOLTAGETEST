# Automatrix UMS License Generator

Internal offline generator for commercial UMS license files.

The Ed25519 signing key is created outside the repository at:

`%USERPROFILE%\.automatrix\ums-license\signing.pem` on Windows, or `~/.automatrix/ums-license/signing.pem` on Linux/macOS.

Generate the signing key and copy only the public key into production UMS configuration:

```bash
node index.mjs generate-keypair
node index.mjs show-public-key
```

Create a customer activation file:

```bash
node index.mjs generate-license --machine AMX-UMS-XXXX-XXXX-XXXX --customer "Customer" --max-ups 5 --valid-until 2027-05-25 --out license.json
```
