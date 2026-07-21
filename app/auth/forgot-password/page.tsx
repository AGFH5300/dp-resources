'use client';

import { ArrowLeft, CheckCircle2, Loader2, Mail } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { InboxShortcuts } from '@/components/inbox-shortcuts';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const resetLinkError =
      new URLSearchParams(window.location.search).get('error') ===
      'invalid_link';
    if (resetLinkError) {
      setError('That password reset link is invalid or has expired. Request a new one below.');
    }
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);

    const callbackUrl = new URL('/auth/callback', window.location.origin);
    callbackUrl.searchParams.set('next', '/auth/update-password');

    const { error: resetError } = await createClient().auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: callbackUrl.toString() },
    );

    if (resetError) {
      setError(
        'We could not send a reset email right now. Please wait a moment and try again.',
      );
      setLoading(false);
      return;
    }

    setSubmitted(true);
    setLoading(false);
  }

  return (
    <AuthShell
      eyebrow="Password recovery"
      title="Get back into your resource library."
      description="We will email you a secure link to choose a new password."
      quote="The secret of getting ahead is getting started."
      attribution="Mark Twain"
    >
      {submitted ? (
        <div className="text-center">
          <div className="mx-auto flex size-20 items-center justify-center rounded-full border border-[#c3c6ce66] bg-[#f5f3ee]">
            <CheckCircle2 className="size-10 text-[#0c7a43]" />
          </div>
          <h1 className="mt-7 font-headline text-4xl text-[#00152a]">
            Check your email
          </h1>
          <p className="mt-4 font-body leading-relaxed text-[#43474d]">
            If an account exists for <strong>{email.trim()}</strong>, we sent a
            password reset link.
          </p>
          <InboxShortcuts
            message={
              <>
                Open your inbox below. If you do not see the reset email, check
                your spam or junk folder. It may take a minute to arrive.
              </>
            }
          />
          <button
            type="button"
            className="mt-6 text-sm font-semibold text-[#00152a] hover:underline"
            onClick={() => {
              setSubmitted(false);
              setError(null);
            }}
          >
            Try another email
          </button>
          <Link
            href="/auth/login"
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-sm bg-[#00152a] py-4 text-white transition-colors hover:bg-[#08284a]"
          >
            <ArrowLeft className="size-4" /> Return to log in
          </Link>
        </div>
      ) : (
        <>
          <div className="flex size-14 items-center justify-center rounded-full bg-[#ece7db]">
            <Mail className="size-6 text-[#735b2b]" />
          </div>
          <h1 className="mt-6 font-headline text-4xl text-[#00152a]">
            Forgot your password?
          </h1>
          <p className="mt-3 font-body leading-relaxed text-[#43474d]">
            Enter the email used for your DP Resources account.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div>
              <label
                htmlFor="forgot-password-email"
                className="font-label text-xs uppercase tracking-[.05em] text-[#43474d]"
              >
                Email
              </label>
              <input
                id="forgot-password-email"
                className="tsm-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={loading}
              />
            </div>

            {error && <p className="text-sm text-red-700">{error}</p>}

            <button
              type="submit"
              className="dp-auth-primary flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm bg-[#00152a] py-4 text-white transition-colors hover:bg-[#08284a] focus:outline-none focus:ring-2 focus:ring-[#00152a]/30 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={loading || !email.trim()}
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Sending link...
                </>
              ) : (
                'Send reset link'
              )}
            </button>
          </form>

          <Link
            href="/auth/login"
            className="mt-8 flex items-center justify-center gap-2 border-t border-[#c3c6ce55] pt-6 text-sm font-semibold text-[#00152a] hover:underline"
          >
            <ArrowLeft className="size-4" /> Back to log in
          </Link>
        </>
      )}
    </AuthShell>
  );
}
