import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/auth-shell';
import { requireUser } from '@/lib/auth';
import { safeInternalReturnPath } from '@/lib/auth-redirect';
import { privatePageMetadata } from '@/lib/seo';
import { socialAuthProviderFromInput } from '@/lib/social-auth';
import { createClient } from '@/lib/supabase-server';
import { FinishSocialProfileForm } from './finish-profile-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = privatePageMetadata('Finish your profile');

function providerName(metadata: Record<string, unknown>, email: string) {
  for (const key of ['full_name', 'name', 'display_name', 'user_name']) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 120);
  }
  const emailName = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim() || '';
  return emailName.slice(0, 120);
}

export default async function FinishSocialProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { user } = await requireUser();
  const params = await searchParams;
  const nextPath = safeInternalReturnPath(params.next, '/library');
  const provider = socialAuthProviderFromInput(params.provider);
  const email = user.email?.trim().toLowerCase() || '';

  if (!email) redirect('/auth/login?social_error=failed');

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('dp_resource_profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle<{ id: string }>();

  if (profile) redirect(nextPath);

  const metadata =
    user.user_metadata && typeof user.user_metadata === 'object'
      ? (user.user_metadata as Record<string, unknown>)
      : {};

  return (
    <AuthShell
      eyebrow="One DP Resources account"
      title="Almost there."
      description="Your provider has verified your identity. Finish the small DP Resources profile that stays with you no matter how you sign in."
    >
      <FinishSocialProfileForm
        email={email}
        initialFullName={providerName(metadata, email)}
        nextPath={nextPath}
        providerLabel={provider?.label || 'Your provider'}
      />
    </AuthShell>
  );
}
