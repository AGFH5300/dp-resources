'use client';

import {
  CheckCircle2,
  KeyRound,
  Link2,
  Loader2,
  ShieldCheck,
  Unlink2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  SOCIAL_AUTH_PROVIDER_KEYS,
  SOCIAL_AUTH_PROVIDERS,
  type SocialAuthProviderKey,
} from '@/lib/social-auth';

type ConnectedIdentity = {
  id: string;
  provider: SocialAuthProviderKey;
  label: string;
  email: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type ProviderStatus = {
  key: SocialAuthProviderKey;
  label: string;
  connected: boolean;
  available: boolean;
};

type IdentityPayload = {
  identities?: ConnectedIdentity[];
  providers?: ProviderStatus[];
  passwordEnabled?: boolean;
  error?: string;
};

type AccountProfile = {
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
};

type SettingsPayload = {
  profile?: AccountProfile;
};

function initials(name: string, username: string) {
  const source = name.trim() || username.trim() || 'DP';
  return (
    source
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'DP'
  );
}

function connectedDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function ProviderLogo({ provider, className = 'size-6' }: { provider: SocialAuthProviderKey; className?: string }) {
  if (provider === 'google') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path fill="#4285F4" d="M21.6 12.23c0-.72-.06-1.25-.2-1.8H12v3.48h5.52a4.7 4.7 0 0 1-2.04 3.03l-.02.12 2.96 2.3.2.02c1.85-1.7 2.98-4.22 2.98-7.15Z" />
        <path fill="#34A853" d="M12 22c2.7 0 4.97-.89 6.62-2.62l-3.14-2.44c-.84.57-1.97.97-3.48.97a6.05 6.05 0 0 1-5.73-4.18l-.12.01-3.08 2.38-.04.11A10 10 0 0 0 12 22Z" />
        <path fill="#FBBC05" d="M6.27 13.73A6.2 6.2 0 0 1 5.94 12c0-.6.11-1.18.32-1.73v-.12L3.14 7.73l-.1.05A10 10 0 0 0 2 12c0 1.52.34 2.96 1.03 4.22l3.24-2.5Z" />
        <path fill="#EA4335" d="M12 6.09c1.9 0 3.18.82 3.91 1.5l2.78-2.71A9.45 9.45 0 0 0 12 2a10 10 0 0 0-8.97 5.78l3.23 2.5A6.07 6.07 0 0 1 12 6.08Z" />
      </svg>
    );
  }

  if (provider === 'microsoft') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
        <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
        <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
        <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
      </svg>
    );
  }

  if (provider === 'github') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
        <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.02c-3.22.7-3.9-1.36-3.9-1.36-.52-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.38.97.1-.75.4-1.27.74-1.56-2.57-.29-5.27-1.28-5.27-5.68 0-1.26.45-2.28 1.19-3.08-.12-.3-.52-1.47.11-3.05 0 0 .97-.31 3.17 1.18a11.08 11.08 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.05.74.8 1.19 1.82 1.19 3.08 0 4.42-2.7 5.38-5.28 5.67.42.36.79 1.06.79 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.34.07 2.27.74 3.08.8 1.21-.25 2.37-.96 3.67-.87 1.56.12 2.73.74 3.51 1.86-3.22 1.93-2.46 6.18.5 7.37-.59 1.54-1.36 3.04-2.76 3.81ZM12.03 7.25C11.88 4.96 13.73 3.07 15.87 3c.3 2.64-2.4 4.6-3.84 4.25Z" />
    </svg>
  );
}

function providerSurface(provider: SocialAuthProviderKey) {
  if (provider === 'google') return 'bg-white text-slate-900 ring-slate-200 dark:bg-white dark:text-slate-900';
  if (provider === 'microsoft') return 'bg-white text-slate-900 ring-slate-200 dark:bg-white dark:text-slate-900';
  if (provider === 'github') return 'bg-slate-950 text-white ring-slate-800 dark:bg-white dark:text-slate-950 dark:ring-slate-200';
  return 'bg-slate-950 text-white ring-slate-800 dark:bg-white dark:text-slate-950 dark:ring-slate-200';
}

