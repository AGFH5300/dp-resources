import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/auth-shell';
import {
  SOCIAL_PENDING_COOKIE,
  openSocialPayload,
  type PendingSocialIdentity,
} from '@/lib/direct-social-auth';
import { privatePageMetadata } from '@/lib/seo';
import { SOCIAL_AUTH_PROVIDERS } from '@/lib/social-auth';
import { FinishSocialProfileForm } from './finish-profile-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = privatePageMetadata('Create account');

export default async function FinishSocialProfilePage() {
  const store = await cookies();
  const pending = openSocialPayload<PendingSocialIdentity>(
    store.get(SOCIAL_PENDING_COOKIE)?.value,
  );

  if (!pending || pending.version !== 1 || pending.expiresAt < Date.now()) {
    redirect('/auth/sign-up?social_error=failed');
  }

  const provider = SOCIAL_AUTH_PROVIDERS[pending.provider];
  if (!provider) redirect('/auth/sign-up?social_error=failed');

  return (
    <AuthShell
      eyebrow="Create account"
      title="Set up your free account in a few steps."
      description="Enter your details, verify your identity, then continue to a massive resource library."
      quote="The goal of education is not to increase the amount of knowledge but to create the possibilities for a child to invent and discover."
      attribution="Jean Piaget"
    >
      <FinishSocialProfileForm
        email={pending.email}
        initialFullName={pending.fullName}
        nextPath={pending.next}
        providerLabel={provider.label}
      />
    </AuthShell>
  );
}
