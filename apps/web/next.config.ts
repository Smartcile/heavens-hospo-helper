import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@hospo-ops/db', '@hospo-ops/types'],
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
  images: {
    remotePatterns: [],
  },
}

export default nextConfig
