'use client';

import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { Spinner } from '@/components/ui/spinner';
import type { SocialAuthProviderKey } from '@/lib/social-auth';

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;
const USERNAME_EDGE_UNDERSCORE_PATTERN = /^_|_$/;
const USERNAME_REPEATED_UNDERSCORE_PATTERN = /__/;
const VALIDATION_DEBOUNCE_MS = 600;

type AvailabilityState =
  | { status: 'idle'; message: string }
  | { status: 'typing'; message: string }
  | { status: 'checking'; message: string }
  | { status: 'available'; message: string }
  | { status: 'unavailable'; message: string }
  | { status: 'error'; message: string };

function suggestedUsername(email: string) {
  const base = (email.split('@')[0] || '')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, 24);
  return base.length >= 3 ? base : '';
}

function usernameStatusClass(status: AvailabilityState['status']) {
  if (status === 'available') return 'border-b-[#0c7a43]';
  if (status === 'unavailable' || status === 'error') return 'border-b-red-600';
  return '';
}

export function FinishSocialProfileForm({
  email,
  initialFullName,
  nextPath,
  providerKey,
  providerLabel,
}: {
  email: string;
  initialFullName: string;
  nextPath: string;
  providerKey: SocialAuthProviderKey;
  providerLabel: string;
}) {
  const initialUsername = useMemo(() => suggestedUsername(email), [email]);
  const [username, setUsername] = useState(initialUsername);
  const [fullName, setFullName] = useState(initialFullName);
  const [fullNameTouched, setFullNameTouched] = useState(false);
  const [availability, setAvailability] = useState<AvailabilityState>({
    status: initialUsername ? 'typing' : 'idle',
    message: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const value = username.trim();
    if (!value) {
      setAvailability({ status: 'idle', message: '' });
      return;
    }
    if (
      !USERNAME_PATTERN.test(value) ||
      USERNAME_EDGE_UNDERSCORE_PATTERN.test(value) ||
      USERNAME_REPEATED_UNDERSCORE_PATTERN.test(value)
    ) {
      setAvailability({
        status: 'unavailable',
        message: 'Use 3-24 characters: letters, numbers, or underscore.',
      });
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setAvailability({ status: 'checking', message: '' });
      try {
        const query = new URLSearchParams({ type: 'username', value });
        const response = await fetch(`/api/auth/availability?${query.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | { available?: boolean; status?: string; message?: string; reason?: string }
          | null;
        if (!response.ok || !payload) {
          setAvailability({
            status: 'error',
            message: payload?.message || payload?.reason || 'Could not validate username right now.',
          });
          return;
        }
        setAvailability(
          payload.available
            ? { status: 'available', message: 'Username is available.' }
            : {
                status: 'unavailable',
                message:
                  payload.message || payload.reason || 'That username is already taken.',
              },
        );
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setAvailability({
          status: 'error',
          message: 'Could not validate username right now.',
        });
      }
    }, VALIDATION_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [username]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFullNameTouched(true);
    if (saving || availability.status !== 'available' || !fullName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/social/finish-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), fullName: fullName.trim() }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; field?: string }
        | null;
      if (!response.ok || !payload?.ok) {
        const message = payload?.error || 'Could not finish creating your profile.';
        setError(message);
        if (payload?.field === 'username') {
          setAvailability({ status: 'unavailable', message });
        }
        return;
      }
      window.location.assign(nextPath);
    } catch {
      setError('Could not finish creating your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const showFullNameError = fullNameTouched && !fullName.trim();
  const usernameHasError =
    availability.status === 'unavailable' || availability.status === 'error';
  const microsoftAddress = providerKey === 'microsoft';

  return (
    <>
      <h1 className="font-headline text-4xl text-[#00152a] dark:text-white">Create account</h1>
      <p className="mt-3 font-body text-[#43474d] dark:text-slate-300">
        {providerLabel} has verified your identity. Complete your DP Resources account details below.
      </p>

      <form
        className="mt-8 space-y-6"
        onSubmit={submit}
        noValidate
        autoComplete="off"
      >
        <div>
          <label
            htmlFor="social-signup-username"
            className="font-label text-xs uppercase tracking-widest text-[#43474d] dark:text-slate-300"
          >
            Username
          </label>
          <div className="relative">
            <input
              id="social-signup-username"
              className={`tsm-input pr-10 ${usernameStatusClass(availability.status)}`}
              type="text"
              name="social_signup_username"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setAvailability({ status: 'typing', message: '' });
              }}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={24}
              required
              disabled={saving}
            />
            <div className="pointer-events-none absolute right-2 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center">
              {availability.status === 'checking' ? (
                <Spinner className="size-4 text-[#00152a] dark:text-white" />
              ) : availability.status === 'available' ? (
                <CheckCircle2 className="size-4 text-[#0c7a43] dark:text-emerald-400" />
              ) : usernameHasError ? (
                <AlertCircle className="size-4 text-red-600 dark:text-red-400" />
              ) : null}
            </div>
          </div>
          {availability.status === 'available' ? (
            <p className="mt-2 text-sm text-[#0c7a43] dark:text-emerald-300">
              Username is available.
            </p>
          ) : usernameHasError ? (
            <p className="mt-2 text-sm text-red-700 dark:text-red-300">
              {availability.message}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="social-signup-full-name"
            className="font-label text-xs uppercase tracking-widest text-[#43474d] dark:text-slate-300"
          >
            Full name
          </label>
          <input
            id="social-signup-full-name"
            className={`tsm-input ${showFullNameError ? 'border-b-red-600' : fullName.trim() ? 'border-b-[#0c7a43]' : ''}`}
            type="text"
            name="social_signup_full_name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            onBlur={() => setFullNameTouched(true)}
            autoComplete="off"
            maxLength={120}
            required
            disabled={saving}
          />
          {showFullNameError ? (
            <p className="mt-2 text-sm text-red-700 dark:text-red-300">Enter your full name.</p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="social-signup-email"
            className="font-label text-xs uppercase tracking-widest text-[#43474d] dark:text-slate-300"
          >
            Email
          </label>
          <div className="relative">
            <input
              id="social-signup-email"
              className="tsm-input pr-10 text-[#43474d] dark:text-slate-200"
              type="email"
              name="social_signup_email"
              value={email}
              readOnly
              aria-readonly="true"
              tabIndex={-1}
            />
            {!microsoftAddress ? (
              <div className="pointer-events-none absolute right-2 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center">
                <CheckCircle2 className="size-4 text-[#0c7a43] dark:text-emerald-400" />
              </div>
            ) : null}
          </div>
          <p
            className={`mt-2 text-sm ${microsoftAddress ? 'text-[#5f6368] dark:text-slate-400' : 'text-[#0c7a43] dark:text-emerald-300'}`}
          >
            {microsoftAddress
              ? 'Provided by Microsoft sign-in.'
              : `Verified by ${providerLabel}.`}
          </p>
        </div>

        {error ? (
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        ) : null}

        <button
          type="submit"
          className="dp-auth-primary flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm bg-[#00152a] py-4 text-white transition-colors hover:bg-[#08284a] focus:outline-none focus:ring-2 focus:ring-[#00152a]/30 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={saving || availability.status !== 'available' || !fullName.trim()}
        >
          {saving ? (
            <>
              <Spinner className="size-4" />
              <span>Creating your account...</span>
            </>
          ) : (
            'Create account'
          )}
        </button>
      </form>
    </>
  );
}
