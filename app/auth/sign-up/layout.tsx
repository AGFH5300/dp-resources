import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { publicPageMetadata } from '@/lib/seo';
import { getSessionResourceMembership } from '@/lib/supabase';

export const metadata: Metadata = publicPageMetadata({
  title: 'Sign up',
  description:
    'Create a free DP Resources account to access the study resource library.',
  path: '/auth/sign-up',
});

export default async function SignUpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, membership } = await getSessionResourceMembership();
  if (!user) return children;
  if (membership?.is_suspended) redirect('/account-suspended');
  redirect('/library');
}
