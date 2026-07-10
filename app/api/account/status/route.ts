import { NextResponse } from 'next/server'
import { getSessionResourceMembership } from '@/lib/supabase'

export async function GET() {
  const { user, membership } = await getSessionResourceMembership()
  return NextResponse.json({ authenticated: Boolean(user), suspended: Boolean(membership?.is_suspended) }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}
