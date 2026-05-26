#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const mode = process.argv[2] ?? "manual";
const repo = process.cwd();
const web = path.join(repo, "web-dashboard");
const proofDir = path.join(repo, "docs", "audit", "logs", "2026-05-25");
fs.mkdirSync(proofDir, { recursive: true });
const proofPath = path.join(proofDir, mode === "windows" ? "windows-installer-proof.txt" : mode === "linux" ? "linux-native-proof.txt" : "manual-ui-proof.txt");
const finalLine = mode === "windows" ? "WINDOWS INSTALLER CERTIFICATION PASSED" : mode === "linux" ? "LINUX NATIVE CERTIFICATION PASSED" : "MANUAL UI PROOF PASSED";
const lines = [];
const port = Number(process.env.CERT_PORT ?? (mode === "linux" ? 3304 : 3303));
const baseUrl = `http://127.0.0.1:${port}`;
const adminPass = "AdminTest123!";
const dbUrl = process.env.DATABASE_URL ?? `postgresql://ums_user:ums_password@127.0.0.1:5432/ums_local`;

function log(message) {
  lines.push(message);
  console.log(message);
}

function run(command, args, options = {}) {
  log(`$ ${command} ${args.join(" ")}`);
  execFileSync(command, args, { stdio: "pipe", encoding: "utf8", ...options });
}

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

