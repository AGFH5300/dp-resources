'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { Spinner } from '@/components/ui/spinner';
import { createClient } from '@/lib/supabase/client';

const SIGNUP_DRAFT_KEY = 'dp_resource_signup_profile';
const OTP_LENGTH = 6;
const EMPTY_OTP = ' '.repeat(OTP_LENGTH);

function EmailIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-6 shrink-0"
      fill="none"
    >
      <path d="M4.75 6.75h14.5v10.5H4.75V6.75Z" className="fill-white" />
      <path
        d="m5 7 7 5.4L19 7"
        stroke="#00152a"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.75 6.75h14.5v10.5H4.75V6.75Z"
        stroke="#00152a"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function VerifyOtpForm({
  email,
  username,
  fullName,
  next,
}: {
  email: string;
  username: string;
  fullName: string;
  next: string;
}) {
  const router = useRouter();
  const [otpCode, setOtpCode] = useState(EMPTY_OTP);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const normalizedEmail = email.trim().toLowerCase();
  const sanitizedOtpCode = otpCode.replace(/\s/g, '');
  const canVerify = /^\d{6}$/.test(sanitizedOtpCode) && !loading;

  const fallbackToSignUp = useMemo(
    () => `/auth/sign-up?restoreDraft=1&next=${encodeURIComponent(next)}`,
    [next],
  );

  const getOtpChars = () =>
    otpCode.padEnd(OTP_LENGTH, ' ').slice(0, OTP_LENGTH).split('');

  const focusIndex = (index: number) => {
    const clampedIndex = Math.max(0, Math.min(index, OTP_LENGTH - 1));
    const target = inputRefs.current[clampedIndex];
    target?.focus();
    target?.select();
  };

  const updateOtpChars = (nextChars: string[]) => {
    const nextOtp = nextChars
      .join('')
      .slice(0, OTP_LENGTH)
      .padEnd(OTP_LENGTH, ' ');
    setOtpCode(nextOtp);
    setError(null);
  };

  const setDigitAt = (index: number, digit: string) => {
    const chars = getOtpChars();
    chars[index] = digit;
    updateOtpChars(chars);
  };

  const mergePastedDigits = (startIndex: number, rawValue: string) => {
    const sanitizedDigits = rawValue
      .replace(/\s/g, '')
      .replace(/\D/g, '')
      .slice(0, OTP_LENGTH);

    if (!sanitizedDigits) {
      return null;
    }

    const chars = getOtpChars();
    let nextIndex = Math.max(0, Math.min(startIndex, OTP_LENGTH - 1));

    for (const digit of sanitizedDigits) {
      if (nextIndex >= OTP_LENGTH) {
        break;
      }

      chars[nextIndex] = digit;
      nextIndex += 1;
    }

    updateOtpChars(chars);
    focusIndex(nextIndex);

    return chars;
  };

  const handleOtpPaste = (
    event: React.ClipboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (loading) {
      return;
    }

    const pastedText = event.clipboardData.getData('text');
    mergePastedDigits(index, pastedText);
  };

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();

    if (!canVerify || !normalizedEmail) {
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: sanitizedOtpCode,
      type: 'signup',
    });

    if (verifyError) {
      setError(verifyError.message);
      setLoading(false);
      return;
    }

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(
        SIGNUP_DRAFT_KEY,
        JSON.stringify({
          email: normalizedEmail,
          username: username.trim(),
          fullName: fullName.trim(),
          next,
        }),
      );
    }

    router.push(`/auth/set-password?next=${encodeURIComponent(next)}`);
  }

  async function handleResend() {
    if (!normalizedEmail || resending) {
      return;
    }

    setResending(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (resendError) {
      setError(resendError.message);
      setResending(false);
      return;
    }

    setNotice(`A new ${OTP_LENGTH}-digit code has been sent to your email.`);
    setResending(false);
  }

  return (
    <AuthShell
      eyebrow="Email verification"
      title="Verify your email to continue sign-up."
      description={`Use the one-time ${OTP_LENGTH}-digit code sent to your inbox. After verification, you will set your password and be signed in automatically.`}
    >
      <h1 className="font-headline text-4xl text-[#00152a]">
        Verify email code
      </h1>
      <p className="mt-3 font-body text-[#43474d]">
        Enter the one-time code sent to{' '}
        <span className="font-semibold">{normalizedEmail || 'your email'}</span>
        .
      </p>

      <div className="mt-5 rounded-2xl border border-[#e4dbc9] bg-[#fffaf1] p-4 sm:p-5">
        <p className="text-sm leading-6 text-[#43474d]">
          Open your inbox below. If you do not see the OTP, check your spam or
          junk folder.
        </p>
        <div className="mt-4 grid gap-3">
          <a
            href="https://mail.google.com/mail/u/0/#inbox"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center gap-3 rounded-xl border border-[#e1d7c7] bg-white p-3 text-left text-[#00152a] shadow-sm transition-colors hover:border-[#00152a]/30 hover:bg-[#fffdf8]"
            aria-label="Open Gmail inbox"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-[#e1d7c7]">
              <img
                src="/brand/gmail-icon.svg"
                alt=""
                className="size-7 object-contain"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Open Gmail</span>
              <span className="block text-xs text-[#6b7280]">
                Check your Gmail inbox
              </span>
            </span>
          </a>
          <a
            href="https://outlook.live.com/mail/0/inbox"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center gap-3 rounded-xl border border-[#e1d7c7] bg-white p-3 text-left text-[#00152a] shadow-sm transition-colors hover:border-[#00152a]/30 hover:bg-[#fffdf8]"
            aria-label="Open Outlook inbox"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-[#e1d7c7]">
              <img
                src="/brand/outlook-icon.svg"
                alt=""
                className="size-7 object-contain"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Open Outlook</span>
              <span className="block text-xs text-[#6b7280]">
                Check your Outlook inbox
              </span>
            </span>
          </a>
          <a
            href="mailto:"
            className="flex w-full items-center gap-3 rounded-xl border border-[#e1d7c7] bg-white p-3 text-left text-[#00152a] shadow-sm transition-colors hover:border-[#00152a]/30 hover:bg-[#fffdf8]"
            aria-label="Open default email app"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-[#e1d7c7]">
              <EmailIcon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                Open email app
              </span>
              <span className="block text-xs text-[#6b7280]">
                Use your default email app
              </span>
            </span>
          </a>
        </div>
      </div>

      <form onSubmit={handleVerify} className="mt-8 space-y-6" noValidate>
        <div>
          <label
            htmlFor="otp-digit-1"
            className="mb-3 block font-label text-xs uppercase tracking-widest text-[#43474d]"
          >
            Verification code
          </label>
          <div
            className="grid w-full gap-2"
            style={{
              gridTemplateColumns: `repeat(${OTP_LENGTH}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: OTP_LENGTH }).map((_, index) => {
              const slotValue = /\d/.test(otpCode[index] ?? '')
                ? otpCode[index]
                : '';

              return (
                <input
                  key={index}
                  id={`otp-digit-${index + 1}`}
                  ref={(node) => {
                    inputRefs.current[index] = node;
                  }}
                  type="text"
                  value={slotValue}
                  disabled={loading}
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  aria-label={`Verification code digit ${index + 1}`}
                  className="h-12 w-full rounded-sm border border-[#c3c6ce] bg-white text-center text-base disabled:cursor-not-allowed"
                  onFocus={(event) => {
                    event.currentTarget.select();
                  }}
                  onKeyDown={(event) => {
                    if (loading) {
                      return;
                    }

                    if (event.metaKey || event.ctrlKey || event.altKey) {
                      return;
                    }

                    const { key } = event;

                    if (key === 'ArrowLeft') {
                      event.preventDefault();
                      focusIndex(index - 1);
                      return;
                    }

                    if (key === 'ArrowRight') {
                      event.preventDefault();
                      focusIndex(index + 1);
                      return;
                    }

                    if (key === 'Backspace') {
                      event.preventDefault();
                      const chars = getOtpChars();

                      if (chars[index] !== ' ') {
                        chars[index] = ' ';
                        updateOtpChars(chars);
                        focusIndex(index);
                        return;
                      }

                      if (index > 0) {
                        chars[index - 1] = ' ';
                        updateOtpChars(chars);
                        focusIndex(index - 1);
                      }

                      return;
                    }

                    if (key === 'Delete') {
                      event.preventDefault();
                      const chars = getOtpChars();
                      chars[index] = ' ';
                      updateOtpChars(chars);
                      focusIndex(index);
                      return;
                    }

                    if (/^\d$/.test(key)) {
                      event.preventDefault();
                      setDigitAt(index, key);
                      focusIndex(index + 1);
                      return;
                    }

                    const navigationKeys = new Set([
                      'Tab',
                      'Shift',
                      'Meta',
                      'Control',
                      'Alt',
                      'Home',
                      'End',
                    ]);
                    if (navigationKeys.has(key)) {
                      return;
                    }

                    if (key.length === 1) {
                      event.preventDefault();
                    }
                  }}
                  onChange={(event) => {
                    if (loading) {
                      return;
                    }

                    const nextValue = event.currentTarget.value;
                    const pastedChars = nextValue
                      .replace(/\s/g, '')
                      .replace(/\D/g, '');

                    if (pastedChars.length > 1) {
                      mergePastedDigits(index, pastedChars);
                      return;
                    }

                    if (!pastedChars) {
                      const chars = getOtpChars();
                      chars[index] = ' ';
                      updateOtpChars(chars);
                      return;
                    }

                    setDigitAt(index, pastedChars);
                    focusIndex(index + 1);
                  }}
                  onPaste={(event) => {
                    event.stopPropagation();
                    handleOtpPaste(event, index);
                  }}
                />
              );
            })}
          </div>
        </div>

        {notice && <p className="text-sm text-[#0c7a43]">{notice}</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}

        <button
          className="dp-auth-primary flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm bg-[#00152a] py-4 text-white transition-colors hover:bg-[#08284a] focus:outline-none focus:ring-2 focus:ring-[#00152a]/30 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={!canVerify}
          type="submit"
        >
          {loading ? (
            <>
              <Spinner className="size-4" />
              <span>Verifying code...</span>
            </>
          ) : (
            'Verify code'
          )}
        </button>
      </form>

      <div className="mt-6 flex items-center justify-between gap-4 text-sm font-body text-[#43474d]">
        <button
          type="button"
          onClick={handleResend}
          disabled={resending || loading || !normalizedEmail}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm font-semibold text-[#735b2b] underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-[#735b2b]/30 disabled:cursor-not-allowed disabled:text-[#9d937f]"
        >
          {resending ? (
            <>
              <span>Resending...</span>
              <Spinner className="size-3.5" />
            </>
          ) : (
            'Resend code'
          )}
        </button>

        <Link href={fallbackToSignUp} className="font-semibold text-[#735b2b]">
          Change email
        </Link>
      </div>
    </AuthShell>
  );
}
