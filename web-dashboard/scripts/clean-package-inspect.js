/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const { inspectArtifact } = require("./clean-package");

const archive = process.argv[2] || path.resolve(__dirname, "..", "..", "VOLTAGETEST-v1.0.0-source-clean.zip");
const matches = inspectArtifact(archive);
if (matches.length) {
  console.error(matches.join("\n"));
  process.exit(1);
}
console.log("Clean source package inspection PASS");
