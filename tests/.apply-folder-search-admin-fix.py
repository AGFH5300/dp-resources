from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, content: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(content)


def replace_required(path: str, old: str, new: str) -> None:
    text = read(path)
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one replacement target, found {count}')
    write(path, text.replace(old, new, 1))


# Never reuse ticket/report-local drafts or conversation state between cases.
replace_required(
    'app/admin/admin-console.tsx',
    """        <CaseInspector
          kind={selected.kind}
""",
    """        <CaseInspector
          key={`${selected.kind}:${selected.item.id}`}
          kind={selected.kind}
""",
)

# Add the folder-scoped search entry point to non-root Library folders.
replace_required(
    'app/library/page.tsx',
    """import { FavoritesProvider } from '@/components/favorites-provider';
""",
    """import { FavoritesProvider } from '@/components/favorites-provider';
import { FolderSearchButton } from '@/components/folder-search-button';
""",
)
replace_required(
    'app/library/page.tsx',
    """          <FavoritesProvider initialSavedIds={favoriteIds}>
            <LibraryBrowser
""",
    """          <FavoritesProvider initialSavedIds={favoriteIds}>
            {crumbs.length > 1 && (
              <div className="mb-3 flex justify-end">
                <FolderSearchButton
                  folderId={crumbs[crumbs.length - 1].id}
                  folderName={crumbs[crumbs.length - 1].name}
                />
              </div>
            )}
            <LibraryBrowser
""",
)

# Reuse the existing search dialog with an optional recursive folder scope.
replace_required(
    'components/global-search.tsx',
    """type IndexState = 'unknown' | 'ready' | 'empty' | 'preparing' | 'updating';
""",
    """type IndexState = 'unknown' | 'ready' | 'empty' | 'preparing' | 'updating';
type SearchScope = {
  folderId: string;
  folderName: string;
} | null;
""",
)
replace_required(
    'components/global-search.tsx',
    """  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
""",
    """  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<SearchScope>(null);
  const [q, setQ] = useState('');
""",
)
replace_required(
    'components/global-search.tsx',
    """  const resetSearch = () => {
    clearState();
    setOpen(false);
  };
  const openSearch = () => {
    clearState();
    setOpen(true);
  };
  const close = resetSearch;
  useEffect(() => {
    const f = () => openSearch();
    window.addEventListener('dp:open-search', f);
    return () => window.removeEventListener('dp:open-search', f);
  }, []);
""",
    """  const resetSearch = () => {
    clearState();
    setScope(null);
    setOpen(false);
  };
  const openSearch = () => {
    clearState();
    setScope(null);
    setOpen(true);
  };
  const openFolderSearch = (nextScope: Exclude<SearchScope, null>) => {
    clearState();
    setScope(nextScope);
    setOpen(true);
  };
  const close = resetSearch;
  useEffect(() => {
    const openLibrary = () => openSearch();
    const openFolder = (event: Event) => {
      const detail = (event as CustomEvent<Exclude<SearchScope, null>>).detail;
      if (!detail?.folderId || !detail.folderName) return;
      openFolderSearch(detail);
    };
    window.addEventListener('dp:open-search', openLibrary);
    window.addEventListener('dp:open-folder-search', openFolder);
    return () => {
      window.removeEventListener('dp:open-search', openLibrary);
      window.removeEventListener('dp:open-folder-search', openFolder);
    };
  }, []);
""",
)
replace_required(
    'components/global-search.tsx',
    """        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ac.signal,
        });
""",
    """        const params = new URLSearchParams({ q });
        if (scope?.folderId) params.set('folderId', scope.folderId);
        const res = await fetch(`/api/search?${params.toString()}`, {
          signal: ac.signal,
        });
""",
)
replace_required(
    'components/global-search.tsx',
    """  }, [q, open, retryNonce]);
""",
    """  }, [q, open, retryNonce, scope?.folderId]);
""",
)
replace_required(
    'components/global-search.tsx',
    """            placeholder="Search files, folders, and paths"
""",
    """            placeholder={
              scope ? `Search in ${scope.folderName}` : 'Search files, folders, and paths'
            }
""",
)
replace_required(
    'components/global-search.tsx',
    """                Search files, folders, and paths
              </p>
              <p className="mt-1 text-xs text-[color:var(--dp-ink)]/60">
                Type at least two characters.
""",
    """                {scope
                  ? `Search in ${scope.folderName}`
                  : 'Search files, folders, and paths'}
              </p>
              <p className="mt-1 text-xs text-[color:var(--dp-ink)]/60">
                {scope
                  ? 'Type at least two characters to search this folder and its subfolders.'
                  : 'Type at least two characters.'}
""",
)
replace_required(
    'components/global-search.tsx',
    """              {slow ? 'Still searching…' : 'Searching your library…'}
""",
    """              {slow
                ? 'Still searching…'
                : scope
                  ? `Searching ${scope.folderName}…`
                  : 'Searching your library…'}
""",
)
replace_required(
    'components/global-search.tsx',
    """                    No matching resources
                  </p>
                  <p className="mt-1 text-xs">
                    Try a subject, topic, paper, year, or filename.
""",
    """                    {scope
                      ? 'No matching resources in this folder'
                      : 'No matching resources'}
                  </p>
                  <p className="mt-1 text-xs">
                    {scope
                      ? 'Try a unit, topic, year, or filename.'
                      : 'Try a subject, topic, paper, year, or filename.'}
""",
)
replace_required(
    'components/global-search.tsx',
    """              <Link
                onClick={resetSearch}
                href={`/search?q=${encodeURIComponent(q)}`}
                className="dp-search-view-all block rounded-md border p-2 text-center text-sm font-medium text-[color:var(--dp-navy)] hover:bg-slate-50"
              >
                View all results
              </Link>
""",
    """              {scope ? (
                <button
                  type="button"
                  onClick={() => setScope(null)}
                  className="dp-search-view-all block w-full rounded-md border p-2 text-center text-sm font-medium text-[color:var(--dp-navy)] hover:bg-slate-50"
                >
                  Search the whole library instead
                </button>
              ) : (
                <Link
                  onClick={resetSearch}
                  href={`/search?q=${encodeURIComponent(q)}`}
                  className="dp-search-view-all block rounded-md border p-2 text-center text-sm font-medium text-[color:var(--dp-navy)] hover:bg-slate-50"
                >
                  View all results
                </Link>
              )}
""",
)
replace_required(
    'components/global-search.tsx',
    """            ↑↓ navigate · Enter open · Esc close
""",
    """            {scope ? `${scope.folderName} and subfolders · ` : ''}↑↓ navigate · Enter open · Esc close
""",
)

