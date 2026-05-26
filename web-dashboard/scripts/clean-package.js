/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const FORBIDDEN = /\.(env)$|CREDENTIALS|passwords$|failed-attempts|(^|\/)(archive|docs\/archive|docs\/audit)\/|(^|\/)UMS_.*(Audit|Codex|Claude|Fixing|Energy_Analyzer|Final).*\.md$|backups|node_modules|\.next\/cache|playwright-report|test-results|\.err\.log$|\.elf$|\.map$|tsconfig\.tsbuildinfo|firmware\/.*\/build|private.*key|ed25519-private|\.git\/|(^|\/)\.claude\/|settings\.local\.json/i;

function listZipEntries(zipPath) {
  const buf = fs.readFileSync(zipPath);
  const entries = [];
  let offset = 0;
  while (offset <= buf.length - 4) {
    const sig = buf.readUInt32LE(offset);
    if (sig === 0x04034b50) {
      const flags = buf.readUInt16LE(offset + 6);
      const compressedSize = buf.readUInt32LE(offset + 18);
      const fileNameLength = buf.readUInt16LE(offset + 26);
      const extraLength = buf.readUInt16LE(offset + 28);
      const nameStart = offset + 30;
      const name = buf.toString("utf8", nameStart, nameStart + fileNameLength).replace(/\\/g, "/");
      entries.push(name);
      if (flags & 0x08) {
        const next = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), nameStart + fileNameLength + extraLength);
        if (next === -1) break;
        offset = next;
      } else {
        offset = nameStart + fileNameLength + extraLength + compressedSize;
      }
    } else {
      offset += 1;
    }
  }
  return entries;
}

function inspectZip(zipPath) {
  const entries = listZipEntries(zipPath);
  if (!entries.length) throw new Error(`No ZIP entries found in ${zipPath}`);
  return entries.filter((entry) => FORBIDDEN.test(entry));
}

function listTarEntries(archivePath) {
  return execFileSync("tar", ["-tzf", archivePath], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((entry) => entry.replace(/\\/g, "/"));
}

function requiredEntries(archivePath) {
  const normalized = archivePath.replace(/\\/g, "/");
  if (normalized.includes("windows-offline-installer")) {
    return [
      "release/windows-service/install.ps1",
      "release/windows-service/uninstall.ps1",
      "release/windows-service/rollback.ps1",
      "docs/INSTALLATION_GUIDE.md",
      "docs/ROLLBACK_RECOVERY_GUIDE.md",
      "docs/COMMISSIONING_ENGINEER_GUIDE.md",
      "THIRD_PARTY_NOTICES.md",
    ];
  }
  if (normalized.includes("linux-native-offline")) {
    return [
      "release/linux-native/install.sh",
      "release/linux-native/uninstall.sh",
      "release/linux-native/rollback.sh",
      "docs/INSTALLATION_GUIDE.md",
      "docs/ROLLBACK_RECOVERY_GUIDE.md",
      "docs/COMMISSIONING_ENGINEER_GUIDE.md",
      "THIRD_PARTY_NOTICES.md",
    ];
  }
  return [];
}

function inspectArtifact(archivePath) {
  const lower = archivePath.toLowerCase();
  let entries;
  let matches;
  if (lower.endsWith(".zip")) {
    entries = listZipEntries(archivePath);
    if (!entries.length) throw new Error(`No ZIP entries found in ${archivePath}`);
    matches = entries.filter((entry) => FORBIDDEN.test(entry));
  } else if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) {
    entries = listTarEntries(archivePath);
    matches = entries.filter((entry) => FORBIDDEN.test(entry));
  } else {
    throw new Error(`Unsupported artifact type: ${archivePath}`);
  }

  if (!archivePath.includes("v1.0.0")) {
    matches.push(`version mismatch: ${archivePath}`);
  }

  for (const required of requiredEntries(archivePath)) {
    if (!entries.includes(required)) matches.push(`missing required package entry: ${required}`);
  }

  return matches;
}

module.exports = { FORBIDDEN, inspectArtifact, inspectZip, listTarEntries, listZipEntries };
