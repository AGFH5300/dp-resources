const SEARCH_ALIAS_GROUPS = [
  ['economics', 'econ', 'econs'],
  [
    'environmental systems and societies',
    'environmental systems societies',
    'environmental systems',
    'ess',
  ],
  [
    'sports exercise and health science',
    'sports exercise health science',
    'sports science',
    'sehs',
  ],
  ['business management', 'business', 'bm'],
  ['computer science', 'computing', 'comp sci', 'cs'],
  ['design technology', 'design tech', 'dt'],
  ['digital society', 'digital societies', 'ds'],
  ['mathematics', 'maths', 'math'],
  ['psychology', 'psych'],
  ['geography', 'geo'],
  ['biology', 'bio'],
  ['chemistry', 'chem'],
  ['physics', 'phys'],
  ['theory of knowledge', 'tok'],
  ['extended essay', 'ee'],
  ['creativity activity service', 'creativity activity and service', 'cas'],
  ['internal assessment', 'ia'],
  ['higher level', 'hl'],
  ['standard level', 'sl'],
] as const;

function normalizeAliasText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll('&', ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function containsPhrase(value: string, phrase: string) {
  return ` ${value} `.includes(` ${phrase} `);
}

function replacePhrase(value: string, from: string, to: string) {
  return ` ${value} `.split(` ${from} `).join(` ${to} `).trim();
}

/**
 * Return the original normalized query first, followed by bounded subject/core
 * aliases. Each variant is sent through the existing token-ranked search RPC.
 */
export function expandResourceSearchAliases(value: string, limit = 12) {
  const original = normalizeAliasText(value);
  if (!original) return [];

  const variants = new Set<string>([original]);
  for (const group of SEARCH_ALIAS_GROUPS) {
    for (const alias of group) {
      if (!containsPhrase(original, alias)) continue;
      for (const replacement of group) {
        variants.add(replacePhrase(original, alias, replacement));
        if (variants.size >= limit) return [...variants];
      }
    }
  }
  return [...variants];
}

export const resourceSearchAliasGroups = SEARCH_ALIAS_GROUPS;
