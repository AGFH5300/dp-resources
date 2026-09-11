export const SOCIAL_AUTH_PROVIDER_KEYS = [
  'google',
  'microsoft',
  'github',
] as const;

export type SocialAuthProviderKey = (typeof SOCIAL_AUTH_PROVIDER_KEYS)[number];
export type SocialAuthMode = 'login' | 'signup';

export type SocialAuthProviderConfig = {
  key: SocialAuthProviderKey;
  label: string;
};

export const SOCIAL_AUTH_PROVIDERS: Record<
  SocialAuthProviderKey,
  SocialAuthProviderConfig
> = {
  google: { key: 'google', label: 'Google' },
  microsoft: { key: 'microsoft', label: 'Microsoft' },
  github: { key: 'github', label: 'GitHub' },
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

export function socialAuthModeFromInput(
  value: string | null | undefined,
): SocialAuthMode {
  return value === 'signup' ? 'signup' : 'login';
}
