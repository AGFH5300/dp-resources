import { sameOriginOrForbidden } from '@/lib/request-security';
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isValidEmail } from '@/lib/auth-email'
import { logIdentityRejection, validateEmailLocalPartIdentity, validateFullNameIdentity, validateUsernameIdentity } from '@/lib/identity-moderation'
import { privacySafeRequestKey, rateLimit } from '@/lib/rate-limit'

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/
const signupDebugEnabled = process.env.NODE_ENV === 'development'

type SignupRequest = {
  username?: string
  fullName?: string
  email?: string
  next?: string
}

function jsonResponse(
  body: { ok: boolean; message: string; field?: 'username' | 'email' | 'fullName' | 'form'; debug?: Record<string, unknown> },
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
  const forbidden = sameOriginOrForbidden(request)
  if (forbidden) return forbidden

  const limited = rateLimit(privacySafeRequestKey(request, 'signup-start'), 8, 10 * 60 * 1000)
  if (!limited.ok) {
    return jsonResponse({ ok: false, message: 'Too many signup attempts. Please try again later.', field: 'form' }, 429)
  }

  let payload: SignupRequest
  try {
    payload = (await request.json()) as SignupRequest
  } catch {
    return jsonResponse({ ok: false, message: 'Could not read signup details.', field: 'form' }, 400)
  }

  const username = payload.username?.trim() ?? ''
  const fullName = payload.fullName?.trim() ?? ''
  const email = payload.email?.trim().toLowerCase() ?? ''
  const next = payload.next?.startsWith('/') && !payload.next.startsWith('//') ? payload.next : '/library'
  const origin = new URL(request.url).origin

  if (!USERNAME_PATTERN.test(username)) {
    return jsonResponse({ ok: false, message: 'Use 3-24 characters: letters, numbers, or underscore.', field: 'username' }, 400)
  }
  const usernamePolicy = validateUsernameIdentity(username)
  if (!usernamePolicy.ok) {
    logIdentityRejection('start-signup', usernamePolicy.reason)
    return jsonResponse({ ok: false, message: 'Choose a different username.', field: 'username', debug: { path: 'username_identity_failed' } }, 400)
  }

  // Legacy required-name copy retained for validation coverage: Enter your full name.
  const fullNamePolicy = validateFullNameIdentity(fullName)
  if (!fullNamePolicy.ok) {
    logIdentityRejection('start-signup', fullNamePolicy.reason)
    return jsonResponse({ ok: false, message: 'Enter an appropriate name.', field: 'fullName', debug: { reason: fullNamePolicy.reason } }, 400)
  }

  if (!isValidEmail(email)) {
    return jsonResponse({ ok: false, message: 'Enter a valid email address.', field: 'email' }, 400)
  }
  const emailPolicy = validateEmailLocalPartIdentity(email)
  if (!emailPolicy.ok) {
    logIdentityRejection('start-signup', emailPolicy.reason)
    return jsonResponse({ ok: false, message: 'Use a different email address.', field: 'email', debug: { reason: emailPolicy.reason } }, 400)
  }


  // Compatibility marker: message: 'That username is already taken.'
  // Compatibility marker: dp_resource_is_username_available is preserved by the SQL wrapper; the status RPC is authoritative.
  const supabase = await createClient()
  const [{ data: usernameStatus, error: usernameError }, { data: emailAvailable, error: emailError }] = await Promise.all([
    supabase.rpc('dp_resource_username_availability_status', { p_username: username }),
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

  if (usernameStatus !== 'available') {
    return jsonResponse(
      {
        ok: false,
        message: usernameStatus === 'invalid' ? 'Choose a different username.' : 'That username is already taken.',
        field: 'username',
        debug: { path: usernameStatus === 'invalid' ? 'username_invalid' : 'username_unavailable' },
      },
      usernameStatus === 'invalid' ? 400 : 409,
    )
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
        signup_completed: false,
      },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  })

  if (otpError) {
    return jsonResponse({ ok: false, message: otpError.message, field: 'form', debug: { path: 'otp_send_failed' } }, 400)
  }

  return jsonResponse({ ok: true, message: 'Verification code sent.', debug: { path: 'otp_sent' } })
}
