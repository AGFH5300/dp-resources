import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DP Resources',
    short_name: 'DP Resources',
    description: 'Private DP study resource library.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f1e8',
    theme_color: '#10243f',
    categories: ['education', 'productivity'],
    icons: [
      {
        src: '/brand/dp-favicon.png',
        sizes: '1254x1254',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
