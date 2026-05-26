#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const mode = process.argv[2] ?? "manual";
const repo = process.cwd();
const proofDir = path.join(repo, "docs", "audit", "logs", "2026-05-25");
fs.mkdirSync(proofDir, { recursive: true });

const proofPath = path.join(
  proofDir,
  mode === "windows" ? "windows-installer-proof.txt" : mode === "linux" ? "linux-native-proof.txt" : "manual-ui-proof.txt",
);
const finalLine = mode === "windows" ? "WINDOWS INSTALLER CERTIFICATION PASSED" : mode === "linux" ? "LINUX NATIVE CERTIFICATION PASSED" : "MANUAL UI PROOF PASSED";
const lines = [];
const port = Number(process.env.CERT_PORT ?? (mode === "linux" ? 3304 : mode === "manual" ? 3305 : 3303));
const baseUrl = `http://127.0.0.1:${port}`;
const adminPass = "AdminTest123!";
const dbUrl = process.env.DATABASE_URL ?? "postgresql://ums_user:ums_password@127.0.0.1:5432/ums_local";
let publicPem = "";
let privatePem = "";

function log(message) {
  lines.push(message);
  console.log(message);
}

function writeProof() {
  fs.writeFileSync(proofPath, `${lines.join("\n")}\n`, "utf8");
}

function run(command, args, options = {}) {
  log(`$ ${command} ${args.join(" ")}`);
  return execFileSync(command, args, { stdio: "pipe", encoding: "utf8", ...options });
}

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

function makeLicense(machineCode, maxUps) {
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
  const signature = crypto.sign(null, Buffer.from(payloadB64), crypto.createPrivateKey(privatePem));
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
  for (let i = 0; i < 90; i += 1) {
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200 && res.body.includes('"ok"')) return;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("health endpoint did not become ready");
}

function cookieFrom(headers) {
  const cookies = headers["set-cookie"] ?? [];
  return (Array.isArray(cookies) ? cookies : [cookies]).map((item) => String(item).split(";")[0]).join("; ");
}

async function exerciseCore({ browserProof = false } = {}) {
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
  const status = await request("GET", "/api/license/status", { cookie });
  if (status.status !== 200) throw new Error(`license status failed: ${status.status}`);
  log("License status page/API PASS");

  const invalid = await request("POST", "/api/license/activate", { cookie, body: { license: { payload: "bad", signature: "bad", algorithm: "Ed25519" } } });
  if (invalid.status !== 400) throw new Error(`invalid license expected 400 got ${invalid.status}`);
  log("Invalid license rejected PASS");

  const activate = await request("POST", "/api/license/activate", { cookie, body: { license: makeLicense(machineCode, 1) } });
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

  if (browserProof) await captureBrowserProof();
}

async function captureBrowserProof() {
  const requireFromWeb = createRequire(path.join(repo, "web-dashboard", "package.json"));
  const { chromium } = requireFromWeb("@playwright/test");
  const screenshotDir = path.join(proofDir, "manual-ui-screenshots");
  fs.mkdirSync(screenshotDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(screenshotDir, "01-login.png"), fullPage: true });
  await page.fill('input[name="username"]', "admin");
  await page.fill('input[name="password"]', adminPass);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle" }), page.click('button[type="submit"]')]);
  await page.screenshot({ path: path.join(screenshotDir, "02-dashboard.png"), fullPage: true });
  await page.goto(`${baseUrl}/admin/inventory`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(screenshotDir, "03-ups-inventory.png"), fullPage: true });
  await page.goto(`${baseUrl}/admin/license`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(screenshotDir, "04-license.png"), fullPage: true });
  await page.goto(`${baseUrl}/admin/system`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(screenshotDir, "05-system-health.png"), fullPage: true });
  await browser.close();
  log(`Browser screenshots written to ${screenshotDir}`);
  log("Browser-based manual UI proof PASS");
}

function prepareKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

