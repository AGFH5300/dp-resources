import type { Metadata } from 'next'
import { publicPageMetadata } from '@/lib/seo'

export const metadata: Metadata = publicPageMetadata({
  title: 'Log in',
  description: 'Log in to DP Resources to access your private study resource library.',
  path: '/auth/login',
})

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
