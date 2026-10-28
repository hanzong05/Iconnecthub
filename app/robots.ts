import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '')

/** Only the sign-in page is public. The admin area, the upload endpoint and server actions are kept out of search engines. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/dashboard', '/api/', '/session-expired'] }],
    ...(SITE_URL ? { sitemap: `${SITE_URL}/sitemap.xml`, host: SITE_URL } : {}),
  }
}
