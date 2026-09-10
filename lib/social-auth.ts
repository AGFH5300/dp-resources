export const SOCIAL_AUTH_PROVIDER_KEYS = [
  'google',
  'microsoft',
  'apple',
  'github',
] as const;

export type SocialAuthProviderKey = (typeof SOCIAL_AUTH_PROVIDER_KEYS)[number];
export type SocialAuthMode = 'login' | 'signup';

export type SocialAuthProviderConfig = {
  key: SocialAuthProviderKey;
  label: string;
  supabaseProvider: 'google' | 'azure' | 'apple' | 'github';
  scopes?: string;
};

export const SOCIAL_AUTH_PROVIDERS: Record<
  SocialAuthProviderKey,
  SocialAuthProviderConfig
> = {
  google: {
    key: 'google',
    label: 'Google',
    supabaseProvider: 'google',
  },
  microsoft: {
    key: 'microsoft',
    label: 'Microsoft',
    supabaseProvider: 'azure',
    scopes: 'email',
  },
  apple: {
    key: 'apple',
    label: 'Apple',
    supabaseProvider: 'apple',
  },
  github: {
    key: 'github',
    label: 'GitHub',
    supabaseProvider: 'github',
  },
};

export function socialAuthProviderFromInput(
  value: string | null | undefined,
): SocialAuthProviderConfig | null {
  if (!value) return null;
  const key = value.trim().toLowerCase() as SocialAuthProviderKey;
  return SOCIAL_AUTH_PROVIDER_KEYS.includes(key)
    ? SOCIAL_AUTH_PROVIDERS[key]
    : null;
}

export function socialAuthProviderFromSupabase(
  value: string | null | undefined,
): SocialAuthProviderConfig | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return (
    Object.values(SOCIAL_AUTH_PROVIDERS).find(
      (provider) => provider.supabaseProvider === normalized,
    ) || null
  );
}

export function socialAuthModeFromInput(
  value: string | null | undefined,
): SocialAuthMode {
  return value === 'signup' ? 'signup' : 'login';
}
