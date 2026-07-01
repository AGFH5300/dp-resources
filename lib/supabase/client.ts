import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const verifyOtp = client.auth.verifyOtp.bind(client.auth)

  client.auth.verifyOtp = ((params) =>
    verifyOtp({
      ...params,
      // First-time DP Resources sign-up uses Supabase's Confirm sign up template.
      // That template issues a `signup` token, while the ported OTP form requests
      // the email OTP type.
      type: params.type === 'email' ? 'signup' : params.type,
    })) as typeof client.auth.verifyOtp

  return client
}
