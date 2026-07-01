import { Nav } from '@/components/nav';
import { requireMember } from '@/lib/auth';
import { createSupabaseAdminClient, isSupabaseConfigured } from '@/lib/supabase';
import type { ActivityLog } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function Profile() {
  const { user, membership } = await requireMember();
  const logs = isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? ((await createSupabaseAdminClient().from('dp_resource_activity_logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50)).data as ActivityLog[] | null)
    : [];

  return (
    <>
      <Nav admin={membership.role === 'admin'} email={membership.email} />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Profile</h1>
          <p className="mt-2 text-slate-600">{membership.email}</p>
          <p className="mt-1 text-sm text-slate-500">Role: {membership.role}</p>
        </div>
        <section className="mt-8">
          <h2 className="text-xl font-semibold text-slate-950">Your activity</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {(logs || []).map((log) => (
              <div className="border-b border-slate-100 p-4 text-sm last:border-b-0" key={log.id}>
                <span className="font-medium text-slate-900">{log.action}</span> — {log.file_name}
                <span className="ml-2 text-slate-500">{new Date(log.created_at).toLocaleString()}</span>
              </div>
            ))}
            {(!logs || logs.length === 0) ? <p className="p-4 text-sm text-slate-600">No activity yet.</p> : null}
          </div>
        </section>
      </main>
    </>
  );
}
