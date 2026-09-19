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
  /\breconcil(?:e|ed|ing|iation)\b/i,
  /\bimported images?\b/i,
  /\bimage references?\b/i,
  /\bthird[- ]party (?:sites?|sources?|images?)\b/i,
  /\bprivate (?:asset|storage)\b/i,
  /\basset pipeline\b/i,
  /\bverified (?:optimized|compressed) copies\b/i,
  /\bmeaningfully smaller\b/i,
  /\bsource references?\b/i,
  /\bupstream object\b/i,
  /\bquarantin(?:e|ed|ing)\b/i,
  /\b(?:ready|live|unique) variants?\b/i,
  /\bquestion-source rows?\b/i,
  /\bvariant-source rows?\b/i,
  /\bcanonical (?:questions?|rows?)\b/i,
  /\bprovenance\b/i,
  /\bobject storage\b/i,
  /\bhotlinks?\b/i,
];

export function isPublicChangelogEntry(entry: ChangelogEntry) {
  const searchable = entry.summary;
  return !INTERNAL_ONLY_PATTERNS.some((pattern) => pattern.test(searchable));
}

export function publicChangelogEntries(entries: ChangelogEntry[]) {
  return entries.filter(isPublicChangelogEntry);
}
