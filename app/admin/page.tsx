export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { Nav } from '@/components/nav';
import { requireAdmin } from '@/lib/auth';
import { applyActivityFilters } from '@/lib/admin-filters';
import { isDriveConfigured } from '@/lib/drive';
import { getIndexSyncStatus } from '@/lib/index-sync';
import { IndexSyncPanel } from './index-sync-panel';
import { createSupabaseAdminClient, isSupabaseConfigured } from '@/lib/supabase';
import type { ActivityLog, ResourceMembership, ResourceReport, SupportTicket } from '@/lib/types';

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
  const { data: memberships = [], error: membershipsError } = await sb.from('dp_resource_memberships').select('*').order('created_at', { ascending: false });
  if (membershipsError) throw new Error(membershipsError.message);

  let activityQuery = sb.from('dp_resource_activity_logs').select('*').order('created_at', { ascending: false }).limit(100);
  activityQuery = applyActivityFilters(activityQuery, sp);
  const { data: logs = [], error: logsError } = await activityQuery;
  if (logsError) throw new Error(logsError.message);

  const indexStatus = await getIndexSyncStatus();
  const { data: reports = [] } = await sb.from('dp_resource_reports').select('*').order('created_at', { ascending: false }).limit(25);
  const { data: tickets = [] } = await sb.from('dp_support_tickets').select('*').order('created_at', { ascending: false }).limit(25);
  const today = new Date().toISOString().slice(0, 10);
  const [totalUsers, admins, openedToday, downloadsToday] = await Promise.all([
    countRows('dp_resource_memberships', (q) => q),
    countRows('dp_resource_memberships', (q) => q.eq('role', 'admin')),
    countRows('dp_resource_activity_logs', (q) => q.eq('action', 'file_opened').gte('created_at', `${today}T00:00:00.000Z`).lt('created_at', `${today}T23:59:59.999Z`)),
    countRows('dp_resource_activity_logs', (q) => q.eq('action', 'download_started').gte('created_at', `${today}T00:00:00.000Z`).lt('created_at', `${today}T23:59:59.999Z`)),
  ]);
  const exportQuery = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <Nav admin={membership.role === 'admin'} email={membership.email} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Admin</h1>
        {!isSupabaseConfigured() ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">Supabase is not configured.</p> : null}
        {!isDriveConfigured() ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">Google Drive is not configured. Add Drive service account environment variables before deployment.</p> : null}
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          {[["Total users", totalUsers], ["Admins", admins], ["Files opened today", openedToday], ["Downloads today", downloadsToday]].map(([label, value]) => (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={label}>
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
            </div>
          ))}
        </div>

        <IndexSyncPanel initial={indexStatus} />
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section><h2 className="text-xl font-semibold text-slate-950">Support inbox</h2><div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{(tickets as SupportTicket[]).map((t) => <div className="border-b p-4 text-sm last:border-b-0" key={t.id}><b>{t.subject}</b><span className="ml-2 text-xs uppercase text-slate-500">{t.status}</span><p className="text-slate-500">{t.reporter_email} · {t.category}</p><p>{t.message}</p></div>)}</div></section>
          <section><h2 className="text-xl font-semibold text-slate-950">Resource reports</h2><div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{(reports as ResourceReport[]).map((r) => <div className="border-b p-4 text-sm last:border-b-0" key={r.id}><b>{r.resource_name || 'Resource'}</b><span className="ml-2 text-xs uppercase text-slate-500">{r.status}</span><p className="text-slate-500">{r.reporter_email} · {r.category} · {r.resource_path}</p><p>{r.message}</p></div>)}</div></section>
        </div>
        <h2 className="mt-8 text-xl font-semibold text-slate-950">Users</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {(memberships as ResourceMembership[]).map((person) => (
            <div className="grid gap-1 border-b border-slate-100 p-4 text-sm last:border-b-0 md:grid-cols-[1fr_auto]" key={person.id}>
              <span className="font-medium text-slate-900">{person.email}</span>
              <span className="text-slate-500">{person.role}</span>
            </div>
          ))}
        </div>
        <h2 className="mt-8 text-xl font-semibold text-slate-950">Activity</h2>
        <form className="mt-3 grid gap-2 md:grid-cols-6">
          <input name="email" defaultValue={sp.email || ''} placeholder="User email" maxLength={100} className="rounded-xl border border-slate-200 bg-white p-2.5 text-sm" />
          <input name="file" defaultValue={sp.file || ''} placeholder="File name" maxLength={100} className="rounded-xl border border-slate-200 bg-white p-2.5 text-sm" />
          <select name="action" defaultValue={sp.action || ''} className="rounded-xl border border-slate-200 bg-white p-2.5 text-sm"><option value="">Any action</option><option>folder_opened</option><option>file_opened</option><option>download_started</option></select>
          <input type="date" name="from" defaultValue={sp.from || ''} className="rounded-xl border border-slate-200 bg-white p-2.5 text-sm" />
          <input type="date" name="to" defaultValue={sp.to || ''} className="rounded-xl border border-slate-200 bg-white p-2.5 text-sm" />
          <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white">Filter</button>
        </form>
        <a className="mt-3 inline-block text-sm font-medium text-amber-800 hover:text-amber-900" href={`/api/admin/activity/export?${exportQuery}`}>Export CSV</a>
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {(logs as ActivityLog[]).map((log) => (
            <div className="border-b border-slate-100 p-4 text-sm last:border-b-0" key={log.id}>{log.user_email} — {log.action} — {log.file_name} — {new Date(log.created_at).toLocaleString()}</div>
          ))}
        </div>
      </main>
    </>
  );
}
