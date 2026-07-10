import { NextResponse } from 'next/server'
import { getSessionResourceMembership } from '@/lib/supabase'

export async function GET() {
  const { user, membership } = await getSessionResourceMembership()
  const authenticated = Boolean(user)
  const suspended = Boolean(membership?.is_suspended)
  return NextResponse.json({
    authenticated,
    suspended,
    suspensionReason: authenticated && suspended ? membership?.suspension_reason ?? null : null,
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}
