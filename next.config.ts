import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // Map saves send the whole map as one request (up to about 2.5 MB of text).
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
  // The phone preview reads the guest app's stylesheet from disk at run time. Without this, Vercel leaves the file out of the
  // deployed route and the preview draws unstyled.
  outputFileTracingIncludes: {
    '/dashboard/settings': ['./guest-app/src/hub.css'],
    '/dashboard/pages': ['./guest-app/src/hub.css'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // The push service worker must always be re-checked so an update reaches admins quickly.
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Content-Type', value: 'application/javascript; charset=utf-8' }] },
    ]
  },
}

export default nextConfig
