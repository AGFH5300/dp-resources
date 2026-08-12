'use client';

import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/auth-shell';
import { safeInternalReturnPath } from '@/lib/auth-redirect';
import {
  SUSPENDED_USER_ID_STORAGE_KEY,
  SUSPENSION_REASON_STORAGE_KEY,
} from '@/components/suspension-storage';

const SIGNUP_DRAFT_KEY = 'dp_resource_signup_profile';
const DEFAULT_NEXT_PATH = '/library';
const SUSPENDED_MESSAGE =
  'This account has been suspended. Contact the site administrator if you believe this is a mistake.';

type LoginResponse = {
  ok?: boolean;
  message?: string;
  suspended?: boolean;
  userId?: string | null;
  suspensionReason?: string | null;
};

function readNextPath() {
  if (typeof window === 'undefined') return DEFAULT_NEXT_PATH;
  return safeInternalReturnPath(
    new URLSearchParams(window.location.search).get('next'),
    DEFAULT_NEXT_PATH,
  );
}

function storeSuspensionDetails(details: LoginResponse) {
  if (details.suspensionReason) {
    window.sessionStorage.setItem(
      SUSPENSION_REASON_STORAGE_KEY,
      details.suspensionReason,
    );
  } else {
    window.sessionStorage.removeItem(SUSPENSION_REASON_STORAGE_KEY);
  }

  if (details.userId) {
    window.sessionStorage.setItem(
      SUSPENDED_USER_ID_STORAGE_KEY,
      details.userId,
    );
  } else {
    window.sessionStorage.removeItem(SUSPENDED_USER_ID_STORAGE_KEY);
  }
}

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const capsLockActiveRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPath] = useState(readNextPath);
  const router = useRouter();

  useEffect(() => {
    window.sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
  }, []);

  useEffect(() => {
    const isSuspendedError =
      new URLSearchParams(window.location.search).get('error') ===
      'account_suspended';
    if (!isSuspendedError) return;
    setError(SUSPENDED_MESSAGE);
    void fetch('/api/auth/signout', { method: 'POST' }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const rememberCapsLockState = (event: KeyboardEvent) => {
      const active = event.getModifierState('CapsLock');
      capsLockActiveRef.current = active;
      if (document.activeElement === passwordInputRef.current) {
        setCapsLockOn(active);
      }
    };

    window.addEventListener('keydown', rememberCapsLockState, true);
    window.addEventListener('keyup', rememberCapsLockState, true);
    return () => {
      window.removeEventListener('keydown', rememberCapsLockState, true);
      window.removeEventListener('keyup', rememberCapsLockState, true);
    };
  }, []);

  function updateCapsLockState(
    event:
      | React.KeyboardEvent<HTMLInputElement>
      | React.PointerEvent<HTMLInputElement>,
  ) {
    const active = event.getModifierState('CapsLock');
    capsLockActiveRef.current = active;
    setCapsLockOn(active);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const result = (await response
        .json()
        .catch(() => null)) as LoginResponse | null;

      if (result?.suspended) {
        storeSuspensionDetails(result);
        router.replace('/account-suspended');
        return;
      }

      if (!response.ok || result?.ok !== true) {
        setError(result?.message || 'Unable to log in. Please try again.');
        setLoading(false);
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setError('Unable to log in. Please try again.');
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Sign in"
      title="Pick up exactly where you left off."
      description="Open recent folders, files and resources."
      quote="We do not learn from experience... we learn from reflecting on experience."
      attribution="John Dewey"
    >
      <h1 className="font-headline text-4xl text-[#00152a]">Log in</h1>
      <p className="mt-3 font-body text-[#43474d]">
        Access your DP Resources library.
      </p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <div>
          <label
            htmlFor="login-identifier"
            className="font-label text-xs uppercase tracking-[.05em] text-[#43474d]"
          >
            Username / email
          </label>
          <input
            id="login-identifier"
            className="tsm-input"
            type="text"
            autoComplete="username"
            spellCheck={false}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <div>
          <div className="flex items-center justify-between gap-4">
            <label
              htmlFor="login-password"
              className="font-label text-xs uppercase tracking-[.05em] text-[#43474d]"
            >
              Password
            </label>
            <Link
              href="/auth/forgot-password"
              className="text-sm font-semibold text-[#00152a] hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              ref={passwordInputRef}
              id="login-password"
              className="tsm-input dp-login-password-input"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={updateCapsLockState}
              onKeyUp={updateCapsLockState}
              onPointerDown={updateCapsLockState}
              onFocus={() => setCapsLockOn(capsLockActiveRef.current)}
              onBlur={() => setCapsLockOn(false)}
              aria-describedby={capsLockOn ? 'login-caps-lock-warning' : undefined}
              required
              disabled={loading}
            />
            {capsLockOn && (
              <span
                className="absolute right-8 top-1/2 -translate-y-1/2 select-none text-lg leading-none text-amber-700"
                title="Caps Lock is on"
                aria-hidden="true"
              >
                ⇪
              </span>
            )}
            <button
              type="button"
              className="absolute right-0 top-1/2 -translate-y-1/2 text-[#43474d] hover:text-[#00152a] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => setShowPassword((previous) => !previous)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              disabled={loading}
            >
              {showPassword ? (
                <EyeOff className="size-5" />
              ) : (
                <Eye className="size-5" />
              )}
            </button>
          </div>
          {capsLockOn && (
            <p
              id="login-caps-lock-warning"
              className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700"
              role="status"
              aria-live="polite"
            >
              <span aria-hidden="true" className="text-sm leading-none">
                ⇪
              </span>
              Caps Lock is on
            </p>
          )}
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          className="dp-auth-primary flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm bg-[#00152a] py-4 text-white transition-colors hover:bg-[#08284a] focus:outline-none focus:ring-2 focus:ring-[#00152a]/30 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={loading || !identifier || !password}
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Logging in...
            </>
          ) : (
            'Log in'
          )}
        </button>
      </form>
      <p className="mt-8 border-t border-[#c3c6ce55] pt-6 text-center font-body text-[#43474d]">
        Don&apos;t have an account?
        <Link
          href={`/auth/sign-up${nextPath !== DEFAULT_NEXT_PATH ? `?next=${encodeURIComponent(nextPath)}` : ''}`}
          className="ml-1 font-semibold text-[#00152a]"
        >
          Sign Up
        </Link>
      </p>
    </AuthShell>
  );
}
