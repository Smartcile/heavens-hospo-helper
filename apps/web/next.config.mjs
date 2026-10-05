/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@hospo-ops/db', '@hospo-ops/types'],
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
    // Enables instrumentation.ts — starts the internal cron scheduler on boot.
    instrumentationHook: true,
    // Compile only the deep modules a route actually imports instead of the
    // whole barrel — cuts dev compile time for the heavy ones (floor planner
    // uses pixi.js, the pathways board uses @xyflow/react, PDF routes use jspdf).
    // These packages ship an `exports` map, which this optimisation requires.
    optimizePackageImports: ['pixi.js', '@xyflow/react', 'jspdf'],
  },
  images: {
    remotePatterns: [],
  },
}

export default nextConfig
