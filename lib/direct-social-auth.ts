import 'server-only';

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

import { safeInternalReturnPath } from '@/lib/auth-redirect';
import { SITE_URL } from '@/lib/seo';
import type { SocialAuthMode, SocialAuthProviderKey } from '@/lib/social-auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export const DIRECT_SOCIAL_PROVIDERS = ['google', 'microsoft', 'github'] as const;
export type DirectSocialProviderKey = (typeof DIRECT_SOCIAL_PROVIDERS)[number];

export const SOCIAL_OAUTH_COOKIE = 'dp_social_oauth';
export const SOCIAL_PENDING_COOKIE = 'dp_social_pending';
export const SOCIAL_COOKIE_MAX_AGE = 10 * 60;

export type SocialOAuthTransaction = {
  version: 1;
  provider: DirectSocialProviderKey;
  mode: SocialAuthMode | 'link';
  state: string;
  verifier: string;
  next: string;
  linkUserId?: string;
  expiresAt: number;
};

export type VerifiedSocialIdentity = {
  provider: DirectSocialProviderKey;
  subject: string;
  email: string;
  fullName: string;
};

export type PendingSocialIdentity = VerifiedSocialIdentity & {
  version: 1;
  next: string;
  expiresAt: number;
};

type ProviderServerConfig = {
  key: DirectSocialProviderKey;
  clientIdEnv: string;
  clientSecretEnv: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string;
};

const PROVIDER_CONFIG: Record<DirectSocialProviderKey, ProviderServerConfig> = {
  google: {
    key: 'google',
    clientIdEnv: 'GOOGLE_OAUTH_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_OAUTH_CLIENT_SECRET',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: 'openid email profile',
  },
  microsoft: {
    key: 'microsoft',
    clientIdEnv: 'MICROSOFT_OAUTH_CLIENT_ID',
    clientSecretEnv: 'MICROSOFT_OAUTH_CLIENT_SECRET',
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: 'openid profile email User.Read',
  },
  github: {
    key: 'github',
    clientIdEnv: 'GITHUB_OAUTH_CLIENT_ID',
    clientSecretEnv: 'GITHUB_OAUTH_CLIENT_SECRET',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: 'read:user user:email',
  },
};

function socialSecret() {
  const value =
    process.env.DP_SOCIAL_AUTH_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!value) throw new Error('Social authentication signing secret is not configured.');
  return value;
}

