/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@hospo-ops/db', '@hospo-ops/types'],
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
    // Enables instrumentation.ts — starts the internal cron scheduler on boot.
    instrumentationHook: true,
  },
  images: {
    remotePatterns: [],
  },
}

export default nextConfig
