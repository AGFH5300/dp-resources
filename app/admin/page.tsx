export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdminClient, isSupabaseConfigured } from '@/lib/supabase';
import { isDriveConfigured } from '@/lib/drive';
import { Nav } from '@/components/nav';
import { setApproval } from './actions';
import type { ActivityLog, ResourceMembership } from '@/lib/types';
import { applyActivityFilters } from '@/lib/admin-filters';

async function countRows(table: 'dp_resource_memberships' | 'dp_resource_activity_logs', build: (q: any) => any) {
  const sb = createSupabaseAdminClient();
  const { count, error } = await build(sb.from(table).select('id', { count: 'exact', head: true }));
  if (error) throw new Error(error.message);
  return count || 0;
}

export default async function Admin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { membership } = await requireAdmin();
  const sp = await searchParams;
  const sb = createSupabaseAdminClient();
  const { data: dp_resource_memberships = [], error: dp_resource_membershipsError } = await sb.from('dp_resource_memberships').select('*').order('created_at', { ascending: false });
  if (dp_resource_membershipsError) throw new Error(dp_resource_membershipsError.message);
  let activityQuery = sb.from('dp_resource_activity_logs').select('*').order('created_at', { ascending: false }).limit(100);
  activityQuery = applyActivityFilters(activityQuery, sp);
  const { data: logs = [], error: logsError } = await activityQuery;
  if (logsError) throw new Error(logsError.message);
  const today = new Date().toISOString().slice(0, 10);
  const [totalUsers, approvedUsers, pendingUsers, openedToday, downloadsToday] = await Promise.all([
    countRows('dp_resource_memberships', (q) => q),
    countRows('dp_resource_memberships', (q) => q.eq('is_approved', true)),
    countRows('dp_resource_memberships', (q) => q.eq('is_approved', false)),
    countRows('dp_resource_activity_logs', (q) => q.eq('action', 'file_opened').gte('created_at', `${today}T00:00:00.000Z`).lt('created_at', `${today}T23:59:59.999Z`)),
    countRows('dp_resource_activity_logs', (q) => q.eq('action', 'download_started').gte('created_at', `${today}T00:00:00.000Z`).lt('created_at', `${today}T23:59:59.999Z`)),
  ]);
  const exportQuery = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return <><Nav admin={membership.role === 'admin'} /><main className="mx-auto max-w-6xl p-4"><h1 className="text-3xl font-semibold">Admin</h1>{!isSupabaseConfigured() && <p>Supabase is not configured.</p>}{!isDriveConfigured() && <p className="mt-4 rounded-lg bg-amber-50 p-4 text-amber-900">Google Drive is not configured. Add Drive service account environment variables before deployment.</p>}<div className="mt-6 grid gap-3 md:grid-cols-5">{[['Total users', totalUsers], ['Approved', approvedUsers], ['Pending', pendingUsers], ['Files opened today', openedToday], ['Downloads today', downloadsToday]].map((c) => <div className="rounded-xl border bg-white p-4" key={c[0]}><p className="text-sm text-slate-500">{c[0]}</p><p className="text-2xl font-semibold">{c[1]}</p></div>)}</div><h2 className="mt-8 text-xl font-semibold">Users</h2><div className="mt-3 rounded-xl border bg-white">{(dp_resource_memberships as ResourceMembership[]).map((p) => <div className="flex items-center justify-between border-b p-3 text-sm" key={p.id}><span>{p.email} — {p.role} — {p.is_approved ? 'approved' : 'pending'}</span><form action={setApproval}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="approve" value={String(!p.is_approved)} /><button className="rounded border px-3 py-1">{p.is_approved ? 'Revoke' : 'Approve'}</button></form></div>)}</div><h2 className="mt-8 text-xl font-semibold">Activity</h2><form className="mt-3 grid gap-2 md:grid-cols-6"><input name="email" defaultValue={sp.email || ''} placeholder="User email" maxLength={100} className="rounded border p-2" /><input name="file" defaultValue={sp.file || ''} placeholder="File name" maxLength={100} className="rounded border p-2" /><select name="action" defaultValue={sp.action || ''} className="rounded border p-2"><option value="">Any action</option><option>folder_opened</option><option>file_opened</option><option>download_started</option></select><input type="date" name="from" defaultValue={sp.from || ''} className="rounded border p-2" /><input type="date" name="to" defaultValue={sp.to || ''} className="rounded border p-2" /><button className="rounded bg-slate-900 text-white">Filter</button></form><a className="mt-3 inline-block text-blue-700" href={`/api/admin/activity/export?${exportQuery}`}>Export CSV</a><div className="mt-3 rounded-xl border bg-white">{(logs as ActivityLog[]).map((l) => <div className="border-b p-3 text-sm" key={l.id}>{l.user_email} — {l.action} — {l.file_name} — {new Date(l.created_at).toLocaleString()}</div>)}</div></main></>;
}
