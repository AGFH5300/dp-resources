export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { Nav } from '@/components/nav';
import { requireAdmin } from '@/lib/auth';
import { applyActivityFilters } from '@/lib/admin-filters';
import { matchesAdminContentSearch } from '@/lib/admin-content-search';
import { isDriveConfigured } from '@/lib/drive';
import { getIndexSyncStatus } from '@/lib/index-sync';
import { IndexSyncPanel } from './index-sync-panel';
import { AdminConsole } from './admin-console';
import {
  createSupabaseAdminClient,
  isSupabaseConfigured,
} from '@/lib/supabase';
import { createClient } from '@/lib/supabase-server';
import { devTiming, nowMs } from '@/lib/perf';

function n(v?: string) {
  const x = Number(v || 1);
  return Number.isFinite(x) && x > 0 ? x : 1;
}
function size(v?: string, d = 25) {
  const x = Number(v || d);
  return [25, 50, 100].includes(x) ? x : d;
}
function statusRank(s: string) {
  return s === 'open' ? 0 : s === 'in_review' ? 1 : s === 'resolved' ? 2 : 3;
}

type AdminIdentity = {
  id: string;
  email: string;
  username: string;
  full_name: string;
  role: string;
};

function uniqueStrings(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  );
}

function chunks<T>(values: T[], size = 200) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function listAllAuthUsers(sb: any) {
  const users: any[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const result = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw new Error(result.error.message);
    const batch = result.data?.users || [];
    users.push(...batch);
    if (batch.length < 1000) break;
  }
  return users;
}

async function loadRowsByIds(
  sb: any,
  table: string,
  columns: string,
  ids: string[],
) {
  const rows: any[] = [];
  for (const batch of chunks(uniqueStrings(ids))) {
    const { data = [], error } = await sb
      .from(table)
      .select(columns)
      .in('id', batch);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
  }
  return rows;
}

async function loadIdentityMap(sb: any, ids: string[]) {
  const uniqueIds = uniqueStrings(ids);
  const identities = new Map<string, AdminIdentity>();
  if (!uniqueIds.length) return identities;
  const [memberships, profiles, authUsers] = await Promise.all([
    loadRowsByIds(sb, 'dp_resource_memberships', 'id,email,role', uniqueIds),
    loadRowsByIds(sb, 'dp_resource_profiles', 'id,username,full_name', uniqueIds),
    listAllAuthUsers(sb),
  ]);
  const membershipById = new Map(memberships.map((row: any) => [row.id, row]));
  const profileById = new Map(profiles.map((row: any) => [row.id, row]));
  const authById = new Map(
    authUsers
      .filter((row: any) => uniqueIds.includes(row.id))
      .map((row: any) => [row.id, row]),
  );
  for (const id of uniqueIds) {
    const membership: any = membershipById.get(id) || {};
    const profile: any = profileById.get(id) || {};
    const authUser: any = authById.get(id) || {};
    const metadata = authUser.user_metadata || {};
    identities.set(id, {
      id,
      email: String(membership.email || authUser.email || '').trim(),
      username: String(profile.username || metadata.username || '').trim(),
      full_name: String(
        profile.full_name ||
          metadata.full_name ||
          metadata.name ||
          metadata.display_name ||
          '',
      ).trim(),
      role: String(membership.role || '').trim(),
    });
  }
  return identities;
}

async function loadAllRows(
  loader: (from: number, to: number) => Promise<{ data: any[] | null; error: any }>,
) {
  const rows: any[] = [];
  const batchSize = 500;
  for (let from = 0; ; from += batchSize) {
    const { data = [], error } = await loader(from, from + batchSize - 1);
    if (error) throw new Error(error.message);
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < batchSize) break;
  }
  return rows;
}

async function loadTicketMessageMap(sb: any, ticketIds: string[]) {
  const result = new Map<string, any[]>();
  for (const batch of chunks(uniqueStrings(ticketIds))) {
    const { data = [], error } = await sb
      .from('dp_support_ticket_messages')
      .select('ticket_id,author_id,author_role,body,visibility,created_at')
      .in('ticket_id', batch)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    for (const message of data || []) {
      const messages = result.get(message.ticket_id) || [];
      messages.push(message);
      result.set(message.ticket_id, messages);
    }
  }
  return result;
}

