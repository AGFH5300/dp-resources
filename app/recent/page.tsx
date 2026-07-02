export const dynamic='force-dynamic';
import { Nav } from '@/components/nav'; import { requireMember } from '@/lib/auth'; import { RecentClient } from './recent-client';
export default async function Recent(){const {membership}=await requireMember(); return <><Nav admin={membership.role==='admin'} email={membership.email}/><main className="mx-auto max-w-5xl p-8"><h1 className="text-3xl font-semibold">Recent</h1><p className="mt-2 text-sm text-slate-500">Recently opened files and folders stored locally for instant access.</p><RecentClient/></main></>}
