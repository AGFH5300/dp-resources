'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { AuthShell } from '@/components/auth-shell';
import { PasswordStrengthMeter } from '@/components/password-strength-meter';
import { Spinner } from '@/components/ui/spinner';
import { safeInternalReturnPath } from '@/lib/auth-redirect';

const SIGNUP_DRAFT_KEY = 'dp_resource_signup_profile';
const INPUT_SETTLE_DELAY_MS = 600;
const MEANINGFUL_MATCH_LENGTH = 3;
const DEFAULT_NEXT_PATH = '/library';

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [passwordSettled, setPasswordSettled] = useState(false);
  const [confirmSettled, setConfirmSettled] = useState(false);
  const nextPathRef = useRef(DEFAULT_NEXT_PATH);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      nextPathRef.current = safeInternalReturnPath(
        new URLSearchParams(window.location.search).get('next'),
        DEFAULT_NEXT_PATH,
      );
    }
  }, []);

  useEffect(() => {
    setPasswordSettled(false);
    if (!password) return;
    const timer = window.setTimeout(
      () => setPasswordSettled(true),
      INPUT_SETTLE_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [password]);

  useEffect(() => {
    setConfirmSettled(false);
    if (!confirmPassword) return;
    const timer = window.setTimeout(
      () => setConfirmSettled(true),
      INPUT_SETTLE_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [confirmPassword]);

  const showPasswordValidation = submitAttempted || passwordSettled;
  const showConfirmValidation =
    submitAttempted || passwordSettled || confirmSettled;
  const canCheckMismatch =
    password.length >= MEANINGFUL_MATCH_LENGTH &&
    confirmPassword.length >= MEANINGFUL_MATCH_LENGTH;

  const passwordError = useMemo(() => {
    if (!showPasswordValidation || !password) return null;
    if (password.length < 8) return 'Use at least 8 characters.';
    return null;
  }, [password, showPasswordValidation]);

  const confirmError = useMemo(() => {
    if (!showConfirmValidation || !canCheckMismatch) return null;
    if (password !== confirmPassword) return 'Passwords do not match.';
    return null;
  }, [canCheckMismatch, password, confirmPassword, showConfirmValidation]);

  const showConfirmSuccess =
    showConfirmValidation && canCheckMismatch && password === confirmPassword;

  const canSubmit =
    password.length >= 8 &&
    confirmPassword.length >= 8 &&
    password === confirmPassword &&
    !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitAttempted(true);
    setPasswordSettled(true);
    setConfirmSettled(true);

    if (!canSubmit) {
      return;
    }

    setLoading(true);
    const response = await fetch('/api/auth/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'set_signup_password',
        password,
      }),
    });
    const result = await response.json().catch(() => null) as {
      message?: string;
    } | null;

    if (!response.ok) {
      setError(
        result?.message || 'Could not finish account setup. Please try again.',
      );
      setLoading(false);
      return;
    }

    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
    }

    router.push(nextPathRef.current);
  }

  return (
    <AuthShell
      eyebrow="Set password"
      title="Create your password and finish account setup."
      description="After this step, you are logged in automatically and taken to the library."
    >
      <h1 className="font-headline text-4xl text-[#00152a]">
        Set your password
      </h1>
      <p className="mt-3 font-body text-[#43474d]">
        Create a password to finish signup. You will be logged in automatically.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6" noValidate>
        <div>
          <label
            htmlFor="set-password"
            className="font-label text-xs uppercase tracking-widest text-[#43474d]"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="set-password"
              className="tsm-input pr-10"
              type={showPassword ? 'text' : 'password'}
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setPasswordSettled(true)}
              required
              autoComplete="new-password"
              disabled={loading}
            />
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
          {passwordError && (
            <p className="mt-2 text-sm text-red-700">{passwordError}</p>
          )}

          <PasswordStrengthMeter password={password} />
        </div>

        <div>
          <label
            htmlFor="set-password-confirm"
            className="font-label text-xs uppercase tracking-widest text-[#43474d]"
          >
            Confirm password
          </label>
          <div className="relative">
            <input
              id="set-password-confirm"
              className="tsm-input pr-10"
              type={showConfirmPassword ? 'text' : 'password'}
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={() => setConfirmSettled(true)}
              required
              autoComplete="new-password"
              disabled={loading}
            />
            <button
              type="button"
              className="absolute right-0 top-1/2 -translate-y-1/2 text-[#43474d] hover:text-[#00152a] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => setShowConfirmPassword((previous) => !previous)}
              aria-label={
                showConfirmPassword
                  ? 'Hide confirm password'
                  : 'Show confirm password'
              }
              disabled={loading}
            >
              {showConfirmPassword ? (
                <EyeOff className="size-5" />
              ) : (
                <Eye className="size-5" />
              )}
            </button>
          </div>
          {confirmError && (
            <p className="mt-2 text-sm text-red-700">{confirmError}</p>
          )}
          {showConfirmSuccess && (
            <p className="mt-2 text-sm text-[#0c7a43]">Passwords match.</p>
          )}
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <button
          className="dp-auth-primary flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm bg-[#00152a] py-4 text-white transition-colors hover:bg-[#08284a] focus:outline-none focus:ring-2 focus:ring-[#00152a]/30 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={!canSubmit}
          type="submit"
        >
          {loading ? (
            <>
              <Spinner className="size-4" />
              <span>Saving password...</span>
            </>
          ) : (
            'Set password and continue'
          )}
        </button>
      </form>
    </AuthShell>
  );
}
