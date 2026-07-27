#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';

async function replaceOnce(path, before, after, label) {
  const source = await readFile(path, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one match in ${path}, found ${count}`);
  }
  await writeFile(path, source.replace(before, after));
}

async function replaceBetween(path, start, end, replacement, label) {
  const source = await readFile(path, 'utf8');
  const startIndex = source.indexOf(start);
  if (startIndex < 0) throw new Error(`${label}: start marker not found in ${path}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex < 0) throw new Error(`${label}: end marker not found in ${path}`);
  const next = `${source.slice(0, startIndex)}${replacement}${source.slice(endIndex)}`;
  await writeFile(path, next);
}

await writeFile(
  'lib/admin-content-search.ts',
  `function collectSearchValues(
  value: unknown,
  output: string[],
  seen: WeakSet<object>,
) {
  if (value === null || value === undefined) return;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    output.push(String(value));
    return;
  }
  if (value instanceof Date) {
    output.push(value.toISOString(), value.toLocaleString('en-US'));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectSearchValues(entry, output, seen));
    return;
  }
  if (typeof value === 'object') {
    if (seen.has(value)) return;
    seen.add(value);
    Object.values(value).forEach((entry) =>
      collectSearchValues(entry, output, seen),
    );
  }
}

export function normalizeAdminSearch(value: unknown) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\\p{M}/gu, '')
    .toLowerCase()
    .replace(/[_–—−-]+/g, ' ')
    .replace(/[^\\p{L}\\p{N}@.+/]+/gu, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

export function matchesAdminContentSearch(
  query: string | null | undefined,
  ...values: unknown[]
) {
  const normalizedQuery = normalizeAdminSearch(query);
  if (!normalizedQuery) return true;
  const collected: string[] = [];
  const seen = new WeakSet<object>();
  values.forEach((value) => collectSearchValues(value, collected, seen));
  const haystack = normalizeAdminSearch(collected.join(' '));
  return normalizedQuery
    .split(' ')
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}
`,
);

await replaceOnce(
  'app/admin/admin-console.tsx',
  `  const apply = useLiveParams(sp, section);
  const [email, setEmail] = useState(sp[\`\${prefix}Email\`] || ''),
    [search, setSearch] = useState(sp[\`\${prefix}Search\`] || '');
  useEffect(() => {
    const t = setTimeout(
      () =>
        apply({ [\`\${prefix}Email\`]: email, [\`\${prefix}Search\`]: search }, [
          \`\${prefix}Page\`,
        ]),
      300,
    );
    return () => clearTimeout(t);
  }, [email, search]);`,
  `  const apply = useLiveParams(sp, section);
  const [search, setSearch] = useState(
    sp[\`\${prefix}Search\`] || sp[\`\${prefix}Email\`] || '',
  );
  useEffect(() => {
    const t = setTimeout(
      () =>
        apply(
          { [\`\${prefix}Search\`]: search, [\`\${prefix}Email\`]: '' },
          [\`\${prefix}Page\`],
        ),
      300,
    );
    return () => clearTimeout(t);
  }, [search]);`,
  'unify report and ticket search state',
);

await replaceOnce(
  'app/admin/admin-console.tsx',
  `      <EmailSearchInput
        label="Reporter email"
        value={email}
        onChange={setEmail}
      />
      <Field label={prefix === 'report' ? 'Resource / path' : 'Subject'}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputClass}
        />
      </Field>`,
  `      <div className="md:col-span-2">
        <Field label={prefix === 'report' ? 'Search reports' : 'Search tickets'}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              prefix === 'report'
                ? 'Name, username, email, resource, message, notes…'
                : 'Name, username, email, subject, message, replies…'
            }
            className={inputClass}
          />
        </Field>
      </div>`,
  'replace report and ticket email fields with unified search',
);

await replaceOnce(
  'app/admin/admin-console.tsx',
  `  const apply = useLiveParams(sp, 'users');
  const [email, setEmail] = useState(sp.userEmail || '');
  useEffect(() => {
    const t = setTimeout(() => apply({ userEmail: email }, ['userPage']), 300);
    return () => clearTimeout(t);
  }, [email]);`,
  `  const apply = useLiveParams(sp, 'users');
  const [search, setSearch] = useState(sp.userSearch || sp.userEmail || '');
  useEffect(() => {
    const t = setTimeout(
      () => apply({ userSearch: search, userEmail: '' }, ['userPage']),
      300,
    );
    return () => clearTimeout(t);
  }, [search]);`,
  'unify user search state',
);

await replaceOnce(
  'app/admin/admin-console.tsx',
  `      <EmailSearchInput label="User email" value={email} onChange={setEmail} />`,
  `      <Field label="Search users">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Full name, username, email, role, status…"
          className={inputClass}
        />
      </Field>`,
  'replace user email search with unified search',
);

await replaceOnce(
  'app/admin/admin-console.tsx',
  `          apply({ userEmail: '', role: '', userSize: '' }, ['userPage'])`,
  `          apply(
            { userSearch: '', userEmail: '', role: '', userSize: '' },
            ['userPage'],
          )`,
  'clear unified user search',
);

await replaceOnce(
  'app/admin/page.tsx',
  `import { applyActivityFilters } from '@/lib/admin-filters';`,
  `import { applyActivityFilters } from '@/lib/admin-filters';
import { matchesAdminContentSearch } from '@/lib/admin-content-search';`,
  'admin content search import',
);