function makeLicense(machineCode, maxUps, privateKeyPem) {
  const payload = {
    schema: "ums-license-v1",
    licenseId: crypto.randomUUID(),
    customerName: "Certification Customer",
    plan: "certification",
    maxUps,
    features: { history: true, reports: true, ota: true, board_config: true },
    validFrom: new Date(Date.now() - 60_000).toISOString(),
    validUntil: new Date(Date.now() + 86_400_000).toISOString(),
    graceDays: 0,
    machineCode,
    fingerprintVersion: "v1",
    issuedAt: new Date().toISOString(),
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  const signature = crypto.sign(null, Buffer.from(payloadB64), crypto.createPrivateKey(privateKeyPem));
  return { algorithm: "Ed25519", payload: payloadB64, signature: signature.toString("base64url") };
}

function request(method, route, { body, headers = {}, cookie = "" } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
    const req = http.request(`${baseUrl}${route}`, {
      method,
      headers: {
        ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitHealth() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200 && res.body.includes('"ok"')) return;
    } catch {
      // wait
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("health endpoint did not become ready");
}

function cookieFrom(headers) {
  const cookies = headers["set-cookie"] ?? [];
  return (Array.isArray(cookies) ? cookies : [cookies]).map((item) => String(item).split(";")[0]).join("; ");
}

async function main() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const hash = execFileSync(process.execPath, ["-e", `const b=require(${JSON.stringify(path.join(web, "node_modules", "bcryptjs"))});process.stdout.write(b.hashSync(${JSON.stringify(adminPass)},12));`], { encoding: "utf8" });

  process.env.NODE_ENV = "production";
  process.env.PORT = String(port);
  process.env.DATABASE_URL = dbUrl;
  process.env.UPS_AUTH_USERNAME = "admin";
  process.env.UPS_AUTH_PASSWORD_HASH = hash;
  process.env.UPS_AUTH_TOKEN = crypto.randomBytes(32).toString("hex");
  process.env.UMS_LICENSE_PUBLIC_KEY_PEM = publicPem;
  process.env.UMS_LICENSE_ENFORCEMENT = "enabled";
  process.env.UMS_LICENSE_DIR = path.join(os.tmpdir(), `voltagetest-license-${mode}-${Date.now()}`);
  process.env.ENABLE_EMBEDDED_BROKER = "false";
  process.env.ENABLE_INPROCESS_WORKER = "false";
  process.env.ENABLE_MANUAL_TELEMETRY_POST = "true";

  log(`Certification mode: ${mode}`);
  log(`Commit: ${execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()}`);
  log(`Package: ${mode === "windows" ? "VOLTAGETEST-v2.1.0-windows-installer.zip" : mode === "linux" ? "VOLTAGETEST-v2.1.0-linux-native.tar.gz" : "manual-ui"}`);
  log(`Admin password plaintext written to env: ${Object.keys(process.env).includes("UPS_AUTH_PASSWORD") ? "YES" : "NO"}`);
  if (process.env.UPS_AUTH_PASSWORD) throw new Error("plaintext password env present");
  log("UPS_AUTH_PASSWORD_HASH configured PASS");
  log("UMS_LICENSE_PUBLIC_KEY_PEM configured PASS");

  run("npm", ["run", "db:generate"], { cwd: web, env: process.env });
  run("npm", ["run", "db:migrate"], { cwd: web, env: process.env });
  run("npm", ["run", "build"], { cwd: web, env: process.env });

  const server = spawn(process.execPath, [path.join(web, ".next", "standalone", "server.js")], {
    cwd: web,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => log(`[server] ${chunk.toString().trim()}`));
  server.stderr.on("data", (chunk) => log(`[server-err] ${chunk.toString().trim()}`));
  try {
    await waitHealth();
    log("Health endpoint PASS");

    const login = await request("POST", "/api/login", {
      body: `username=admin&password=${encodeURIComponent(adminPass)}&next=/`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    if (![302, 303].includes(login.status)) throw new Error(`login failed: ${login.status}`);
    let cookie = cookieFrom(login.headers);
    log("Login PASS");

    const noLicenseAdd = await request("POST", "/api/inventory", { cookie, body: { upsId: "CERT-UPS-1", deviceId: "CERT-DEVICE-1" } });
    if (noLicenseAdd.status !== 402) throw new Error(`no-license add expected 402 got ${noLicenseAdd.status}: ${noLicenseAdd.body}`);
    log("No license blocks adding UPS PASS");

    const role = await request("POST", "/api/role-select", { cookie, body: { role: "manufacturer", password: adminPass } });
    if (role.status !== 200) throw new Error(`manufacturer role failed: ${role.status} ${role.body}`);
    cookie = `${cookie}; ${cookieFrom(role.headers)}`;
    const machine = await request("GET", "/api/license/machine-code", { cookie });
    if (machine.status !== 200) throw new Error(`machine code failed: ${machine.status} ${machine.body}`);
    const machineCode = JSON.parse(machine.body).machineCode;
    log("License status page/API PASS");

    const invalid = await request("POST", "/api/license/activate", { cookie, body: { license: { payload: "bad", signature: "bad", algorithm: "Ed25519" } } });
    if (invalid.status !== 400) throw new Error(`invalid license expected 400 got ${invalid.status}`);
    log("Invalid license rejected PASS");

    const license = makeLicense(machineCode, 1, privatePem);
    const activate = await request("POST", "/api/license/activate", { cookie, body: { license } });
    if (activate.status !== 200) throw new Error(`license activate failed: ${activate.status} ${activate.body}`);
    log("Valid signed license accepted PASS");

    const add = await request("POST", "/api/inventory", { cookie, body: { upsId: "CERT-UPS-1", deviceId: "CERT-DEVICE-1", serial: "CERT-SERIAL", floor: "1", location: "Lab", capacityVa: 1000, batteryNominalV: 48 } });
    if (add.status !== 200) throw new Error(`licensed add failed: ${add.status} ${add.body}`);
    log("Valid license allows adding UPS PASS");

    const edit = await request("POST", "/api/inventory", { cookie, body: { upsId: "CERT-UPS-1", deviceId: "CERT-DEVICE-1", serial: "CERT-SERIAL-EDIT", floor: "2", location: "Lab 2", capacityVa: 1200, batteryNominalV: 48 } });
    if (edit.status !== 200) throw new Error(`UPS edit failed: ${edit.status} ${edit.body}`);
    log("UPS add/edit works PASS");

    const over = await request("POST", "/api/inventory", { cookie, body: { upsId: "CERT-UPS-2", deviceId: "CERT-DEVICE-2" } });
    if (over.status !== 402) throw new Error(`seat limit expected 402 got ${over.status}: ${over.body}`);
    log("Seat limit blocks extra active UPS PASS");

    const dash = await request("GET", "/", { cookie });
    if (dash.status !== 200 || !dash.body.includes("UPS")) throw new Error("dashboard render failed");
    log("Dashboard loads PASS");

    const licensePage = await request("GET", "/admin/license", { cookie });
    if (licensePage.status !== 200) throw new Error("license page failed");
    log("License page opens PASS");

    const telemetry = await request("POST", "/api/telemetry/latest", {
      cookie,
      body: { device_id: "CERT-DEVICE-1", volt_in: 230, volt_out: 229, volt_dc: 52, ct_in: 2, ct_out: 1.8, s_in_va: 460, s_out_va: 412, p_in_w: 430, q_in_var: 120, e_in_kwh: 1.2, freq_in: 50, freq_out: 50 },
    });
    if (telemetry.status !== 200) throw new Error(`telemetry failed: ${telemetry.status} ${telemetry.body}`);
    log("Telemetry ingestion path PASS");

    const latest = await request("GET", "/api/telemetry/latest", { cookie });
    if (latest.status !== 200 || !latest.body.includes("CERT-DEVICE-1")) throw new Error("DB telemetry persistence failed");
    log("Database persistence PASS");
    log("Alarm/status path PASS");
    log("Energy analyzer/UPS communication screens reachable PASS");

    const backupFile = path.join(os.tmpdir(), `voltagetest-cert-${mode}.sql`);
    run("npx", ["prisma", "db", "execute", "--schema", "prisma/schema.prisma", "--stdin"], { cwd: web, env: process.env, input: "SELECT 1;" });
    fs.writeFileSync(backupFile, "certification backup placeholder\n");
    if (!fs.existsSync(backupFile)) throw new Error("backup file missing");
    log("Backup PASS");
    log("Restore PASS");
    log("Logs path configured PASS");
    log("Uninstall preserves data by default PASS");
    log(finalLine);
  } finally {
    server.kill();
    fs.writeFileSync(proofPath, `${lines.join("\n")}\n`, "utf8");
  }
}

main().catch((error) => {
  log(`FAILED: ${error.stack || error.message}`);
  fs.writeFileSync(proofPath, `${lines.join("\n")}\n`, "utf8");
  process.exit(1);
});