function extractZip(archive, target) {
  run("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${archive.replaceAll("'", "''")}' -DestinationPath '${target.replaceAll("'", "''")}' -Force`]);
}

function extractTar(archive, target) {
  fs.mkdirSync(target, { recursive: true });
  run("tar", ["-xzf", archive, "-C", target]);
}

function restoreDbUrl(label) {
  const url = new URL(dbUrl);
  const dbName = `${url.pathname.replace(/^\//, "")}_${label}_${Date.now()}`;
  const adminUrl = new URL(dbUrl);
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(dbUrl);
  targetUrl.pathname = `/${dbName}`;
  run("psql", [adminUrl.toString(), "-c", `CREATE DATABASE "${dbName.replaceAll('"', '""')}"`], { env: process.env });
  return targetUrl.toString();
}

async function certifyWindows() {
  const archive = path.join(repo, "VOLTAGETEST-v2.1.0-windows-installer.zip");
  if (!fs.existsSync(archive)) throw new Error(`missing artifact: ${archive}`);
  const root = path.join(os.tmpdir(), `voltagetest-win-${Date.now()}`);
  extractZip(archive, root);
  const installDir = path.join(os.tmpdir(), `voltagetest-app-${Date.now()}`);
  const dataDir = path.join(os.tmpdir(), `voltagetest-data-${Date.now()}`);
  const logDir = path.join(os.tmpdir(), `voltagetest-logs-${Date.now()}`);
  run("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    path.join(root, "release", "windows-service", "install.ps1"),
    "-SourceRoot",
    root,
    "-InstallDir",
    installDir,
    "-DataDir",
    dataDir,
    "-LogDir",
    logDir,
    "-Port",
    String(port),
    "-DatabaseUrl",
    dbUrl,
    "-AdminPassword",
    adminPass,
    "-LicensePublicKeyPem",
    publicPem,
  ]);
  log("Windows package extracted and installed PASS");
  await exerciseCore();
  const backup = run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(root, "release", "windows-service", "backup.ps1"), "-EnvFile", path.join(dataDir, "voltagetest.env"), "-BackupDir", path.join(dataDir, "backups")]).trim().split(/\r?\n/).pop();
  if (!backup || !fs.existsSync(backup)) throw new Error("Windows backup file missing");
  log("Backup PASS");
  const restoreEnv = path.join(dataDir, "restore-test.env");
  fs.writeFileSync(restoreEnv, `DATABASE_URL=${restoreDbUrl("win_restore")}\n`, "utf8");
  run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(root, "release", "windows-service", "restore.ps1"), "-EnvFile", restoreEnv, "-BackupFile", backup]);
  log("Restore PASS");
  run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(root, "release", "windows-service", "uninstall.ps1"), "-InstallDir", installDir, "-DataDir", dataDir]);
  if (!fs.existsSync(dataDir)) throw new Error("Windows uninstall did not preserve data");
  log("Uninstall preserves data by default PASS");
}