# Scope the API call and cache key to the current folder when provided.
replace_required(
    'app/api/search/route.ts',
    """  const q = new URL(req.url).searchParams.get('q') || '';
  const needle = normalizeResourceName(q).slice(0, 120);
""",
    """  const url = new URL(req.url);
  const q = url.searchParams.get('q') || '';
  const folderId = (url.searchParams.get('folderId') || '')
    .trim()
    .slice(0, 200);
  const needle = normalizeResourceName(q).slice(0, 120);
""",
)
replace_required(
    'app/api/search/route.ts',
    """  const key = needle.toLowerCase();
""",
    """  const key = `${folderId || 'library'}:${needle.toLowerCase()}`;
""",
)
replace_required(
    'app/api/search/route.ts',
    """    searchVariants.map((searchQuery) =>
      sb.rpc('dp_search_resources', {
        search_query: searchQuery,
        result_limit: 50,
      }),
    ),
""",
    """    searchVariants.map((searchQuery) =>
      folderId
        ? sb.rpc('dp_search_resources_in_folder', {
            search_query: searchQuery,
            folder_drive_file_id: folderId,
            result_limit: 50,
          })
        : sb.rpc('dp_search_resources', {
            search_query: searchQuery,
            result_limit: 50,
          }),
    ),
""",
)

# Keep the fallback changelog current even when GitHub is temporarily unavailable.
replace_required(
    'lib/changelog.ts',
    """const historicalSummaries: Record<string, string[]> = {
  '2026-07-25': [
""",
    """const historicalSummaries: Record<string, string[]> = {
  '2026-07-28': [
    'Added quick search inside the current Library folder and all of its subfolders.',
    'Fixed the admin case inspector so replies, messages, and draft changes never carry over when switching between support tickets or resource reports.',
    'Corrected support notification counts, added General inquiry, improved Content feedback in dark mode, and added a bulk mark-as-read action.',
  ],
  '2026-07-25': [
""",
)

write(
    'components/folder-search-button.tsx',
    """'use client';

import { Search } from 'lucide-react';

export function FolderSearchButton({
  folderId,
  folderName,
}: {
  folderId: string;
  folderName: string;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent('dp:open-folder-search', {
            detail: { folderId, folderName },
          }),
        )
      }
      className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      aria-label={`Search inside ${folderName}`}
    >
      <Search className="size-4" aria-hidden="true" />
      Search this folder
    </button>
  );
}
""",
)

