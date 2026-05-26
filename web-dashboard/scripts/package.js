/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { inspectArtifact } = require("./clean-package");

const repoRoot = path.resolve(__dirname, "..", "..");
const outputs = [
  {
    file: path.join(repoRoot, "VOLTAGETEST-v2.1.0-source-clean.zip"),
    args: ["archive", "--format=zip", "--output"],
    paths: [],
  },
  {
    file: path.join(repoRoot, "VOLTAGETEST-v2.1.0-windows-installer.zip"),
    args: ["archive", "--format=zip", "--output"],
    paths: [
      "web-dashboard/installer",
      "web-dashboard/SETUP.ps1",
      "release/windows-service",
      "web-dashboard/package.json",
      "web-dashboard/package-lock.json",
      "web-dashboard/prisma",
      "web-dashboard/src",
      "web-dashboard/worker",
      "web-dashboard/public",
      "web-dashboard/scripts",
      "web-dashboard/next.config.ts",
      "web-dashboard/tsconfig.json",
      "web-dashboard/README.md",
      "docs/LICENSING.md",
      "docs/SECURITY_AUDIT.md",
      "release/UMS_LICENSE_ACTIVATION_GUIDE.md",
      "release/UMS_OPERATOR_GUIDE.md",
      "release/UMS_INSTALLER_CHECKLIST.md",
    ],
  },
  {
    file: path.join(repoRoot, "VOLTAGETEST-v2.1.0-linux-native.tar.gz"),
    args: ["archive", "--format=tar.gz", "--output"],
    paths: [
      "release/linux-native",
      "web-dashboard/package.json",
      "web-dashboard/package-lock.json",
      "web-dashboard/prisma",
      "web-dashboard/src",
      "web-dashboard/worker",
      "web-dashboard/public",
      "web-dashboard/scripts",
      "web-dashboard/next.config.ts",
      "web-dashboard/tsconfig.json",
      "web-dashboard/README.md",
      "docs/LICENSING.md",
      "docs/SECURITY_AUDIT.md",
      "release/UMS_LICENSE_ACTIVATION_GUIDE.md",
      "release/UMS_OPERATOR_GUIDE.md",
    ],
  },
];

for (const output of outputs) {
  if (fs.existsSync(output.file)) fs.unlinkSync(output.file);
  execFileSync("git", [...output.args, output.file, "HEAD", ...output.paths], { cwd: repoRoot, stdio: "inherit" });

  const matches = inspectArtifact(output.file);
  if (matches.length) {
    console.error(`Clean package inspection failed for ${path.basename(output.file)}:`);
    for (const match of matches) console.error(match);
    process.exit(1);
  }

  console.log(`Created ${output.file}`);
  console.log(`${path.basename(output.file)} inspection PASS`);
}
