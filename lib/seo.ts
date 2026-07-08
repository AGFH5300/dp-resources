import type { Metadata } from 'next'

export const SITE_NAME = 'DP Resources'
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://dp.resources.anshgupta.cc').replace(/\/$/, '')
export const SITE_DESCRIPTION = 'A private, account-based DP resource library for study materials, notes, documents, and school resources.'

export function absoluteUrl(path = '/') {
  return new URL(path, SITE_URL).toString()
}

export function publicPageMetadata({
  title,
  description = SITE_DESCRIPTION,
  path = '/',
}: {
  title: string
  description?: string
  path?: string
}): Metadata {
  const url = absoluteUrl(path)
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      siteName: SITE_NAME,
      type: 'website',
      locale: 'en_US',
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: SITE_NAME,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${SITE_NAME}`,
      description,
      images: ['/opengraph-image'],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  }
}

export function privatePageMetadata(title: string): Metadata {
  return {
    title,
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: {
        index: false,
        follow: false,
        nocache: true,
      },
    },
  }
}
