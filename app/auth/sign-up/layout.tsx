import type { Metadata } from 'next'
import { publicPageMetadata } from '@/lib/seo'

export const metadata: Metadata = publicPageMetadata({
  title: 'Sign up',
  description: 'Create a DP Resources account to request access to the private resource library.',
  path: '/auth/sign-up',
})

export default function SignUpLayout({ children }: { children: React.ReactNode }) {
  return children
}
