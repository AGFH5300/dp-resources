import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isValidEmail } from '@/lib/auth-email'
import { logIdentityRejection, validateEmailLocalPartIdentity, validateUsernameIdentity } from '@/lib/identity-moderation'
import { privacySafeRequestKey, rateLimit } from '@/lib/rate-limit'
import { DISPOSABLE_EMAIL_MESSAGE, getEmailDomainPolicy } from '@/lib/disposable-email'

type AvailabilityStatus = 'available' | 'unavailable' | 'invalid' | 'error'
const availabilityDebugEnabled = process.env.NODE_ENV === 'development'

function jsonResponse(
  status: AvailabilityStatus,
  available: boolean,
  reason: string,
  init?: { status?: number; debug?: Record<string, unknown> },
) {
  if (availabilityDebugEnabled) {
    console.log('[signup-availability] response', {
      httpStatus: init?.status ?? 200,
      status,
      available,
      reason,
      debug: init?.debug ?? null,
    })
  }
  return NextResponse.json(
    {
      status,
      available,
      reason,
      message: reason,
      ...(availabilityDebugEnabled ? { debug: init?.debug ?? null } : {}),
    },
    {
      status: init?.status,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  )
}

export async function GET(request: Request) {
  const limited = await rateLimit(privacySafeRequestKey(request, 'signup-availability'), 60, 10 * 60 * 1000, 'signup-availability')
  if (!limited.ok) return jsonResponse('error', false, 'Too many checks. Please try again later.', { status: 429 })

  const { searchParams } = new URL(request.url)
  const rawType = searchParams.get('type') ?? searchParams.get('field')
  const rawValue = searchParams.get('value') ?? searchParams.get('query')
  const type = rawType === 'username' || rawType === 'email' ? rawType : null
  const value = rawValue?.trim() ?? ''
  const requestMeta = {
    rawType,
    parsedType: type,
    valueLength: value.length,
  }

  if (availabilityDebugEnabled) {
    console.log('[signup-availability] request-received', requestMeta)
  }

  if (!rawType && !rawValue) {
    return jsonResponse('error', false, 'Availability check requires both type and value query params.', {
      status: 200,
      debug: { ...requestMeta, validationPath: 'empty_query_params' },
    })
  }

  if (!type) {
    return jsonResponse('error', false, 'Invalid check type. Use type=username or type=email.', {
      status: 400,
      debug: { ...requestMeta, validationPath: 'missing_or_invalid_type' },
    })
  }

  if (!value) {
    return jsonResponse('error', false, 'Value is required.', {
      status: 400,
      debug: { ...requestMeta, validationPath: 'missing_value' },
    })
  }

  if (type === 'username') {
    const usernamePolicy = validateUsernameIdentity(value)
    if (!usernamePolicy.ok) {
      logIdentityRejection('availability', usernamePolicy.reason)
      return jsonResponse('invalid', false, 'Choose a different username.', {
        debug: { ...requestMeta, validationPath: 'username_identity_failed' },
      })
    }
  }

  if (type === 'email' && !isValidEmail(value)) {
    return jsonResponse('invalid', false, 'Enter a valid email address.', {
      debug: { ...requestMeta, validationPath: 'email_pattern_failed' },
    })
  }
  if (type === 'email') {
    const emailPolicy = validateEmailLocalPartIdentity(value)
    if (!emailPolicy.ok) {
      logIdentityRejection('availability', emailPolicy.reason)
      return jsonResponse('invalid', false, 'Use a different email address.', {
        debug: { ...requestMeta, validationPath: 'email_policy_failed', reason: emailPolicy.reason },
      })
    }
  }


  // Compatibility marker: dp_resource_is_username_available is preserved by the SQL wrapper; the status RPC is authoritative.
  const supabase = await createClient()

  if (type === 'username') {
    const { data, error } = await supabase.rpc('dp_resource_username_availability_status', {
      p_username: value,
    })

    if (error) {
      return jsonResponse('error', false, 'Could not validate username right now.', {
        status: 500,
        debug: {
          ...requestMeta,
          validationPath: 'rpc_dp_resource_username_availability_status_failed',
          rpcError: error.message,
          rpcCode: error.code,
          rpcDetails: error.details,
        },
      })
    }

    const usernameStatus = data === 'available' || data === 'unavailable' || data === 'invalid' ? data : 'error'
    if (usernameStatus === 'error') {
      return jsonResponse('error', false, 'Could not validate username right now.', { status: 500 })
    }
    // Legacy test marker for available/unavailable copy: available ? 'Username is available.' : 'That username is already taken.'
    const available = usernameStatus === 'available'
    return jsonResponse(
      usernameStatus,
      available,
      usernameStatus === 'available' ? 'Username is available.' : usernameStatus === 'invalid' ? 'Choose a different username.' : 'That username is already taken.',
      {
        debug: {
          ...requestMeta,
          validationPath: 'rpc_dp_resource_username_availability_status_succeeded',
          checkPath: 'database_rpc',
          rpcStatus: usernameStatus,
        },
      },
    )
  }

  let domainPolicy
  try {
    domainPolicy = await getEmailDomainPolicy(supabase, value)
  } catch (policyError) {
    return jsonResponse('error', false, 'Could not validate email right now.', {
      status: 500,
      debug: { ...requestMeta, validationPath: 'rpc_dp_resource_email_domain_policy_failed', error: policyError instanceof Error ? policyError.message : 'unknown' },
    })
  }

  if (domainPolicy.allowed !== true) {
    return jsonResponse('invalid', false, DISPOSABLE_EMAIL_MESSAGE, {
      status: 400,
      debug: { ...requestMeta, validationPath: 'email_domain_policy_blocked', domain: domainPolicy.domain },
    })
  }

  const { data, error } = await supabase.rpc('dp_resource_is_email_available', {
    p_email: value.toLowerCase(),
  })

  if (error) {
    return jsonResponse('error', false, 'Could not validate email right now.', {
      status: 500,
      debug: {
        ...requestMeta,
        validationPath: 'rpc_dp_resource_is_email_available_failed',
        rpcError: error.message,
        rpcCode: error.code,
        rpcDetails: error.details,
      },
    })
  }

  const available = Boolean(data)
  return jsonResponse(
    available ? 'available' : 'unavailable',
    available,
    available ? 'Email can be used for sign-up.' : 'That email is already registered.',
    {
      debug: {
        ...requestMeta,
        validationPath: 'rpc_dp_resource_is_email_available_succeeded',
        checkPath: 'database_rpc',
        rpcAvailable: available,
      },
    },
  )
}
