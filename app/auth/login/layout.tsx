import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { publicPageMetadata } from '@/lib/seo';
import { getSessionResourceMembership } from '@/lib/supabase';

export const metadata: Metadata = publicPageMetadata({
  title: 'Log in',
  description:
    'Log in to DP Resources to access your free study resource library.',
  path: '/auth/login',
});

export default async function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, membership } = await getSessionResourceMembership();
  if (!user) return children;
  if (membership?.is_suspended) redirect('/account-suspended');
  redirect('/library');
}