async function enrichMembershipRows(sb: any, rows: any[]) {
  if (!rows.length) return [];
  const userIds = rows.map((row) => row.id);
  const identities = await loadIdentityMap(sb, userIds);
  const latestActivity = new Map<string, string>();
  for (const batch of chunks(userIds)) {
    const { data = [], error } = await sb
      .from('dp_resource_activity_logs')
      .select('user_id,created_at')
      .in('user_id', batch)
      .order('created_at', { ascending: false })
      .limit(Math.max(500, batch.length * 5));
    if (error) throw new Error(error.message);
    for (const log of data || []) {
      if (!latestActivity.has(log.user_id)) {
        latestActivity.set(log.user_id, log.created_at);
      }
    }
  }
  return rows.map((row) => {
    const identity = identities.get(row.id);
    return {
      ...row,
      email: row.email || identity?.email || '',
      username: identity?.username || null,
      full_name: identity?.full_name || null,
      latest_activity_at: latestActivity.get(row.id) || null,
    };
  });
}

export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const authStart = nowMs();
  const { membership } = await requireAdmin();
  devTiming('admin.auth', { ms: nowMs() - authStart });
  const sp = await searchParams;
  const section = sp.section || 'index';
  const sb = createSupabaseAdminClient();
  const userPage = n(sp.userPage),
    activityPage = n(sp.activityPage),
    reportPage = n(sp.reportPage),
    ticketPage = n(sp.ticketPage);
  const userSize = size(sp.userSize, 25);
  const pageSize = 25;
  let memberships: any[] = [];
  let domainPolicies: Record<
    string,
    {
      allowed: boolean | null;
      matched_domain: string | null;
      error?: string | null;
    }
  > = {};
  let logs: any[] = [];
  let reports: any[] = [];
  let tickets: any[] = [];
  let usage: any[] = [];
  let usageResource: any = null;
  let usageUsers: any[] = [];
  let usageUserResources: any[] = [];
  let usageSelectedUser: any = null;
  let diagnostics: any[] = [];
  let userCount = 0;
  let activityCount = 0;
  let reportCount = 0;
  let ticketCount = 0;
  let indexStatus: any = null;

  async function loadAdmins() {
    const t = nowMs();
    const { data = [], error } = await sb
      .from('dp_resource_memberships')
      .select('*')
      .eq('role', 'admin')
      .order('email');
    if (error) throw new Error(error.message);
    devTiming('admin.section_query', {
      section,
      dataset: 'admins',
      ms: nowMs() - t,
    });
    return data as any[];
  }
  async function queue(
    table: 'dp_resource_reports' | 'dp_support_tickets',
    prefix: string,
    page: number,
  ) {
    const t = nowMs();
    const term = String(
      sp[`${prefix}Search`] || sp[`${prefix}Email`] || '',
    ).trim();
    const makeQuery = (withCount = false) => {
      let query: any = sb
        .from(table)
        .select('*', withCount ? { count: 'exact' } : undefined);
      if (sp[`${prefix}Status`]) {
        query = query.eq('status', sp[`${prefix}Status`]);
      }
      if (sp[`${prefix}From`]) {
        query = query.gte('created_at', sp[`${prefix}From`]);
      }
      if (sp[`${prefix}To`]) {
        query = query.lte('created_at', `${sp[`${prefix}To`]}T23:59:59`);
      }
      return query;
    };

    if (!term) {
      const result = await makeQuery(true)
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (result.error) throw new Error(result.error.message);
      const data = (result.data || []) as any[];
      data.sort(
        (a, b) =>
          statusRank(a.status) - statusRank(b.status) ||
          String(b.created_at).localeCompare(String(a.created_at)),
      );
      devTiming('admin.section_query', {
        section,
        dataset: prefix,
        ms: nowMs() - t,
      });
      return { data, count: result.count || data.length };
    }

    const allRows = await loadAllRows(async (from, to) =>
      makeQuery(false)
        .order('created_at', { ascending: false })
        .range(from, to),
    );
    const messageMap =
      table === 'dp_support_tickets'
        ? await loadTicketMessageMap(
            sb,
            allRows.map((row) => row.id),
          )
        : new Map<string, any[]>();
    const identityIds = uniqueStrings(
      allRows.flatMap((row) => [
        row.reporter_id,
        row.assigned_to,
        row.resolved_by,
        ...(messageMap.get(row.id) || []).map((message) => message.author_id),
      ]),
    );
    const identities = await loadIdentityMap(sb, identityIds);
    const filtered = allRows.filter((row) => {
      const reporter = identities.get(row.reporter_id);
      const assigned = identities.get(row.assigned_to);
      const resolved = identities.get(row.resolved_by);
      const messages = (messageMap.get(row.id) || []).map((message) => ({
        ...message,
        author: identities.get(message.author_id),
      }));
      return matchesAdminContentSearch(
        term,
        row,
        reporter,
        assigned,
        resolved,
        row.assigned_to ? '' : 'unassigned',
        messages,
      );
    });
    filtered.sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        String(b.created_at).localeCompare(String(a.created_at)),
    );
    const start = (page - 1) * pageSize;
    const data = filtered.slice(start, start + pageSize);
    devTiming('admin.section_query', {
      section,
      dataset: prefix,
      ms: nowMs() - t,
    });
    return { data, count: filtered.length };
  }

  if (section === 'index') {
    const t = nowMs();
    indexStatus = await getIndexSyncStatus();
    devTiming('admin.section_query', {
      section,
      dataset: 'index',
      ms: nowMs() - t,
    });
  } else if (section === 'reports') {
    [{ data: reports, count: reportCount }, memberships] = await Promise.all([
      queue('dp_resource_reports', 'report', reportPage),
      loadAdmins(),
    ]);
    if (sp.reportId && !reports.some((item) => item.id === sp.reportId)) {
      const { data } = await sb
        .from('dp_resource_reports')
        .select('*')
        .eq('id', sp.reportId)
        .maybeSingle();
      if (data) reports = [data, ...reports];
    }
  } else if (section === 'tickets') {
    [{ data: tickets, count: ticketCount }, memberships] = await Promise.all([
      queue('dp_support_tickets', 'ticket', ticketPage),
      loadAdmins(),
    ]);
    if (sp.ticketId && !tickets.some((item) => item.id === sp.ticketId)) {
      const { data } = await sb
        .from('dp_support_tickets')
        .select('*')
        .eq('id', sp.ticketId)
        .maybeSingle();
      if (data) tickets = [data, ...tickets];
    }
  } else if (section === 'users') {
    const t = nowMs();
    const userSearch = String(sp.userSearch || sp.userEmail || '').trim();
    let membershipRows: any[] = [];
    if (userSearch) {
      const allMembershipRows = await loadAllRows(async (from, to) => {
        let query: any = sb
          .from('dp_resource_memberships')
          .select('*')
          .order('created_at', { ascending: false });
        if (sp.role) query = query.eq('role', sp.role);
        return query.range(from, to);
      });
      const enriched = await enrichMembershipRows(sb, allMembershipRows);
      const filtered = enriched.filter((user) =>
        matchesAdminContentSearch(
          userSearch,
          user.full_name,
          user.username,
          user.email,
          user.role,
          user.is_approved ? 'approved' : 'pending unapproved',
          user.is_suspended ? 'suspended inactive blocked' : 'active',
          user.suspension_reason,
          user.created_at,
          user.approved_at,
          user.suspended_at,
          user.latest_activity_at,
        ),
      );
      userCount = filtered.length;
      const start = (userPage - 1) * userSize;
      memberships = filtered.slice(start, start + userSize);
    } else {
      let usersQuery: any = sb
        .from('dp_resource_memberships')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });
      if (sp.role) usersQuery = usersQuery.eq('role', sp.role);
      const result = await usersQuery.range(
        (userPage - 1) * userSize,
        userPage * userSize - 1,
      );
      if (result.error) throw new Error(result.error.message);
      membershipRows = result.data || [];
      userCount = result.count || 0;
      memberships = await enrichMembershipRows(sb, membershipRows);
    }
    const uniqueDomains = Array.from(    const uniqueDomains = Array.from(
      new Set(
        memberships
          .map((u: any) =>
            String(u.email || '')
              .toLowerCase()
              .split('@')
              .pop(),
          )
          .filter(Boolean),
      ),
    );
    const policyEntries = await Promise.all(
      uniqueDomains.map(async (domain) => {
        try {
          const { data, error } = await sb.rpc(
            'dp_resource_email_domain_policy',
            { p_email: `probe@${domain}` },
          );
          if (error) throw error;
          return [
            domain,
            {
              allowed: data?.allowed ?? null,
              matched_domain: data?.matched_domain ?? null,
            },
          ] as const;
        } catch (error) {
          return [
            domain,
            {
              allowed: null,
              matched_domain: null,
              error:
                error instanceof Error ? error.message : 'policy lookup failed',
            },
          ] as const;
        }
      }),
    );
    domainPolicies = Object.fromEntries(policyEntries);
    if (sp.userUsageId) {
      usageSelectedUser = memberships.find(
        (user: any) => user.id === sp.userUsageId,
      );
      if (usageSelectedUser) {
        const userSb = await createClient();
        const resources = await userSb.rpc('dp_admin_resource_usage_for_user', {
          p_user_id: sp.userUsageId,
          p_range: sp.userUsageRange || 'all',
        });
        if (resources.error) throw new Error('Forbidden');
        usageUserResources = resources.data || [];
      }
    }
    devTiming('admin.section_query', {
      section,
      dataset: 'users',
      ms: nowMs() - t,
    });
  } else if (section === 'analytics') {
    const range = sp.range || '30d';
    const userSb = await createClient();
    const { data = [], error } = await userSb.rpc(
      'dp_admin_resource_usage_leaderboard',
      { p_range: range, p_limit: 100 },
    );
    if (error) throw new Error('Forbidden');
    usage = data || [];
    if (sp.resourceId) {
      usageResource =
        (usage as any[]).find((r) => r.file_id === sp.resourceId) || null;
      const users = await userSb.rpc('dp_admin_resource_usage_for_resource', {
        p_file_id: sp.resourceId,
        p_range: range,
      });
      if (users.error) throw new Error('Forbidden');
      usageUsers = users.data || [];
    }
    if (sp.userId) {
      const resources = await userSb.rpc('dp_admin_resource_usage_for_user', {
        p_user_id: sp.userId,
        p_range: range,
      });
      if (resources.error) throw new Error('Forbidden');
      usageUserResources = resources.data || [];
    }
  } else if (section === 'diagnostics') {
    await sb.rpc('dp_run_platform_housekeeping').then(
      () => undefined,
      () => undefined,
    );
    const { data = [] } = await sb
      .from('dp_server_error_events')
      .select('occurred_at,level,area,message,context')
      .order('occurred_at', { ascending: false })
      .limit(50);
    diagnostics = data || [];
  } else if (section === 'activity') {
    const t = nowMs();
    let activityQuery = sb
      .from('dp_resource_activity_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });
    activityQuery = applyActivityFilters(activityQuery, sp);
    const {
      data = [],
      count = 0,
      error,
    } = await activityQuery.range(
      (activityPage - 1) * 50,
      activityPage * 50 - 1,
    );
    if (error) throw new Error(error.message);
    logs = data || [];
    activityCount = count || 0;
    devTiming('admin.section_query', {
      section,
      dataset: 'activity',
      ms: nowMs() - t,
    });
  }

  const exportQuery = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v) as [string, string][],
  ).toString();
  const configuredWarnings = (
    <>
      {!isSupabaseConfigured() ? (
        <p className="mt-4 border border-amber-200 bg-amber-50 p-4 text-amber-900">
          Supabase is not configured.
        </p>
      ) : null}
      {!isDriveConfigured() ? (
        <p className="mt-4 border border-amber-200 bg-amber-50 p-4 text-amber-900">
          Google Drive is not configured.
        </p>
      ) : null}
    </>
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
          Admin operations
        </h1>
        <AdminConsole
          currentAdminId={membership.id}
          sp={sp}
          reports={reports as any}
          tickets={tickets as any}
          memberships={memberships as any}
          domainPolicies={domainPolicies}
          logs={logs as any}
          usage={usage as any}
          usageResource={usageResource as any}
          usageUsers={usageUsers as any}
          usageUserResources={usageUserResources as any}
          usageSelectedUser={usageSelectedUser as any}
          diagnostics={diagnostics as any}
          counts={{
            report: reportCount,
            user: userCount,
            activity: activityCount,
            ticket: ticketCount,
          }}
          pages={{
            report: reportPage,
            user: userPage,
            activity: activityPage,
            ticket: ticketPage,
          }}
          sizes={{ page: pageSize, user: userSize }}
          indexPanel={<IndexSyncPanel initial={indexStatus} />}
          configuredWarnings={configuredWarnings}
          exportQuery={exportQuery}
        />
      </main>
    </>
  );
}
