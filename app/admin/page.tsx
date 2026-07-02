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
  const exportQuery = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const activityLabel = (action: string) => ({ folder_opened: 'Opened folder', file_opened: 'Opened file', download_started: 'Started download' }[action] || action);

  return (
    <>
      <Nav admin={membership.role === 'admin'} email={membership.email} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-[color:var(--dp-navy)]">Admin</h1>
        <nav className="mt-4 flex flex-wrap gap-2 border-b border-slate-200 text-sm" aria-label="Admin sections">{['Library index','Resource reports','Support tickets','Users','Activity'].map((tab)=><a key={tab} href={`#${tab.toLowerCase().replaceAll(' ','-')}`} className="border-b-2 border-transparent px-2 py-2 text-slate-600 hover:border-[color:var(--dp-blue)] hover:text-[color:var(--dp-navy)]">{tab}</a>)}</nav>
        {!isSupabaseConfigured() ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">Supabase is not configured.</p> : null}
        {!isDriveConfigured() ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">Google Drive is not configured. Add Drive service account environment variables before deployment.</p> : null}
        <section id="library-index" className="mt-6"><IndexSyncPanel initial={indexStatus} /></section>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section id="support-tickets"><h2 className="text-base font-semibold text-slate-950">Support tickets</h2><div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{(tickets as SupportTicket[]).map((t) => <div className="border-b p-4 text-sm last:border-b-0" key={t.id}><b>{t.subject}</b><span className="ml-2 text-xs uppercase text-slate-500">{t.status}</span><p className="text-slate-500">{t.reporter_email} · {t.category}</p><p>{t.message}</p></div>)}</div></section>
          <section id="resource-reports"><h2 className="text-base font-semibold text-slate-950">Resource reports</h2><div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{(reports as ResourceReport[]).map((r) => <div className="border-b p-4 text-sm last:border-b-0" key={r.id}><b>{r.resource_name || 'Resource'}</b><span className="ml-2 text-xs uppercase text-slate-500">{r.status}</span><p className="text-slate-500">{r.reporter_email} · {r.category} · {r.resource_path}</p><p>{r.message}</p></div>)}</div></section>
        </div>
        <h2 id="users" className="mt-8 text-base font-semibold text-slate-950">Users</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {(memberships as ResourceMembership[]).map((person) => (
            <div className="grid gap-1 border-b border-slate-100 p-4 text-sm last:border-b-0 md:grid-cols-[1fr_auto]" key={person.id}>
              <span className="font-medium text-slate-900">{person.email}</span>
              <span className="text-slate-500">{person.role}</span>
            </div>
          ))}
        </div>
        <h2 id="activity" className="mt-8 text-base font-semibold text-slate-950">Activity</h2>
        <form className="mt-3 grid gap-2 md:grid-cols-6">
          <input name="email" defaultValue={sp.email || ''} placeholder="User email" maxLength={100} className="rounded-md border border-slate-300 bg-white p-2.5 text-sm" />
          <input name="file" defaultValue={sp.file || ''} placeholder="File name" maxLength={100} className="rounded-md border border-slate-300 bg-white p-2.5 text-sm" />
          <select name="action" defaultValue={sp.action || ''} className="rounded-md border border-slate-300 bg-white p-2.5 text-sm"><option value="">Any action</option><option>folder_opened</option><option>file_opened</option><option>download_started</option></select>
          <input type="date" name="from" defaultValue={sp.from || ''} className="rounded-md border border-slate-300 bg-white p-2.5 text-sm" />
          <input type="date" name="to" defaultValue={sp.to || ''} className="rounded-md border border-slate-300 bg-white p-2.5 text-sm" />
          <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">Filter</button>
        </form>
        <a className="mt-3 inline-block text-sm font-medium text-amber-800 hover:text-amber-900" href={`/api/admin/activity/export?${exportQuery}`}>Export CSV</a>
        <div className="mt-3 overflow-x-auto border border-slate-200 bg-white">
          {(logs as ActivityLog[]).length === 0 ? <p className="p-6 text-sm text-slate-500">No activity matches these filters.</p> : <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">User</th><th className="px-3 py-2">Activity</th><th className="px-3 py-2">Resource</th></tr></thead>
            <tbody>{(logs as ActivityLog[]).map((log) => (
              <tr className="border-t border-slate-100" key={log.id}><td className="whitespace-nowrap px-3 py-2 text-slate-500">{new Date(log.created_at).toLocaleString()}</td><td className="max-w-64 truncate px-3 py-2 font-medium text-slate-900">{log.user_email}</td><td className="px-3 py-2"><span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">{activityLabel(log.action)}</span></td><td className="max-w-80 truncate px-3 py-2 text-slate-700">{log.file_name || 'Resource'}</td></tr>
            ))}</tbody>
          </table>}
        </div>
      </main>
    </>
  );
}
