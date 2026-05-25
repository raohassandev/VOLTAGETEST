/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { inspectZip } = require("./clean-package");

const repoRoot = path.resolve(__dirname, "..", "..");
const output = path.join(repoRoot, "VOLTAGETEST-v2.1.0-source-clean.zip");

if (fs.existsSync(output)) fs.unlinkSync(output);
execFileSync("git", ["archive", "--format=zip", "--output", output, "HEAD"], {
  cwd: repoRoot,
  stdio: "inherit",
});

const matches = inspectZip(output);
if (matches.length) {
  console.error("Clean package inspection failed:");
  for (const match of matches) console.error(match);
  process.exit(1);
}

console.log(`Created ${output}`);
console.log("Clean source package inspection PASS");
