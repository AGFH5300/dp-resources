'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { safeInternalReturnPath } from '@/lib/auth-redirect';
import {
  SOCIAL_AUTH_PROVIDER_KEYS,
  SOCIAL_AUTH_PROVIDERS,
  type SocialAuthMode,
  type SocialAuthProviderKey,
} from '@/lib/social-auth';

function ProviderIcon({ provider }: { provider: SocialAuthProviderKey }) {
  if (provider === 'google') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0">
        <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.24-.2-1.8H12v3.41h5.52a4.72 4.72 0 0 1-2.05 3.1l-.02.11 2.98 2.31.2.02c1.82-1.68 2.97-4.16 2.97-7.15Z" />
        <path fill="#34A853" d="M12 22c2.68 0 4.93-.88 6.57-2.4l-3.13-2.43c-.84.57-1.97.97-3.44.97a5.97 5.97 0 0 1-5.65-4.13l-.1.01-3.1 2.4-.03.1A9.92 9.92 0 0 0 12 22Z" />
        <path fill="#FBBC05" d="M6.35 14.01A6.1 6.1 0 0 1 6.02 12c0-.7.12-1.38.32-2.01v-.12L3.2 7.43l-.1.05A10 10 0 0 0 2 12c0 1.62.39 3.15 1.1 4.52l3.25-2.51Z" />
        <path fill="#EA4335" d="M12 5.86c1.87 0 3.13.81 3.85 1.48l2.78-2.71C16.92 3.04 14.68 2 12 2a9.92 9.92 0 0 0-8.88 5.48l3.23 2.51A5.98 5.98 0 0 1 12 5.86Z" />
      </svg>
    );
  }

  if (provider === 'microsoft') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0">
        <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
        <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
        <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
        <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0 fill-current">
      <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.29-5.27-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18A10.98 10.98 0 0 1 12 6.1c.98 0 1.96.13 2.87.39 2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.71 5.39-5.29 5.68.42.36.79 1.06.79 2.14v3.27c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
    </svg>
  );
}

function socialErrorMessage(error: string, label: string) {
  if (error === 'not_configured') return `${label} sign-in is not available yet.`;
  if (error === 'account_suspended') return 'This DP Resources account is suspended.';
  if (error === 'cancelled') return `${label} sign-in was cancelled.`;
  return `${label} sign-in could not be completed. Please try again.`;
}

export function SocialAuthButtons({ mode }: { mode: SocialAuthMode }) {
  const [nextPath, setNextPath] = useState('/library');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noAccountProvider, setNoAccountProvider] = useState<SocialAuthProviderKey | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextPath(safeInternalReturnPath(params.get('next'), '/library'));
    const socialError = params.get('social_error');
    const providerKey = params.get('social_provider') as SocialAuthProviderKey | null;
    if (!socialError) return;

    if (
      socialError === 'no_account' &&
      providerKey &&
      SOCIAL_AUTH_PROVIDERS[providerKey]
    ) {
      setNoAccountProvider(providerKey);
      return;
    }

    const label =
      providerKey && SOCIAL_AUTH_PROVIDERS[providerKey]
        ? SOCIAL_AUTH_PROVIDERS[providerKey].label
        : 'That provider';
    setErrorMessage(socialErrorMessage(socialError, label));
  }, []);

  function dismissNoAccount() {
    setNoAccountProvider(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('social_error');
    url.searchParams.delete('social_provider');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <div className="mb-7">
      {errorMessage ? (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-2.5">
        {SOCIAL_AUTH_PROVIDER_KEYS.map((key) => {
          const provider = SOCIAL_AUTH_PROVIDERS[key];
          const query = new URLSearchParams({ mode, next: nextPath });
          return (
            <a
              key={key}
              href={`/api/auth/social/${key}/start?${query.toString()}`}
              className="flex h-11 w-full items-center justify-center gap-3 rounded-md border-2 border-[#aeb5bf] bg-transparent px-4 text-sm font-semibold text-[#1b1c19] transition hover:border-[#52657a] hover:bg-[#00152a]/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00152a]/15 dark:border-slate-600 dark:text-slate-100 dark:hover:border-slate-400 dark:hover:bg-slate-800/70"
            >
              <ProviderIcon provider={key} />
              {mode === 'signup' ? 'Sign up' : 'Continue'} with {provider.label}
            </a>
          );
        })}
      </div>

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-[#d9d9d4] dark:bg-slate-700" />
        <span className="font-label text-[11px] uppercase tracking-[0.14em] text-[#777b82] dark:text-slate-400">
          or continue with email
        </span>
        <span className="h-px flex-1 bg-[#d9d9d4] dark:bg-slate-700" />
      </div>

      {noAccountProvider ? (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) dismissNoAccount();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="social-no-account-title"
            className="w-full max-w-md rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-950"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white">
                  <ProviderIcon provider={noAccountProvider} />
                </div>
                <div>
                  <h2 id="social-no-account-title" className="text-lg font-semibold text-slate-950 dark:text-white">
                    No DP Resources account found
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    This {SOCIAL_AUTH_PROVIDERS[noAccountProvider].label} account is not linked to DP Resources yet. Would you like to create an account with it?
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={dismissNoAccount}
                className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-200"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={dismissNoAccount}
                className="h-10 rounded-md border-2 border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                Not now
              </button>
              <a
                href="/auth/finish-profile"
                className="flex h-10 items-center justify-center rounded-md bg-[color:var(--dp-navy)] px-4 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Create account
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
