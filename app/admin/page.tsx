export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { Nav } from '@/components/nav';
import { requireAdmin } from '@/lib/auth';
import { applyActivityFilters } from '@/lib/admin-filters';
import { isDriveConfigured } from '@/lib/drive';
import { getIndexSyncStatus } from '@/lib/index-sync';
import { IndexSyncPanel } from './index-sync-panel';
import { AdminConsole } from './admin-console';
import { UserSuspensionPanel } from './user-suspension-panel';
import { createSupabaseAdminClient, isSupabaseConfigured } from '@/lib/supabase';
import { createClient } from '@/lib/supabase-server';
import { devTiming, nowMs } from '@/lib/perf';

function n(v?:string){const x=Number(v||1);return Number.isFinite(x)&&x>0?x:1} function size(v?:string,d=25){const x=Number(v||d);return [25,50,100].includes(x)?x:d}
function statusRank(s:string){return s==='open'?0:s==='in_review'?1:s==='resolved'?2:3}

export default async function Admin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const authStart = nowMs();
  const { membership } = await requireAdmin();
  devTiming('admin.auth', { ms: nowMs() - authStart });
  const sp = await searchParams;
  const section = sp.section || 'index';
  const sb = createSupabaseAdminClient();
  const userPage=n(sp.userPage), activityPage=n(sp.activityPage), reportPage=n(sp.reportPage), ticketPage=n(sp.ticketPage); const userSize=size(sp.userSize,25); const pageSize=25;
  let memberships:any[]=[]; let logs:any[]=[]; let reports:any[]=[]; let tickets:any[]=[]; let usage:any[]=[]; let usageResource:any=null; let usageUsers:any[]=[]; let usageUserResources:any[]=[]; let diagnostics:any[]=[]; let userCount=0; let activityCount=0; let reportCount=0; let ticketCount=0; let indexStatus:any=null;

  async function loadAdmins(){ const t=nowMs(); const {data=[],error}=await sb.from('dp_resource_memberships').select('*').eq('role','admin').order('email'); if(error) throw new Error(error.message); devTiming('admin.section_query', { section, dataset:'admins', ms: nowMs()-t }); return data as any[]; }
  async function queue(table:'dp_resource_reports'|'dp_support_tickets', prefix:string, page:number){const t=nowMs(); let q=sb.from(table).select('*',{count:'exact'}); if(sp[`${prefix}Status`]) q=q.eq('status',sp[`${prefix}Status`]); if(sp[`${prefix}Email`]) q=q.ilike('reporter_email',`%${sp[`${prefix}Email`]}%`); if(sp[`${prefix}From`]) q=q.gte('created_at',sp[`${prefix}From`]); if(sp[`${prefix}To`]) q=q.lte('created_at',`${sp[`${prefix}To`]}T23:59:59`); const term=(sp[`${prefix}Search`]||'').trim(); if(term){ const safe=term.replace(/[%_,]/g,''); q=table==='dp_resource_reports'?q.or(`resource_name.ilike.%${safe}%,resource_path.ilike.%${safe}%,category.ilike.%${safe}%,message.ilike.%${safe}%`):q.or(`subject.ilike.%${safe}%,category.ilike.%${safe}%,message.ilike.%${safe}%`); } q=q.order('created_at',{ascending:false}).range((page-1)*pageSize,page*pageSize-1); const r=await q; if(r.error) throw new Error(r.error.message); let data=(r.data||[]) as any[]; data.sort((a,b)=>statusRank(a.status)-statusRank(b.status)||String(b.created_at).localeCompare(String(a.created_at))); devTiming('admin.section_query', { section, dataset: prefix, ms: nowMs()-t }); return {data,count:r.count||data.length};}

  if (section === 'index') {
    const t=nowMs(); indexStatus = await getIndexSyncStatus(); devTiming('admin.section_query', { section, dataset:'index', ms: nowMs()-t });
  } else if (section === 'reports') {
    [{data:reports,count:reportCount}, memberships] = await Promise.all([queue('dp_resource_reports','report',reportPage), loadAdmins()]);
  } else if (section === 'tickets') {
    [{data:tickets,count:ticketCount}, memberships] = await Promise.all([queue('dp_support_tickets','ticket',ticketPage), loadAdmins()]);
  } else if (section === 'users') {
    const t=nowMs(); let usersQ=sb.from('dp_resource_memberships').select('*',{count:'exact'}).order('created_at',{ascending:false}); if(sp.userEmail) usersQ=usersQ.ilike('email',`%${sp.userEmail}%`); if(sp.role) usersQ=usersQ.eq('role',sp.role); const {data:rawMembershipRows,count=0,error}=await usersQ.range((userPage-1)*userSize,userPage*userSize-1); if(error) throw new Error(error.message); const membershipRows = rawMembershipRows || []; userCount=count||0; const latestActivity=new Map<string,string>(); if(membershipRows.length){ const {data:recentUserLogs=[]}=await sb.from('dp_resource_activity_logs').select('user_id,created_at').in('user_id',membershipRows.map((u:any)=>u.id)).order('created_at',{ascending:false}).limit(500); (recentUserLogs||[]).forEach((l:any)=>{ if(!latestActivity.has(l.user_id)) latestActivity.set(l.user_id,l.created_at); }); } memberships=membershipRows.map((u:any)=>({...u,latest_activity_at:latestActivity.get(u.id)||null})); devTiming('admin.section_query', { section, dataset:'users', ms: nowMs()-t });
  } else if (section === 'analytics') {
    const range=sp.range||'30d'; const userSb=await createClient(); const {data=[],error}=await userSb.rpc('dp_admin_resource_usage_leaderboard',{p_range:range,p_limit:100}); if(error) throw new Error('Forbidden'); usage=data||[]; if(sp.resourceId){ usageResource=(usage as any[]).find(r=>r.file_id===sp.resourceId)||null; const users=await userSb.rpc('dp_admin_resource_usage_for_resource',{p_file_id:sp.resourceId,p_range:range}); if(users.error) throw new Error('Forbidden'); usageUsers=users.data||[]; } if(sp.userId){ const resources=await userSb.rpc('dp_admin_resource_usage_for_user',{p_user_id:sp.userId,p_range:range}); if(resources.error) throw new Error('Forbidden'); usageUserResources=resources.data||[]; }
  } else if (section === 'diagnostics') {
    await sb.rpc('dp_run_platform_housekeeping').then(() => undefined, () => undefined); const {data=[]}=await sb.from('dp_server_error_events').select('occurred_at,level,area,message,context').order('occurred_at',{ascending:false}).limit(50); diagnostics=data||[];
  } else if (section === 'activity') {
    const t=nowMs(); let activityQuery=sb.from('dp_resource_activity_logs').select('*',{count:'exact'}).order('created_at',{ascending:false}); activityQuery=applyActivityFilters(activityQuery,sp); const {data=[],count=0,error}=await activityQuery.range((activityPage-1)*50,activityPage*50-1); if(error) throw new Error(error.message); logs=data || []; activityCount=count||0; devTiming('admin.section_query', { section, dataset:'activity', ms: nowMs()-t });
  }

  const exportQuery = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const configuredWarnings=<>{!isSupabaseConfigured()?<p className="mt-4 border border-amber-200 bg-amber-50 p-4 text-amber-900">Supabase is not configured.</p>:null}{!isDriveConfigured()?<p className="mt-4 border border-amber-200 bg-amber-50 p-4 text-amber-900">Google Drive is not configured.</p>:null}</>;
  return <><Nav admin={membership.role==='admin'} email={membership.email}/><main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><h1 className="text-xl font-semibold tracking-tight text-[color:var(--dp-navy)]">Admin operations</h1>{section === 'users' ? <UserSuspensionPanel users={memberships as any} currentAdminId={membership.id} /> : null}<AdminConsole sp={sp} reports={reports as any} tickets={tickets as any} memberships={memberships as any} logs={logs as any} usage={usage as any} usageResource={usageResource as any} usageUsers={usageUsers as any} usageUserResources={usageUserResources as any} diagnostics={diagnostics as any} counts={{report:reportCount,user:userCount,activity:activityCount,ticket:ticketCount}} pages={{report:reportPage,user:userPage,activity:activityPage,ticket:ticketPage}} sizes={{page:pageSize,user:userSize}} indexPanel={<IndexSyncPanel initial={indexStatus}/>} configuredWarnings={configuredWarnings} exportQuery={exportQuery}/></main></>;
}
