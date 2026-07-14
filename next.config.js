// Allow next/image to serve avatars and logos uploaded to Supabase storage.
// Hostname is derived from the env so it tracks whichever project is configured.
let supabaseHostname;
try {
  supabaseHostname = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname;
} catch {
  supabaseHostname = undefined;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output bundles server files into .next/standalone for Docker.
  output: 'standalone',
  // Prevent Next.js from bundling these Node-only packages into the Edge runtime
  serverExternalPackages: ['openai', 'mammoth', 'pdf-parse'],
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: 'https',
            hostname: supabaseHostname,
            pathname: '/storage/v1/object/public/**',
          },
        ]
      : [],
  },
};

module.exports = nextConfig;
