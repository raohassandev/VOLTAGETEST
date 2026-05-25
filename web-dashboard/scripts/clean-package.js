/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");

const FORBIDDEN = /\.(env)$|CREDENTIALS|passwords$|failed-attempts|backups|node_modules|\.next|playwright-report|test-results|\.err\.log$|\.elf$|\.map$|tsconfig\.tsbuildinfo|firmware\/.*\/build|private.*key|ed25519-private|\.git\/|(^|\/)\.claude\/|settings\.local\.json/i;

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

module.exports = { FORBIDDEN, inspectZip, listZipEntries };
