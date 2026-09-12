import { normalizeResourceName } from '@/lib/resource-utils';
import { expandResourceSearchAliases } from '@/lib/search-aliases';

function tokens(value: string) {
  return normalizeResourceName(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function tokenMatches(candidate: string, queryToken: string) {
  if (/^\d+$/.test(queryToken)) return candidate === queryToken;
  return candidate === queryToken || candidate.startsWith(queryToken);
}

/** Folder search acts as a filter, so every query token must be represented. */
export function matchesScopedResourceQuery(
  row: { name?: string | null; path?: string | null },
  query: string,
) {
  const haystack = tokens(`${row.name || ''} ${row.path || ''}`);
  if (!haystack.length) return false;

  return expandResourceSearchAliases(query).some((variant) => {
    const queryTokens = tokens(variant);
    return (
      queryTokens.length > 0 &&
      queryTokens.every((queryToken) =>
        haystack.some((candidate) => tokenMatches(candidate, queryToken)),
      )
    );
  });
}
