import type { MetadataRoute } from 'next'
import { absoluteUrl, SITE_URL } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/auth/login', '/auth/sign-up', '/privacy', '/terms', '/opengraph-image', '/icon'],
        disallow: [
          '/api/',
          '/admin',
          '/admin/',
          '/library',
          '/library/',
          '/resource/',
          '/auth/callback',
          '/auth/verify-otp',
          '/auth/set-password',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: SITE_URL,
  }
}
