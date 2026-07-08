import './globals.css';
import { AppToaster } from '@/components/sonner-provider';
import type { Metadata, Viewport } from 'next';
import { GlobalSearch } from '@/components/global-search';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: 'DP Resources | Private DP Study Resource Library',
    template: '%s | DP Resources',
  },
  description: SITE_DESCRIPTION,
  keywords: [
    'DP Resources',
    'IB DP resources',
    'Diploma Programme resources',
    'study resources',
    'school resource library',
  ],
  authors: [{ name: 'DP Resources' }],
  creator: 'DP Resources',
  publisher: 'DP Resources',
  category: 'education',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'DP Resources',
    description: SITE_DESCRIPTION,
    url: '/',
    siteName: SITE_NAME,
    type: 'website',
    locale: 'en_US',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'DP Resources' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DP Resources',
    description: SITE_DESCRIPTION,
    images: ['/opengraph-image'],
  },
  manifest: '/site.webmanifest',
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
};

export const viewport: Viewport = {
  themeColor: '#10243f',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}<GlobalSearch /><AppToaster /></body></html>;
}
