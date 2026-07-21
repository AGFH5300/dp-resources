'use client';

import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { createClient } from '@/lib/supabase/client';

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [validSession, setValidSession] = useState(false);
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    supabase.auth.getUser().then(({ data, error: userError }) => {
      if (!active) return;
      setValidSession(!userError && Boolean(data.user));
      setCheckingSession(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const passwordsMatch = password === confirmPassword;
  const canSubmit =
    validSession &&
    password.length >= 8 &&
    confirmPassword.length >= 8 &&
    passwordsMatch &&
    !loading;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    await supabase.auth.signOut({ scope: 'global' }).catch(() => undefined);
    setComplete(true);
    setLoading(false);
  }

  return (
    <AuthShell
      eyebrow="Password recovery"
      title="Choose a new password."
      description="Use a password that is unique to your DP Resources account."
    >
      {checkingSession ? (
        <div className="flex min-h-56 items-center justify-center gap-3 text-[#43474d]">
          <Loader2 className="size-5 animate-spin" /> Verifying reset link...
        </div>
      ) : complete ? (
        <div className="text-center">
          <div className="mx-auto flex size-20 items-center justify-center rounded-full border border-[#c3c6ce66] bg-[#f5f3ee]">
            <CheckCircle2 className="size-10 text-[#0c7a43]" />
          </div>
          <h1 className="mt-7 font-headline text-4xl text-[#00152a]">
            Password updated
          </h1>
          <p className="mt-4 font-body leading-relaxed text-[#43474d]">
            Your new password is ready. Log in again to continue.
          </p>
          <Link
            href="/auth/login"
            className="mt-8 block w-full rounded-sm bg-[#00152a] py-4 text-white transition-colors hover:bg-[#08284a]"
          >
            Continue to log in
          </Link>
        </div>
      ) : !validSession ? (
        <div className="text-center">
          <h1 className="font-headline text-4xl text-[#00152a]">
            Reset link expired
          </h1>
          <p className="mt-4 font-body leading-relaxed text-[#43474d]">
            This link is invalid or has expired. Request a fresh password reset
            email to try again.
          </p>
          <Link
            href="/auth/forgot-password"
            className="mt-8 block w-full rounded-sm bg-[#00152a] py-4 text-white transition-colors hover:bg-[#08284a]"
          >
            Request a new link
          </Link>
        </div>
      ) : (
        <>
          <h1 className="font-headline text-4xl text-[#00152a]">
            Set a new password
          </h1>
          <p className="mt-3 font-body leading-relaxed text-[#43474d]">
            Use at least 8 characters and avoid reusing an old password.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <PasswordField
              id="new-password"
              label="New password"
              value={password}
              show={showPassword}
              onChange={setPassword}
              onToggle={() => setShowPassword((previous) => !previous)}
              disabled={loading}
            />
            <PasswordField
              id="confirm-new-password"
              label="Confirm new password"
              value={confirmPassword}
              show={showConfirmPassword}
              onChange={setConfirmPassword}
              onToggle={() =>
                setShowConfirmPassword((previous) => !previous)
              }
              disabled={loading}
            />

            {confirmPassword && !passwordsMatch && (
              <p className="text-sm text-red-700">Passwords do not match.</p>
            )}
            {error && <p className="text-sm text-red-700">{error}</p>}

            <button
              type="submit"
              className="dp-auth-primary flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm bg-[#00152a] py-4 text-white transition-colors hover:bg-[#08284a] focus:outline-none focus:ring-2 focus:ring-[#00152a]/30 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={!canSubmit}
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Updating...
                </>
              ) : (
                'Update password'
              )}
            </button>
          </form>
        </>
      )}
    </AuthShell>
  );
}

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  show: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
  disabled: boolean;
};

function PasswordField({
  id,
  label,
  value,
  show,
  onChange,
  onToggle,
  disabled,
}: PasswordFieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="font-label text-xs uppercase tracking-[.05em] text-[#43474d]"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className="tsm-input pr-10"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          minLength={8}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          disabled={disabled}
        />
        <button
          type="button"
          className="absolute right-0 top-1/2 -translate-y-1/2 text-[#43474d] hover:text-[#00152a] disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onToggle}
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          disabled={disabled}
        >
          {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
        </button>
      </div>
    </div>
  );
}
