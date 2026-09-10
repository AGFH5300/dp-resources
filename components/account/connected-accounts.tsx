'use client';

import { CheckCircle2, KeyRound, Link2, Loader2, ShieldCheck, Unlink2 } from 'lucide-react';
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

export function ConnectedAccounts() {
  const [identities, setIdentities] = useState<ConnectedIdentity[]>([]);
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState<SocialAuthProviderKey | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] =
    useState<SocialAuthProviderKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch('/api/account/identities', { cache: 'no-store' });
      const payload = (await response.json().catch(() => null)) as IdentityPayload | null;
      if (!response.ok || !payload) {
        setError(payload?.error || 'Could not load connected accounts.');
        return;
      }
      setIdentities(payload.identities || []);
      setProviderStatuses(payload.providers || []);
      setPasswordEnabled(payload.passwordEnabled === true);
      setError(null);
    } catch {
      setError('Could not load connected accounts.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const params = new URLSearchParams(window.location.search);
    const linked = params.get('linked') as SocialAuthProviderKey | null;
    if (linked && SOCIAL_AUTH_PROVIDERS[linked]) {
      setMessage(`${SOCIAL_AUTH_PROVIDERS[linked].label} is now connected.`);
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

  return (
    <section
      id="connected-accounts"
      className="mt-6 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-blue-50 p-2 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
          <Link2 className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--dp-navy)] dark:text-slate-100">
            Connected accounts
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Google, Microsoft and GitHub can sign in to the same DP Resources account.
            Matching verified emails are kept together instead of creating duplicate profiles.
          </p>
        </div>
      </div>

      {message ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mt-5 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
        <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-4 dark:bg-slate-950/40">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-100">
              <KeyRound className="size-4" aria-hidden="true" /> DP Resources password
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {passwordEnabled ? 'Available as a backup sign-in method.' : 'Not set for this account.'}
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${passwordEnabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
            {passwordEnabled ? 'Enabled' : 'Not set'}
          </span>
        </div>

        {SOCIAL_AUTH_PROVIDER_KEYS.map((providerKey) => {
          const provider = SOCIAL_AUTH_PROVIDERS[providerKey];
          const status = providerStatuses.find((item) => item.key === providerKey);
          const identity = identities.find((item) => item.provider === providerKey);
          const busy = busyProvider === providerKey;
          const confirming = confirmDisconnect === providerKey;
          const available = status?.available === true;

          return (
            <div
              key={providerKey}
              className="flex flex-col gap-3 bg-white px-4 py-4 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {provider.label}
                  </span>
                  {identity ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                      <ShieldCheck className="size-3" aria-hidden="true" /> Connected
                    </span>
                  ) : available ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      Not connected
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {providerKey === 'apple' ? 'Later' : 'Setup pending'}
                    </span>
                  )}
                </div>
                {identity?.email ? (
                  <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                    {identity.email}
                  </p>
                ) : providerKey === 'apple' ? (
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Planned for later because Apple web sign-in requires Apple Developer setup.
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {loading ? (
                  <Loader2 className="size-4 animate-spin text-slate-400" />
                ) : identity ? (
                  confirming ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirmDisconnect(null)}
                        disabled={busy}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void disconnect(identity)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                      >
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Unlink2 className="size-3.5" />}
                        Confirm disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDisconnect(providerKey)}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Disconnect
                    </button>
                  )
                ) : available ? (
                  <button
                    type="button"
                    onClick={() => void connect(providerKey)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--dp-navy)] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
                    Connect
                  </button>
                ) : (
                  <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                    {providerKey === 'apple' ? 'Later' : 'Not configured'}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-4 dark:bg-slate-950/40">
          <div>
            <div className="font-medium text-slate-700 dark:text-slate-200">
              ManageBac / Faria
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Planned for a later SSO integration.
            </p>
          </div>
          <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Later
          </span>
        </div>
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
        DP Resources will not let a social-only account disconnect its last remaining sign-in method.
      </p>
    </section>
  );
}
