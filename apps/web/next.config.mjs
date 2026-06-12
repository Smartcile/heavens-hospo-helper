/** @type {import('next').NextConfig} */
const nextConfig = {
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
