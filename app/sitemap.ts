import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/seo'

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return [
    {
      url: absoluteUrl('/'),
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: absoluteUrl('/auth/login'),
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: absoluteUrl('/auth/sign-up'),
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: absoluteUrl('/privacy'),
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: absoluteUrl('/terms'),
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]
}
