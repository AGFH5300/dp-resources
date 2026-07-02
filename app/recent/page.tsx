export const dynamic='force-dynamic';
import { Nav } from '@/components/nav'; import { requireMember } from '@/lib/auth'; import { RecentClient } from './recent-client';
export default async function Recent(){const {membership}=await requireMember(); return <><Nav admin={membership.role==='admin'} email={membership.email}/><main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><h1 className="text-xl font-semibold tracking-tight text-[color:var(--dp-navy)]">Recent</h1><p className="mt-1 text-sm text-slate-600">Continue from resources opened on this device.</p><RecentClient/></main></>}
