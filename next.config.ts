import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow server components to call external APIs
  },
  // Required for OpenAI WebSocket in browser
  serverExternalPackages: ['openai', 'mammoth', 'pdf-parse'],
};

export default nextConfig;
