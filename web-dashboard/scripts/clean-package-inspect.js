/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const archive = process.argv[2] || path.resolve(__dirname, "..", "..", "VOLTAGETEST-v2.1.0-source-clean.zip");
const listing = execFileSync("tar", ["-tf", archive], { encoding: "utf8" });
const forbidden = /\.(env)$|CREDENTIALS|passwords$|failed-attempts|backups|node_modules|\.next|playwright-report|test-results|\.err\.log$|\.elf$|\.map$|tsconfig\.tsbuildinfo|firmware\/.*\/build|private.*key|ed25519-private|\.git\//i;
const matches = listing.split(/\r?\n/).filter((line) => forbidden.test(line));
if (matches.length) {
  console.error(matches.join("\n"));
  process.exit(1);
}
console.log("Clean source package inspection PASS");
