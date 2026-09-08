import type { ChangelogEntry } from './changelog';

const INTERNAL_ONLY_PATTERNS = [
  /\badmin(?:istrator|istrators|s)?\b/i,
  /\bdeployment\b/i,
  /\bdiagnostics?\b/i,
  /\bmigrations?\b/i,
  /\bdatabase\b/i,
  /\bsupabase\b/i,
  /\bcloudflare\b/i,
  /\bservice role\b/i,
  /\boperations console\b/i,
  /\bproduction runtime\b/i,
  /\bnon-root\b/i,
  /\bbuild automation\b/i,
  /\bclient-bundle\b/i,
  /\bapi-key\b/i,
  /\blibrary[-\s]+index(?:ing)?\b/i,
];

export function isPublicChangelogEntry(entry: ChangelogEntry) {
  const searchable = `${entry.id} ${entry.summary}`;
  return !INTERNAL_ONLY_PATTERNS.some((pattern) => pattern.test(searchable));
}

export function publicChangelogEntries(entries: ChangelogEntry[]) {
  return entries.filter(isPublicChangelogEntry);
}
