import type { NextConfig } from 'next'

// The Content-Security-Policy is not here: it carries a per-request nonce and
// is set in `src/proxy.ts`.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Two years, subdomains included: after the first visit the browser refuses
  // to speak plain http to this site at all, so a stripped first request is
  // the only opening left. Vercel sets this on its own domains; saying it here
  // means it holds wherever the app is served from.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

const nextConfig: NextConfig = {
  // Workspace packages are published as TypeScript source.
  transpilePackages: ['@lapka/contracts', '@lapka/shared'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
  async redirects() {
    return [
      { source: '/cats/new', destination: '/pets/new', permanent: true },
      { source: '/cats/:id/edit', destination: '/pets/:id/edit', permanent: true },
    ]
  },
}

export default nextConfig
