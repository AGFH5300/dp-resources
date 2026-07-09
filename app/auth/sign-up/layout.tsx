import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { publicPageMetadata } from '@/lib/seo'
import { getSessionResourceMembership } from '@/lib/supabase'

export const metadata: Metadata = publicPageMetadata({
  title: 'Sign up',
  description: 'Create a DP Resources account to access the private resource library.',
  path: '/auth/sign-up',
})

export default async function SignUpLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getSessionResourceMembership()
  if (user) redirect('/library')

  return children
}