function encode(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

function sign(value: string) {
  return createHmac('sha256', socialSecret()).update(value).digest('base64url');
}

export function sealSocialPayload(payload: object) {
  const body = encode(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function openSocialPayload<T>(value: string | undefined | null): T | null {
  if (!value) return null;
  const [body, signature, extra] = value.split('.');
  if (!body || !signature || extra) return null;
  const expected = sign(body);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function appAuthOrigin(request: NextRequest) {
  const explicit = process.env.DP_AUTH_ORIGIN?.trim();
  if (explicit) {
    const url = new URL(explicit);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
      throw new Error('DP_AUTH_ORIGIN must use HTTPS.');
    }
    return url.origin;
  }
  return process.env.NODE_ENV === 'production' ? SITE_URL : request.nextUrl.origin;
}

export function directProviderFromInput(
  value: string | null | undefined,
): DirectSocialProviderKey | null {
  if (!value) return null;
  const key = value.trim().toLowerCase() as DirectSocialProviderKey;
  return DIRECT_SOCIAL_PROVIDERS.includes(key) ? key : null;
}

export function isDirectProviderConfigured(provider: DirectSocialProviderKey) {
  const config = PROVIDER_CONFIG[provider];
  return Boolean(
    process.env[config.clientIdEnv]?.trim() && process.env[config.clientSecretEnv]?.trim(),
  );
}

export function directProviderMissingEnvironment(provider: DirectSocialProviderKey) {
  const config = PROVIDER_CONFIG[provider];
  return [config.clientIdEnv, config.clientSecretEnv].filter(
    (name) => !process.env[name]?.trim(),
  );
}

export function directProviderCallbackUrl(
  origin: string,
  provider: DirectSocialProviderKey,
) {
  return `${origin}/api/auth/social/${provider}/callback`;
}

export function createSocialOAuthTransaction(input: {
  provider: DirectSocialProviderKey;
  mode: SocialAuthMode | 'link';
  next: string | null | undefined;
  linkUserId?: string;
}): SocialOAuthTransaction {
  return {
    version: 1,
    provider: input.provider,
    mode: input.mode,
    state: randomBytes(32).toString('base64url'),
    verifier: randomBytes(48).toString('base64url'),
    next: safeInternalReturnPath(input.next, input.mode === 'link' ? '/settings' : '/library'),
    ...(input.linkUserId ? { linkUserId: input.linkUserId } : {}),
    expiresAt: Date.now() + SOCIAL_COOKIE_MAX_AGE * 1000,
  };
}

function codeChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function providerAuthorizationUrl(
  transaction: SocialOAuthTransaction,
  callbackUrl: string,
) {
  const config = PROVIDER_CONFIG[transaction.provider];
  const clientId = process.env[config.clientIdEnv]?.trim();
  if (!clientId) throw new Error(`${config.clientIdEnv} is not configured.`);

  const url = new URL(config.authorizeUrl);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', callbackUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.scopes);
  url.searchParams.set('state', transaction.state);
  url.searchParams.set('code_challenge', codeChallenge(transaction.verifier));
  url.searchParams.set('code_challenge_method', 'S256');

  if (transaction.provider === 'google') {
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'select_account');
  } else if (transaction.provider === 'microsoft') {
    url.searchParams.set('prompt', 'select_account');
  }

  return url.toString();
}

async function exchangeAuthorizationCode(
  provider: DirectSocialProviderKey,
  code: string,
  callbackUrl: string,
  verifier: string,
) {
  const config = PROVIDER_CONFIG[provider];
  const clientId = process.env[config.clientIdEnv]?.trim();
  const clientSecret = process.env[config.clientSecretEnv]?.trim();
  if (!clientId || !clientSecret) throw new Error(`${provider} OAuth is not configured.`);

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: callbackUrl,
    grant_type: 'authorization_code',
    code_verifier: verifier,
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as
    | { access_token?: string; error?: string; error_description?: string }
    | null;

  if (!response.ok || !payload?.access_token) {
    throw new Error(
      payload?.error_description || payload?.error || `${provider} token exchange failed.`,
    );
  }
  return payload.access_token;
}

function normalizedEmail(value: unknown) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

async function googleIdentity(accessToken: string): Promise<VerifiedSocialIdentity> {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const profile = (await response.json().catch(() => null)) as
    | { sub?: string; email?: string; email_verified?: boolean; name?: string }
    | null;
  const email = normalizedEmail(profile?.email);
  if (!response.ok || !profile?.sub || !email || profile.email_verified !== true) {
    throw new Error('Google did not return a verified email address.');
  }
  return {
    provider: 'google',
    subject: profile.sub,
    email,
    fullName: profile.name?.trim().slice(0, 120) || email.split('@')[0],
  };
}

async function microsoftIdentity(accessToken: string): Promise<VerifiedSocialIdentity> {
  const response = await fetch(
    'https://graph.microsoft.com/v1.0/me?$select=id,displayName,userPrincipalName',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    },
  );
  const profile = (await response.json().catch(() => null)) as
    | { id?: string; displayName?: string; userPrincipalName?: string }
    | null;
  const email = normalizedEmail(profile?.userPrincipalName);
  if (!response.ok || !profile?.id || !email) {
    throw new Error('Microsoft did not return an addressable user principal name.');
  }
  return {
    provider: 'microsoft',
    subject: profile.id,
    email,
    fullName: profile.displayName?.trim().slice(0, 120) || email.split('@')[0],
  };
}

async function githubIdentity(accessToken: string): Promise<VerifiedSocialIdentity> {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${accessToken}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const userResponse = await fetch('https://api.github.com/user', {
    headers,
    cache: 'no-store',
  });
  const user = (await userResponse.json().catch(() => null)) as
    | { id?: number; login?: string; name?: string | null; email?: string | null }
    | null;
  if (!userResponse.ok || !user?.id) throw new Error('GitHub user lookup failed.');

  const emailResponse = await fetch('https://api.github.com/user/emails', {
    headers,
    cache: 'no-store',
  });
  const emails = (await emailResponse.json().catch(() => null)) as
    | Array<{ email?: string; primary?: boolean; verified?: boolean }>
    | null;
  const verified = Array.isArray(emails)
    ? emails.find((candidate) => candidate.primary && candidate.verified) ||
      emails.find((candidate) => candidate.verified)
    : null;
  const email = normalizedEmail(verified?.email);
  if (!emailResponse.ok || !email) {
    throw new Error('GitHub did not return a verified email address.');
  }
  return {
    provider: 'github',
    subject: String(user.id),
    email,
    fullName: user.name?.trim().slice(0, 120) || user.login?.trim().slice(0, 120) || email.split('@')[0],
  };
}

export async function verifyDirectProviderCallback(input: {
  provider: DirectSocialProviderKey;
  code: string;
  callbackUrl: string;
  verifier: string;
}) {
  const accessToken = await exchangeAuthorizationCode(
    input.provider,
    input.code,
    input.callbackUrl,
    input.verifier,
  );
  if (input.provider === 'google') return googleIdentity(accessToken);
  if (input.provider === 'microsoft') return microsoftIdentity(accessToken);
  return githubIdentity(accessToken);
}

export async function establishSupabaseSession(userId: string, email: string) {
  const admin = createSupabaseAdminClient();
  const { data: generated, error: generateError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  const tokenHash = generated?.properties?.hashed_token;
  if (generateError || !tokenHash) {
    throw new Error(generateError?.message || 'Could not create DP Resources session token.');
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (error || !data.user || data.user.id !== userId) {
    await supabase.auth.signOut().catch(() => undefined);
    throw new Error(error?.message || 'DP Resources session verification failed.');
  }
  return data.user;
}
