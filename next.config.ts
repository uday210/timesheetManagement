import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray package-lock.json in the home dir otherwise
  // confuses Next's root inference.
  turbopack: { root: __dirname },
};

export default nextConfig;
