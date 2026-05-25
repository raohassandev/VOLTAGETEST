/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const output = path.join(repoRoot, "VOLTAGETEST-v2.1.0-source-clean.zip");

if (fs.existsSync(output)) fs.unlinkSync(output);
execFileSync("git", ["archive", "--format=zip", "--output", output, "HEAD"], {
  cwd: repoRoot,
  stdio: "inherit",
});

const listing = execFileSync("tar", ["-tf", output], { cwd: repoRoot, encoding: "utf8" });
const forbidden = /\.(env)$|CREDENTIALS|passwords$|failed-attempts|backups|node_modules|\.next|playwright-report|test-results|\.err\.log$|\.elf$|\.map$|tsconfig\.tsbuildinfo|firmware\/.*\/build|private.*key|ed25519-private|\.git\//i;
const matches = listing.split(/\r?\n/).filter((line) => forbidden.test(line));
if (matches.length) {
  console.error("Clean package inspection failed:");
  for (const match of matches) console.error(match);
  process.exit(1);
}

console.log(`Created ${output}`);
console.log("Clean source package inspection PASS");
