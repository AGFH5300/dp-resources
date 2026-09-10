'use client';

import { Check, Loader2, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;

type AvailabilityState =
  | { status: 'idle'; message: string }
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

export function FinishSocialProfileForm({
  email,
  initialFullName,
  nextPath,
  providerLabel,
}: {
  email: string;
  initialFullName: string;
  nextPath: string;
  providerLabel: string;
}) {
  const initialUsername = useMemo(() => suggestedUsername(email), [email]);
  const [username, setUsername] = useState(initialUsername);
  const [fullName, setFullName] = useState(initialFullName);
  const [availability, setAvailability] = useState<AvailabilityState>({
    status: 'idle',
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
    if (!USERNAME_PATTERN.test(value)) {
      setAvailability({
        status: 'unavailable',
        message: 'Use 3-24 letters, numbers, or underscores.',
      });
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setAvailability({ status: 'checking', message: 'Checking availability…' });
      try {
        const query = new URLSearchParams({ type: 'username', value });
        const response = await fetch(`/api/auth/availability?${query.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | { available?: boolean; message?: string; reason?: string }
          | null;
        if (!response.ok || !payload) {
          setAvailability({
            status: 'error',
            message: 'Could not check this username right now.',
          });
          return;
        }
        setAvailability(
          payload.available
            ? { status: 'available', message: 'Username is available.' }
            : {
                status: 'unavailable',
                message:
                  payload.message || payload.reason || 'Choose another username.',
              },
        );
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setAvailability({
          status: 'error',
          message: 'Could not check this username right now.',
        });
      }
    }, 600);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [username]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || availability.status !== 'available') return;
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

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div>
        <h1 className="font-headline text-3xl text-[#00152a]">Finish your profile</h1>
        <p className="mt-2 font-body text-sm leading-6 text-[#5f6368]">
          {providerLabel} verified <span className="font-medium text-[#1b1c19]">{email}</span>.
          Choose the DP Resources name people will see.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[#303238]">Full name</span>
        <input
          type="text"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          autoComplete="name"
          maxLength={120}
          required
          className="h-11 w-full rounded-md border border-[#c3c6ce] bg-white px-3 text-sm outline-none transition focus:border-[#00152a] focus:ring-2 focus:ring-[#00152a]/10"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[#303238]">Username</span>
        <div className="relative">
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={24}
            required
            className="h-11 w-full rounded-md border border-[#c3c6ce] bg-white px-3 pr-10 text-sm outline-none transition focus:border-[#00152a] focus:ring-2 focus:ring-[#00152a]/10"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            {availability.status === 'checking' ? (
              <Loader2 className="size-4 animate-spin text-slate-400" />
            ) : availability.status === 'available' ? (
              <Check className="size-4 text-emerald-600" />
            ) : availability.status === 'unavailable' ? (
              <X className="size-4 text-red-500" />
            ) : null}
          </span>
        </div>
        {availability.message ? (
          <p
            className={`mt-1.5 text-xs ${
              availability.status === 'available'
                ? 'text-emerald-700'
                : availability.status === 'checking'
                  ? 'text-slate-500'
                  : 'text-red-600'
            }`}
          >
            {availability.message}
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-slate-500">
            3-24 characters: letters, numbers, or underscore.
          </p>
        )}
      </label>

      <button
        type="submit"
        disabled={saving || availability.status !== 'available' || !fullName.trim()}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#00152a] px-4 text-sm font-semibold text-white transition hover:bg-[#102d4b] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : null}
        {saving ? 'Creating profile…' : 'Continue to DP Resources'}
      </button>
    </form>
  );
}
