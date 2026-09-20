import type { NextConfig } from "next";

// NOTE: API proxying lives in src/proxy.ts, not here. next.config is
// evaluated during `next build`, so an env var read here would be frozen into
// routes-manifest.json and could not vary per platform at runtime.
const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
};

export default nextConfig;
