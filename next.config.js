/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output bundles server files into .next/standalone for Docker.
  output: 'standalone',
  // Prevent Next.js from bundling these Node-only packages into the Edge runtime
  serverExternalPackages: ['openai', 'mammoth', 'pdf-parse'],
};

module.exports = nextConfig;
