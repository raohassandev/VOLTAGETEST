#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const keyDir = path.join(os.homedir(), ".automatrix", "ums-license");
const signingKeyPath = process.env.AUTOMATRIX_UMS_SIGNING_KEY || path.join(keyDir, "signing.pem");

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function usage() {
  console.log(`Usage:
  node index.mjs generate-keypair
  node index.mjs show-public-key
  node index.mjs generate-license --machine AMX-UMS-XXXX-XXXX-XXXX --customer "Customer" --max-ups 5 --valid-until 2027-05-25 --out license.json`);
}

function readArg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function ensureKeyPair() {
  if (fs.existsSync(signingKeyPath)) return fs.readFileSync(signingKeyPath, "utf8");
  fs.mkdirSync(path.dirname(signingKeyPath), { recursive: true });
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  fs.writeFileSync(signingKeyPath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  fs.writeFileSync(path.join(path.dirname(signingKeyPath), "public.pem"), publicKey.export({ type: "spki", format: "pem" }));
  return fs.readFileSync(signingKeyPath, "utf8");
}

const command = process.argv[2];
if (!command) {
  usage();
  process.exit(1);
}

if (command === "generate-keypair") {
  ensureKeyPair();
  console.log(`Signing key stored outside repo: ${signingKeyPath}`);
  process.exit(0);
}

const privatePem = ensureKeyPair();
const publicPem = crypto.createPublicKey(privatePem).export({ type: "spki", format: "pem" });

if (command === "show-public-key") {
  console.log(publicPem);
  process.exit(0);
}

if (command === "generate-license") {
  const validUntil = readArg("valid-until", "");
  const payload = {
    schema: "ums-license-v1",
    licenseId: readArg("license-id", `UMS-${Date.now()}`),
    customerName: readArg("customer"),
    resellerName: readArg("reseller", ""),
    siteName: readArg("site", ""),
    plan: readArg("plan", "commercial"),
    maxUps: Number(readArg("max-ups", "1")),
    features: {
      history: readArg("history", "true") !== "false",
      reports: readArg("reports", "true") !== "false",
      ota: readArg("ota", "true") !== "false",
      board_config: readArg("board-config", "true") !== "false",
    },
    validFrom: readArg("valid-from", new Date().toISOString()),
    validUntil: validUntil ? new Date(validUntil).toISOString() : null,
    graceDays: Number(readArg("grace-days", "30")),
    machineCode: readArg("machine"),
    fingerprintVersion: "v1",
    issuedAt: new Date().toISOString(),
  };
  if (!payload.customerName || !payload.machineCode || !payload.maxUps) {
    usage();
    process.exit(1);
  }
  const payloadB64 = base64Url(JSON.stringify(payload));
  const signature = crypto.sign(null, Buffer.from(payloadB64, "utf8"), crypto.createPrivateKey(privatePem));
  const envelope = { algorithm: "Ed25519", payload: payloadB64, signature: signature.toString("base64url") };
  const out = readArg("out", "");
  if (out) fs.writeFileSync(out, JSON.stringify(envelope, null, 2));
  else console.log(JSON.stringify(envelope, null, 2));
  process.exit(0);
}

usage();
process.exit(1);
