import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '')

/** Lists the only public page. Empty until NEXT_PUBLIC_SITE_URL is set, because a sitemap needs absolute addresses. */
export default function sitemap(): MetadataRoute.Sitemap {
  return SITE_URL ? [{ url: `${SITE_URL}/`, changeFrequency: 'monthly', priority: 1 }] : []
}
