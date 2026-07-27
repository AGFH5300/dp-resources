function collectSearchValues(
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
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[_–—−-]+/g, ' ')
    .replace(/[^\p{L}\p{N}@.+/]+/gu, ' ')
    .replace(/\s+/g, ' ')
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
