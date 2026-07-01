import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isValidEmail } from '@/lib/auth-email'

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/
const signupDebugEnabled = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_SIGNUP_DEBUG === 'true'

type SignupRequest = {
  username?: string
  fullName?: string
  email?: string
  next?: string
}

function jsonResponse(
  body: { ok: boolean; message: string; field?: 'username' | 'email' | 'form'; debug?: Record<string, unknown> },
  status = 200,
) {
  if (signupDebugEnabled) {
    console.log('[signup-start] response', { status, ...body })
  }

  return NextResponse.json(
    {
      ok: body.ok,
      message: body.message,
      ...(body.field ? { field: body.field } : {}),
      ...(signupDebugEnabled ? { debug: body.debug ?? null } : {}),
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  )
}

export async function POST(request: Request) {
  let payload: SignupRequest
  try {
    payload = (await request.json()) as SignupRequest
  } catch {
    return jsonResponse({ ok: false, message: 'Could not read signup details.', field: 'form' }, 400)
  }

  const username = payload.username?.trim() ?? ''
  const fullName = payload.fullName?.trim() ?? ''
  const email = payload.email?.trim().toLowerCase() ?? ''
  const next = payload.next?.startsWith('/') && !payload.next.startsWith('//') ? payload.next : '/awaiting-approval'
  const origin = new URL(request.url).origin

  if (!USERNAME_PATTERN.test(username)) {
    return jsonResponse({ ok: false, message: 'Use 3-24 characters: letters, numbers, or underscore.', field: 'username' }, 400)
  }

  if (!fullName) {
    return jsonResponse({ ok: false, message: 'Enter your full name.', field: 'form' }, 400)
  }

  if (!isValidEmail(email)) {
    return jsonResponse({ ok: false, message: 'Enter a valid email address.', field: 'email' }, 400)
  }

  const supabase = await createClient()
  const [{ data: usernameAvailable, error: usernameError }, { data: emailAvailable, error: emailError }] = await Promise.all([
    supabase.rpc('dp_resource_is_username_available', { p_username: username }),
    supabase.rpc('dp_resource_is_email_available', { p_email: email }),
  ])

  if (usernameError || emailError) {
    return jsonResponse(
      {
        ok: false,
        message: 'Could not validate signup details right now.',
        field: 'form',
        debug: signupDebugEnabled
          ? {
              path: 'availability_rpc_failed',
              usernameError: usernameError ? { code: usernameError.code, message: usernameError.message } : null,
              emailError: emailError ? { code: emailError.code, message: emailError.message } : null,
            }
          : undefined,
      },
      500,
    )
  }

  if (!usernameAvailable) {
    return jsonResponse({ ok: false, message: 'That username is already taken.', field: 'username', debug: { path: 'username_unavailable' } }, 409)
  }

  if (!emailAvailable) {
    return jsonResponse({ ok: false, message: 'That email is already registered. Log in instead.', field: 'email', debug: { path: 'email_unavailable' } }, 409)
  }

  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: {
        username,
        full_name: fullName,
        approval_completed: false,
      },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  })

  if (otpError) {
    return jsonResponse({ ok: false, message: otpError.message, field: 'form', debug: { path: 'otp_send_failed' } }, 400)
  }

  return jsonResponse({ ok: true, message: 'Verification code sent.', debug: { path: 'otp_sent' } })
}
