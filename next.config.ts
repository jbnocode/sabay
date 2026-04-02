import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // maplibre-gl ships ESM; transpile it so the Next.js bundler handles it correctly
  transpilePackages: ['maplibre-gl'],
}

export default nextConfig