export function ConnectedAccounts() {
  const [identities, setIdentities] = useState<ConnectedIdentity[]>([]);
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState<SocialAuthProviderKey | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<ConnectedIdentity | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [identityResponse, settingsResponse] = await Promise.all([
        fetch('/api/account/identities', { cache: 'no-store' }),
        fetch('/api/account/settings', { cache: 'no-store', credentials: 'same-origin' }),
      ]);
      const identityPayload = (await identityResponse.json().catch(() => null)) as IdentityPayload | null;
      if (!identityResponse.ok || !identityPayload) {
        setError(identityPayload?.error || 'Could not load sign-in methods.');
        return;
      }

      setIdentities(identityPayload.identities || []);
      setProviderStatuses(identityPayload.providers || []);
      setPasswordEnabled(identityPayload.passwordEnabled === true);

      if (settingsResponse.ok) {
        const settingsPayload = (await settingsResponse.json().catch(() => null)) as SettingsPayload | null;
        if (settingsPayload?.profile) setProfile(settingsPayload.profile);
      }
      setError(null);
    } catch {
      setError('Could not load sign-in methods.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const params = new URLSearchParams(window.location.search);
    const linked = params.get('linked') as SocialAuthProviderKey | null;
    if (linked && SOCIAL_AUTH_PROVIDERS[linked]) {
      setMessage(`${SOCIAL_AUTH_PROVIDERS[linked].label} is now connected to your DP Resources account.`);
    }
    if (params.get('social_error') === 'link_failed') {
      setError('The account could not be connected. Please try again.');
    }
  }, []);

  async function connect(provider: SocialAuthProviderKey) {
    setBusyProvider(provider);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/account/identities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; url?: string; error?: string }
        | null;
      if (!response.ok || !payload?.url) {
        setError(payload?.error || 'Could not start account linking.');
        return;
      }
      window.location.assign(payload.url);
    } catch {
      setError('Could not start account linking.');
    } finally {
      setBusyProvider(null);
    }
  }

  async function disconnect(identity: ConnectedIdentity) {
    setBusyProvider(identity.provider);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/account/identities', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityId: identity.id }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!response.ok || !payload?.ok) {
        setError(payload?.error || `Could not disconnect ${identity.label}.`);
        return;
      }
      setConfirmDisconnect(null);
      setMessage(`${identity.label} has been disconnected.`);
      await load();
    } catch {
      setError(`Could not disconnect ${identity.label}.`);
    } finally {
      setBusyProvider(null);
    }
  }

  const methodCount = identities.length + (passwordEnabled ? 1 : 0);

  return (
    <section id="connected-accounts" className="scroll-mt-24">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="relative overflow-hidden border-b border-slate-200 bg-[linear-gradient(135deg,#f8fbff_0%,#f4f7fb_52%,#fffaf3_100%)] px-5 py-6 dark:border-slate-800 dark:bg-[linear-gradient(135deg,#0f172a_0%,#111827_55%,#172033_100%)] sm:px-7 sm:py-7">
          <div className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-blue-200/30 blur-3xl dark:bg-blue-500/10" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 size-52 rounded-full bg-amber-200/25 blur-3xl dark:bg-amber-400/5" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/80 px-3 py-1 text-xs font-semibold text-blue-800 shadow-sm backdrop-blur dark:border-blue-800/70 dark:bg-blue-950/40 dark:text-blue-200">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                Account &amp; sign-in
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-tight text-[color:var(--dp-navy)] dark:text-white sm:text-2xl">
                One DP Resources account. Your choice of sign-in.
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Link trusted providers to the same account so you can sign in the way that suits you without splitting your saved resources, activity or preferences.
              </p>
            </div>

            <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/80 bg-white/85 p-3 shadow-sm backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/80 sm:min-w-[19rem]">
              <div className="size-12 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-blue-50 shadow-sm dark:border-slate-700 dark:bg-blue-950">
                {profile?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatarUrl} alt="Your profile" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center text-sm font-bold text-blue-800 dark:text-blue-200">
                    {initials(profile?.displayName || '', profile?.username || '')}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">
                  {profile?.displayName || 'Your DP Resources account'}
                </p>
                {profile?.username ? (
                  <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">@{profile.username}</p>
                ) : null}
                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                  {profile?.email || (loading ? 'Loading account…' : 'Account email')}
                </p>
              </div>
              <div className="shrink-0 rounded-xl bg-slate-950 px-2.5 py-2 text-center text-white dark:bg-white dark:text-slate-950">
                <span className="block text-base font-bold leading-none">{loading ? '—' : methodCount}</span>
                <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.12em] opacity-70">methods</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-7">
          {message ? (
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              {message}
            </div>
          ) : null}
          {error ? (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </div>
          ) : null}

          <div className="flex items-end justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-950 dark:text-white">Sign-in methods</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Connected providers open this same DP Resources account.
              </p>
            </div>
            {!loading ? (
              <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-900 dark:text-slate-300 sm:inline-flex">
                {methodCount} {methodCount === 1 ? 'method' : 'methods'} available
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="group rounded-2xl border border-slate-200 bg-slate-50/60 p-4 transition hover:border-slate-300 hover:bg-white hover:shadow-sm dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-slate-700 dark:hover:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[color:var(--dp-navy)] text-white shadow-sm ring-1 ring-black/5 dark:bg-white dark:text-slate-950">
                    <KeyRound className="size-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950 dark:text-white">DP Resources password</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Username or email + password</p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${passwordEnabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                  {loading ? 'Checking…' : passwordEnabled ? 'Enabled' : 'Not set'}
                </span>
              </div>
              <p className="mt-4 text-sm leading-5 text-slate-600 dark:text-slate-300">
                {passwordEnabled ? 'Your original password sign-in stays available as a reliable backup.' : 'This account currently relies on connected providers.'}
              </p>
            </div>

            {SOCIAL_AUTH_PROVIDER_KEYS.map((providerKey) => {
              const provider = SOCIAL_AUTH_PROVIDERS[providerKey];
              const status = providerStatuses.find((item) => item.key === providerKey);
              const identity = identities.find((item) => item.provider === providerKey);
              const busy = busyProvider === providerKey;
              const available = status?.available === true;
              const date = connectedDate(identity?.createdAt || null);

              return (
                <div
                  key={providerKey}
                  className={`group rounded-2xl border p-4 transition ${identity ? 'border-emerald-200 bg-emerald-50/30 hover:border-emerald-300 hover:bg-white dark:border-emerald-900/70 dark:bg-emerald-950/10 dark:hover:bg-slate-900' : 'border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-white hover:shadow-sm dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-slate-700 dark:hover:bg-slate-900'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ${providerSurface(providerKey)}`}>
                        <ProviderLogo provider={providerKey} className="size-6" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-950 dark:text-white">{provider.label}</p>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                          {identity?.email || (providerKey === 'apple' ? 'Sign in with Apple' : `Continue with ${provider.label}`)}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${identity ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : available ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                      {loading ? 'Checking…' : identity ? 'Connected' : available ? 'Available' : providerKey === 'apple' ? 'Later' : 'Setup pending'}
                    </span>
                  </div>

                  <div className="mt-4 flex min-h-9 items-end justify-between gap-3">
                    <div className="min-w-0 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {identity ? (
                        <span className="inline-flex items-center gap-1.5">
                          <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                          {date ? `Connected ${date}` : 'Verified provider identity'}
                        </span>
                      ) : providerKey === 'apple' ? (
                        'Planned for later.'
                      ) : available ? (
                        'Link this provider without creating a second profile.'
                      ) : (
                        'Provider credentials have not been configured yet.'
                      )}
                    </div>

                    {!loading && identity ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDisconnect(identity)}
                        disabled={busy}
                        className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
                      >
                        Disconnect
                      </button>
                    ) : !loading && available ? (
                      <button
                        type="button"
                        onClick={() => void connect(providerKey)}
                        disabled={busy}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[color:var(--dp-navy)] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow disabled:translate-y-0 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
                        {busy ? 'Connecting…' : 'Connect'}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-7 grid gap-3 lg:grid-cols-[1.3fr_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white dark:border-slate-800">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                  <ShieldCheck className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-semibold">Sign-in security</h3>
                  <p className="mt-1 text-sm leading-5 text-slate-300">
                    DP Resources protects you from accidentally disconnecting the last usable way into your account.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-white/7 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Password</p>
                  <p className="mt-1 text-sm font-semibold">{passwordEnabled ? 'Enabled' : 'Not set'}</p>
                </div>
                <div className="rounded-xl bg-white/7 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">MFA</p>
                  <p className="mt-1 text-sm font-semibold">Coming next</p>
                </div>
                <div className="rounded-xl bg-white/7 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Sessions</p>
                  <p className="mt-1 text-sm font-semibold">Coming next</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-900/40">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Future integration</p>
                  <h3 className="mt-1 font-semibold text-slate-950 dark:text-white">ManageBac / Faria</h3>
                </div>
                <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Later</span>
              </div>
              <p className="mt-3 text-sm leading-5 text-slate-500 dark:text-slate-400">
                School-account SSO can slot into this same account centre when partner access is available.
              </p>
            </div>
          </div>
        </div>
      </div>

      {confirmDisconnect ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busyProvider) setConfirmDisconnect(null);
        }}>
          <div role="dialog" aria-modal="true" aria-labelledby="disconnect-provider-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ${providerSurface(confirmDisconnect.provider)}`}>
                  <ProviderLogo provider={confirmDisconnect.provider} className="size-6" />
                </div>
                <div>
                  <h3 id="disconnect-provider-title" className="font-semibold text-slate-950 dark:text-white">
                    Disconnect {confirmDisconnect.label}?
                  </h3>
                  <p className="mt-0.5 max-w-[18rem] truncate text-xs text-slate-500 dark:text-slate-400">
                    {confirmDisconnect.email || 'Connected provider'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setConfirmDisconnect(null)} disabled={Boolean(busyProvider)} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-900 dark:hover:text-slate-200" aria-label="Close disconnect confirmation">
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                You will no longer be able to use {confirmDisconnect.label} to sign in until you connect it again. Your DP Resources account and data will not be deleted.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setConfirmDisconnect(null)} disabled={Boolean(busyProvider)} className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">
                  Keep connected
                </button>
                <button type="button" onClick={() => void disconnect(confirmDisconnect)} disabled={Boolean(busyProvider)} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">
                  {busyProvider ? <Loader2 className="size-4 animate-spin" /> : <Unlink2 className="size-4" />}
                  {busyProvider ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
