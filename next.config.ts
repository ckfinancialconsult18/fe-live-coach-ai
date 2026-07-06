import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output bundles server files into .next/standalone for Docker.
  // The custom server.ts is NOT included automatically — see Dockerfile.
  output: 'standalone',
  // Prevent Next.js from bundling these Node-only packages into the Edge runtime
  serverExternalPackages: ['openai', 'mammoth', 'pdf-parse'],
};

export default nextConfig;
