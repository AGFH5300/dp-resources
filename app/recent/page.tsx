export const dynamic = 'force-dynamic';
import { Nav } from '@/components/nav';
import { requireMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { recentResourcesFromActivity } from '@/lib/recent-resources';
import { RecentClient } from './recent-client';
export default async function Recent() {
  const { user, membership } = await requireMember();
  const sb = createSupabaseAdminClient();
  const { data: activity = [], error: activityError } = await sb
    .from('dp_resource_activity_logs')
    .select('file_id,file_name,action,created_at')
    .eq('user_id', user.id)
    .in('action', ['file_opened', 'folder_opened'])
    .not('file_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (activityError)
    console.error('Unable to load recent resource activity.', activityError);
  const ids = [...new Set((activity || []).map((row: any) => row.file_id))];
  const { data: indexed = [], error: indexError } = ids.length
    ? await sb
        .from('dp_resource_index')
        .select('drive_file_id,name,mime_type,is_folder,path')
        .in('drive_file_id', ids)
    : { data: [] as any[], error: null };
  if (indexError)
    console.error('Unable to load recent resource metadata.', indexError);
  const initialRows = recentResourcesFromActivity(
    (activity || []) as any,
    (indexed || []) as any,
  );
  return (
    <>
      <Nav
        admin={membership.role === 'admin'}
        email={membership.email}
        userId={membership.id}
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-[color:var(--dp-navy)]">
          Recent
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Continue from resources opened on this device.
        </p>
        <RecentClient initialRows={initialRows} />
      </main>
    </>
  );
}
