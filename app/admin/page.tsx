export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { Nav } from '@/components/nav';
import { requireAdmin } from '@/lib/auth';
import { applyActivityFilters } from '@/lib/admin-filters';
import { isDriveConfigured } from '@/lib/drive';
import { getIndexSyncStatus } from '@/lib/index-sync';
import { IndexSyncPanel } from './index-sync-panel';
import { AdminConsole } from './admin-console';
import { createSupabaseAdminClient, isSupabaseConfigured } from '@/lib/supabase';

const statuses=['open','in_review','resolved','closed'];
function n(v?:string){const x=Number(v||1);return Number.isFinite(x)&&x>0?x:1} function size(v?:string,d=25){const x=Number(v||d);return [25,50,100].includes(x)?x:d}
function statusRank(s:string){return s==='open'?0:s==='in_review'?1:s==='resolved'?2:3}

export default async function Admin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { membership } = await requireAdmin(); const sp = await searchParams; const sb = createSupabaseAdminClient();
  const userPage=n(sp.userPage), activityPage=n(sp.activityPage), reportPage=n(sp.reportPage), ticketPage=n(sp.ticketPage); const userSize=size(sp.userSize,25); const pageSize=25;
  let usersQ=sb.from('dp_resource_memberships').select('*',{count:'exact'}).order('created_at',{ascending:false}); if(sp.userEmail) usersQ=usersQ.ilike('email',`%${sp.userEmail}%`); if(sp.role) usersQ=usersQ.eq('role',sp.role); const {data:memberships=[],count:userCount=0,error:membershipsError}=await usersQ.range((userPage-1)*userSize,userPage*userSize-1); if(membershipsError) throw new Error(membershipsError.message);
  let activityQuery=sb.from('dp_resource_activity_logs').select('*',{count:'exact'}).order('created_at',{ascending:false}); activityQuery=applyActivityFilters(activityQuery,sp); const {data:logs=[],count:activityCount=0,error:logsError}=await activityQuery.range((activityPage-1)*50,activityPage*50-1); if(logsError) throw new Error(logsError.message);
  async function queue(table:'dp_resource_reports'|'dp_support_tickets', prefix:string, page:number){let q=sb.from(table).select('*',{count:'exact'}); if(sp[`${prefix}Status`]) q=q.eq('status',sp[`${prefix}Status`]); if(sp[`${prefix}Email`]) q=q.ilike('reporter_email',`%${sp[`${prefix}Email`]}%`); if(sp[`${prefix}From`]) q=q.gte('created_at',sp[`${prefix}From`]); if(sp[`${prefix}To`]) q=q.lte('created_at',`${sp[`${prefix}To`]}T23:59:59`); q=q.order('created_at',{ascending:false}).range((page-1)*pageSize,page*pageSize-1); const r=await q; let data=(r.data||[]) as any[]; const term=(sp[`${prefix}Search`]||'').toLowerCase(); if(term)data=data.filter(x=>[x.resource_name,x.resource_path,x.subject,x.category].some(v=>String(v||'').toLowerCase().includes(term))); data.sort((a,b)=>statusRank(a.status)-statusRank(b.status)||String(b.created_at).localeCompare(String(a.created_at))); return {data,count:r.count||data.length};}
  const [{data:reports,count:reportCount},{data:tickets,count:ticketCount},indexStatus]=await Promise.all([queue('dp_resource_reports','report',reportPage),queue('dp_support_tickets','ticket',ticketPage),getIndexSyncStatus()]);
  const exportQuery = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const configuredWarnings=<>{!isSupabaseConfigured()?<p className="mt-4 border border-amber-200 bg-amber-50 p-4 text-amber-900">Supabase is not configured.</p>:null}{!isDriveConfigured()?<p className="mt-4 border border-amber-200 bg-amber-50 p-4 text-amber-900">Google Drive is not configured.</p>:null}</>;
  return <><Nav admin={membership.role==='admin'} email={membership.email}/><main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><h1 className="text-xl font-semibold tracking-tight text-[color:var(--dp-navy)]">Admin operations</h1><AdminConsole sp={sp} reports={reports as any} tickets={tickets as any} memberships={memberships as any} logs={logs as any} counts={{report:reportCount,user:userCount,activity:activityCount,ticket:ticketCount}} pages={{report:reportPage,user:userPage,activity:activityPage,ticket:ticketPage}} sizes={{page:pageSize,user:userSize}} indexPanel={<IndexSyncPanel initial={indexStatus}/>} configuredWarnings={configuredWarnings} exportQuery={exportQuery}/></main></>;
}