write(
    'supabase/migrations/20260728153000_folder_scoped_resource_search.sql',
    """create or replace function public.dp_search_resources_in_folder(
  search_query text,
  folder_drive_file_id text,
  result_limit integer default 50
)
returns table (
  drive_file_id text,
  parent_drive_file_id text,
  name text,
  normalized_name text,
  path text,
  mime_type text,
  is_folder boolean,
  size_bytes bigint,
  modified_at timestamptz,
  indexed_at timestamptz,
  rank_score numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_limit integer := least(greatest(coalesce(result_limit, 50), 1), 50);
  tokens text[];
  prefix_query tsquery;
  phrase text := lower(btrim(coalesce(search_query, '')));
  scoped_path text;
begin
  select resource.path into scoped_path
  from public.dp_resource_index as resource
  where resource.drive_file_id = folder_drive_file_id
    and resource.is_folder = true
  limit 1;

  if scoped_path is null then
    return;
  end if;

  select array_agg(token) into tokens
  from regexp_split_to_table(phrase, '[^[:alnum:]]+') as token
  where length(token) >= 2
    and token not in ('the', 'and', 'for', 'with', 'from');

  if tokens is null or array_length(tokens, 1) is null then
    return;
  end if;

  select to_tsquery(
    'simple',
    string_agg(quote_literal(token) || ':*', ' & ')
  ) into prefix_query
  from unnest(tokens) as token;

  return query
  select
    resource.drive_file_id,
    resource.parent_drive_file_id,
    resource.name,
    resource.normalized_name,
    resource.path,
    resource.mime_type,
    resource.is_folder,
    resource.size_bytes,
    resource.modified_at,
    resource.indexed_at,
    (
      case when resource.is_folder and lower(resource.name) = phrase then 1000 else 0 end +
      case when not resource.is_folder and lower(resource.name) = phrase then 900 else 0 end +
      case when resource.is_folder and lower(resource.name) like phrase || '%' then 800 else 0 end +
      case when not resource.is_folder and lower(resource.name) like phrase || '%' then 700 else 0 end +
      ts_rank_cd(resource.search_vector, prefix_query) * 100 +
      case when resource.is_folder then 25 else 0 end -
      greatest(
        array_length(regexp_split_to_array(resource.path, ' / '), 1) -
          array_length(regexp_split_to_array(scoped_path, ' / '), 1),
        0
      )
    )::numeric as rank_score
  from public.dp_resource_index as resource
  where resource.search_vector @@ prefix_query
    and left(resource.path, char_length(scoped_path) + 3) = scoped_path || ' / '
  order by rank_score desc, resource.is_folder desc, resource.name asc
  limit safe_limit;
end;
$$;

revoke all on function public.dp_search_resources_in_folder(text, text, integer) from public;
revoke all on function public.dp_search_resources_in_folder(text, text, integer) from anon;
revoke all on function public.dp_search_resources_in_folder(text, text, integer) from authenticated;
grant execute on function public.dp_search_resources_in_folder(text, text, integer) to service_role;
""",
)

write(
    'tests/folder-search-admin-state.test.ts',
    """import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('folder-scoped library search', () => {
  const button = read('components/folder-search-button.tsx');
  const page = read('app/library/page.tsx');
  const search = read('components/global-search.tsx');
  const route = read('app/api/search/route.ts');
  const migration = read(
    'supabase/migrations/20260728153000_folder_scoped_resource_search.sql',
  );

  it('adds a visible search action inside non-root folders', () => {
    expect(page).toContain('crumbs.length > 1');
    expect(page).toContain('<FolderSearchButton');
    expect(button).toContain("new CustomEvent('dp:open-folder-search'");
    expect(button).toContain('Search this folder');
  });

  it('opens the shared search dialog with the current folder scope', () => {
    expect(search).toContain("addEventListener('dp:open-folder-search'");
    expect(search).toContain("params.set('folderId', scope.folderId)");
    expect(search).toContain('search this folder and its subfolders');
    expect(search).toContain('Search the whole library instead');
  });

  it('uses a service-role-only recursive folder search RPC', () => {
    expect(route).toContain("url.searchParams.get('folderId')");
    expect(route).toContain("sb.rpc('dp_search_resources_in_folder'");
    expect(route).toContain("`${folderId || 'library'}:${needle.toLowerCase()}`");
    expect(migration).toContain('dp_search_resources_in_folder');
    expect(migration).toContain("scoped_path || ' / '");
    expect(migration).toContain('grant execute on function');
    expect(migration).toContain('to service_role');
  });
});

describe('admin case inspector isolation', () => {
  it('remounts local drafts and messages for every selected case', () => {
    const admin = read('app/admin/admin-console.tsx');
    expect(admin).toContain('key={`${selected.kind}:${selected.item.id}`}');
  });
});
""",
)

# Restore the repository's normal CI definition; temporary patch workflows delete themselves.
write(
    '.github/workflows/ci.yml',
    """name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run lint
      - run: npm run build
      - run: npm audit --omit=dev --audit-level=high
""",
)