await replaceOnce(
  'app/admin/page.tsx',
  `function statusRank(s: string) {
  return s === 'open' ? 0 : s === 'in_review' ? 1 : s === 'resolved' ? 2 : 3;
}
`,
  `function statusRank(s: string) {
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
`,
  'admin content search helpers',
);

await replaceBetween(
  'app/admin/page.tsx',
  `  async function queue(`,
  `

  if (section === 'index') {`,
  `  async function queue(
    table: 'dp_resource_reports' | 'dp_support_tickets',
    prefix: string,
    page: number,
  ) {
    const t = nowMs();
    const term = String(
      sp[\`\${prefix}Search\`] || sp[\`\${prefix}Email\`] || '',
    ).trim();
    const makeQuery = (withCount = false) => {
      let query: any = sb
        .from(table)
        .select('*', withCount ? { count: 'exact' } : undefined);
      if (sp[\`\${prefix}Status\`]) {
        query = query.eq('status', sp[\`\${prefix}Status\`]);
      }
      if (sp[\`\${prefix}From\`]) {
        query = query.gte('created_at', sp[\`\${prefix}From\`]);
      }
      if (sp[\`\${prefix}To\`]) {
        query = query.lte('created_at', \`\${sp[\`\${prefix}To\`]}T23:59:59\`);
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
  }`,
  'replace queue filtering with unified content search',
);

await replaceBetween(
  'app/admin/page.tsx',
  `  } else if (section === 'users') {`,
  `    const uniqueDomains = Array.from(`,
  `  } else if (section === 'users') {
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
    const uniqueDomains = Array.from(`,
  'replace user email filtering with unified content search',
);

await replaceOnce(
  'tests/support-admin-search.test.ts',
  `  it('email search endpoint is admin-only and the shared input is used in all admin sections', () => {
    expect(read('app/api/admin/users/search/route.ts')).toContain(
      'requireAdmin',
    );
    const admin = read('app/admin/admin-console.tsx');
    expect(
      (admin.match(/EmailSearchInput/g) || []).length,
    ).toBeGreaterThanOrEqual(4);
    expect(admin).not.toContain('Filter</button>');
    expect(admin).toContain('router.replace');
    expect(admin).toContain("q.set(k, '1')");
  });`,
  `  it('keeps the email autocomplete admin-only while reports, tickets, and users use unified search', () => {
    expect(read('app/api/admin/users/search/route.ts')).toContain(
      'requireAdmin',
    );
    const admin = read('app/admin/admin-console.tsx');
    expect((admin.match(/<EmailSearchInput/g) || []).length).toBe(1);
    expect(admin).toContain('Search reports');
    expect(admin).toContain('Search tickets');
    expect(admin).toContain('Search users');
    expect(admin).not.toContain('label="Reporter email"');
    expect(admin).not.toContain('Filter</button>');
    expect(admin).toContain('router.replace');
    expect(admin).toContain("q.set(k, '1')");
  });`,
  'update admin search regression expectations',
);

await writeFile(
  'tests/admin-unified-content-search.test.ts',
  `import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  matchesAdminContentSearch,
  normalizeAdminSearch,
} from '../lib/admin-content-search';

const adminPage = readFileSync('app/admin/page.tsx', 'utf8');
const adminConsole = readFileSync('app/admin/admin-console.tsx', 'utf8');

describe('admin unified content search', () => {
  it('normalizes accents and matches every query token across different fields', () => {
    expect(normalizeAdminSearch('  José — ECON_User  ')).toBe(
      'jose econ user',
    );
    expect(
      matchesAdminContentSearch(
        'ansh broken pdf',
        { full_name: 'Ansh Gupta', username: 'agfh5300' },
        { message: 'The PDF preview is broken on mobile.' },
      ),
    ).toBe(true);
    expect(
      matchesAdminContentSearch('revision village', {
        subject: 'Question bank issue',
        message: 'Save My Exams resource',
      }),
    ).toBe(false);
  });

  it('uses one broad search field in reports, tickets, and users', () => {
    expect(adminConsole).toContain('Search reports');
    expect(adminConsole).toContain('Search tickets');
    expect(adminConsole).toContain('Search users');
    expect(adminConsole).toContain('Name, username, email, resource, message, notes…');
    expect(adminConsole).toContain('Name, username, email, subject, message, replies…');
    expect(adminConsole).toContain('Full name, username, email, role, status…');
  });

  it('searches queue text, reporter/admin identities, and support replies before pagination', () => {
    expect(adminPage).toContain('matchesAdminContentSearch(');
    expect(adminPage).toContain('loadIdentityMap');
    expect(adminPage).toContain('loadTicketMessageMap');
    expect(adminPage).toContain(".from('dp_support_ticket_messages')");
    expect(adminPage).toContain("row.assigned_to ? '' : 'unassigned'");
    expect(adminPage).toContain('const data = filtered.slice(start, start + pageSize)');
  });

  it('loads and enriches all matching users before applying user pagination', () => {
    expect(adminPage).toContain("sp.userSearch || sp.userEmail");
    expect(adminPage).toContain('user.full_name');
    expect(adminPage).toContain('user.username');
    expect(adminPage).toContain('user.email');
    expect(adminPage).toContain("'suspended inactive blocked'");
    expect(adminPage).toContain('memberships = filtered.slice(start, start + userSize)');
  });
});
`,
);
