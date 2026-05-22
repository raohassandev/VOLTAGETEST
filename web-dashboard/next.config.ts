import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone output bundles everything needed into .next/standalone/
  // so the installer can ship node + app without node_modules
  output: "standalone",
};

export default nextConfig;
