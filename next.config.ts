import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow server components to call external APIs
  },
  // Prevent Next.js from bundling these Node-only packages into the Edge runtime
  serverExternalPackages: ['openai', 'mammoth', 'pdf-parse'],
};

export default nextConfig;