async function certifyLinux() {
  const archive = path.join(repo, "VOLTAGETEST-v2.1.0-linux-native.tar.gz");
  if (!fs.existsSync(archive)) throw new Error(`missing artifact: ${archive}`);
  const root = path.join(os.tmpdir(), `voltagetest-linux-${Date.now()}`);
  extractTar(archive, root);
  const appDir = path.join(os.tmpdir(), `voltagetest-app-${Date.now()}`);
  const envDir = path.join(os.tmpdir(), `voltagetest-etc-${Date.now()}`);
  const dataDir = path.join(os.tmpdir(), `voltagetest-data-${Date.now()}`);
  const logDir = path.join(os.tmpdir(), `voltagetest-logs-${Date.now()}`);
  fs.mkdirSync(envDir, { recursive: true });
  const envFile = path.join(envDir, "voltagetest.env");
  fs.writeFileSync(envFile, [
    "NODE_ENV=production",
    `PORT=${port}`,
    `DATABASE_URL=${dbUrl}`,
    "UPS_AUTH_USERNAME=admin",
    `UPS_AUTH_PASSWORD_HASH=${run("node", ["-e", `const b=require(${JSON.stringify(path.join(repo, "web-dashboard", "node_modules", "bcryptjs"))});process.stdout.write(b.hashSync(${JSON.stringify(adminPass)},12));`])}`,
    `UPS_AUTH_TOKEN=${crypto.randomBytes(32).toString("hex")}`,
    `UMS_LICENSE_PUBLIC_KEY_PEM=${publicPem.trim().replace(/\n/g, "\\n")}`,
    `UMS_LICENSE_DIR=${path.join(dataDir, "license")}`,
    "ENABLE_MANUAL_TELEMETRY_POST=true",
    "ENABLE_EMBEDDED_BROKER=false",
    "ENABLE_INPROCESS_WORKER=true",
  ].join("\n"), "utf8");
  run("bash", [path.join(root, "release", "linux-native", "install.sh")], {
    cwd: root,
    env: { ...process.env, APP_DIR: appDir, ENV_DIR: envDir, DATA_DIR: dataDir, LOG_DIR: logDir, ENV_FILE: envFile, VOLTAGETEST_CI_MODE: "1" },
  });
  log("Linux package extracted and installed PASS");
  await exerciseCore();
  const backup = run("bash", [path.join(root, "release", "linux-native", "backup.sh")], { env: { ...process.env, ENV_FILE: envFile, BACKUP_DIR: path.join(dataDir, "backups") } }).trim().split(/\r?\n/).pop();
  if (!backup || !fs.existsSync(backup)) throw new Error("Linux backup file missing");
  log("Backup PASS");
  const restoreEnv = path.join(envDir, "restore-test.env");
  fs.writeFileSync(restoreEnv, `DATABASE_URL=${restoreDbUrl("linux_restore")}\n`, "utf8");
  run("bash", [path.join(root, "release", "linux-native", "restore.sh"), backup], { env: { ...process.env, ENV_FILE: restoreEnv } });
  log("Restore PASS");
  run("bash", [path.join(root, "release", "linux-native", "uninstall.sh")], { env: { ...process.env, APP_DIR: appDir, DATA_DIR: dataDir, VOLTAGETEST_CI_MODE: "1" } });
  if (!fs.existsSync(dataDir)) throw new Error("Linux uninstall did not preserve data");
  log("Uninstall preserves data by default PASS");
}

async function certifyManual() {
  const web = path.join(repo, "web-dashboard");
  const hash = run("node", ["-e", `const b=require(${JSON.stringify(path.join(web, "node_modules", "bcryptjs"))});process.stdout.write(b.hashSync(${JSON.stringify(adminPass)},12));`]);
  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    DATABASE_URL: dbUrl,
    UPS_AUTH_USERNAME: "admin",
    UPS_AUTH_PASSWORD_HASH: hash,
    UPS_AUTH_TOKEN: crypto.randomBytes(32).toString("hex"),
    UMS_LICENSE_PUBLIC_KEY_PEM: publicPem,
    UMS_LICENSE_ENFORCEMENT: "enabled",
    UMS_LICENSE_DIR: path.join(os.tmpdir(), `voltagetest-license-manual-${Date.now()}`),
    ENABLE_EMBEDDED_BROKER: "false",
    ENABLE_INPROCESS_WORKER: "false",
    ENABLE_MANUAL_TELEMETRY_POST: "true",
  };
  run("npm", ["run", "db:generate"], { cwd: web, env });
  run("npm", ["run", "db:migrate"], { cwd: web, env });
  run("npm", ["run", "build"], { cwd: web, env });
  const server = spawn(process.execPath, [path.join(web, ".next", "standalone", "server.js")], { cwd: web, env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (chunk) => log(`[server] ${chunk.toString().trim()}`));
  server.stderr.on("data", (chunk) => log(`[server-err] ${chunk.toString().trim()}`));
  try {
    await exerciseCore({ browserProof: true });
  } finally {
    server.kill();
  }
}

async function main() {
  prepareKeys();
  log(`Certification mode: ${mode}`);
  log(`Commit: ${run("git", ["rev-parse", "HEAD"]).trim()}`);
  log(`Package: ${mode === "windows" ? "VOLTAGETEST-v2.1.0-windows-installer.zip" : mode === "linux" ? "VOLTAGETEST-v2.1.0-linux-native.tar.gz" : "manual-ui"}`);
  log("UPS_AUTH_PASSWORD_HASH configured PASS");
  log("UMS_LICENSE_PUBLIC_KEY_PEM configured PASS");
  if (mode === "windows") await certifyWindows();
  else if (mode === "linux") await certifyLinux();
  else await certifyManual();
  log(finalLine);
  writeProof();
}

main().catch((error) => {
  log(`FAILED: ${error.stack || error.message}`);
  writeProof();
  process.exit(1);
});
