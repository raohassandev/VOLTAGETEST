import crypto from "crypto";
import os from "os";
import fs from "fs";
import path from "path";

const INSTALLATION_ID_FILE = "installation-id";

function licenseDir() {
  const configured = process.env.UMS_LICENSE_DIR || process.env.UMS_LICENSE_PATH;
  if (configured) {
    const ext = path.extname(configured);
    return ext ? path.dirname(configured) : configured;
  }
  return path.join(process.cwd(), "data", "license");
}

function readOrCreateInstallationId() {
  const dir = licenseDir();
  const file = path.join(dir, INSTALLATION_ID_FILE);
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
    const id = crypto.randomUUID();
    fs.writeFileSync(file, id, { encoding: "utf8", flag: "wx" });
    return id;
  } catch {
    return process.env.UMS_INSTALLATION_ID || "volatile-local-installation";
  }
}

export function getMachineCode() {
  const override = process.env.UMS_MACHINE_CODE;
  if (override?.trim()) return override.trim().toUpperCase();

  const material = [
    "ums-license-v1",
    readOrCreateInstallationId(),
    os.hostname(),
    process.env.UMS_HOST_FINGERPRINT || "",
  ].join("|");
  const digest = crypto.createHash("sha256").update(material).digest("hex").toUpperCase();
  return `AMX-UMS-${digest.slice(0, 4)}-${digest.slice(4, 8)}-${digest.slice(8, 12)}`;
}
