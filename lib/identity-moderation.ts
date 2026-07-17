import 'server-only';

export type IdentityReasonCode =
  | 'identity_not_allowed'
  | 'invalid_format'
  | 'reserved_name';
export type IdentityCheck =
  | { ok: true }
  | { ok: false; reason: IdentityReasonCode };

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;
const RESERVED_CANONICAL = new Set([
  'admin',
  'support',
  'moderator',
  'system',
  'official',
  'dpresources',
  'dpresource',
  'dp',
  'dpadmin',
  'dpsupport',
  'dp_resources',
  'dpresourcesofficial',
]);
const RESERVED_PATTERNS = [
  /^dp_*resources?_*admin/i,
  /^dp_*resources?_*official/i,
  /^admin_*dp/i,
  /^official_*dp/i,
];
const ZERO_WIDTH_CONTROL =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u2028-\u202f\u205f-\u206f\u3000\ufeff]/gu;
const SEPARATORS = /[\s._\-–—~`´'’‘"“”^*+=[\]{}()|\\/:;,!¡?¿<>]+/gu;
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '|': 'i',
  '3': 'e',
  '4': 'a',
  '@': 'a',
  '5': 's',
  $: 's',
  '7': 't',
  '+': 't',
  '8': 'b',
  '9': 'g',
};

// Deliberately server-only and generic at call sites. Keep concise but broad for school-platform identity abuse.
const SEVERE_TERMS = [
  'nigger',
  'nigga',
  'kike',
  'chink',
  'gook',
  'spic',
  'wetback',
  'raghead',
  'paki',
  'coon',
  'faggot',
  'tranny',
  'nazi',
  'hitler',
  'kkk',
  'heilhitler',
  'whitepower',
  'aryanbrotherhood',
  'isis',
  'alqaeda',
  'taliban',
  'rape',
  'rapist',
  'terrorist',
  'schoolshooter',
];
const PROHIBITED = [
  'nigger',
  'nigga',
  'kike',
  'chink',
  'gook',
  'spic',
  'wetback',
  'raghead',
  'paki',
  'coon',
  'faggot',
  'tranny',
  'nazi',
  'hitler',
  'kkk',
  'heilhitler',
  'whitepower',
  'aryanbrotherhood',
  'isis',
  'alqaeda',
  'taliban',
  'fuck',
  'fucker',
  'shit',
  'bitch',
  'cunt',
  'whore',
  'slut',
  'dick',
  'cock',
  'pussy',
  'porn',
  'sex',
  'cum',
  'jizz',
  'rape',
  'rapist',
  'kill',
  'murder',
  'terrorist',
  'bomb',
  'schoolshooter',
  'massacre',
];
const PHRASES = [
  'white power',
  'heil hitler',
  'gas jews',
  'kill all',
  'school shooter',
];

export function normalizeIdentityForModeration(value: string) {
  const normalized = value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(ZERO_WIDTH_CONTROL, '');
  const spaced = normalized
    .replace(SEPARATORS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const compact = spaced.replace(/\s/g, '');
  const deleeted = compact.replace(/[0134578!|@$+9]/g, (ch) => LEET[ch] ?? ch);
  const words = spaced
    .split(' ')
    .filter(Boolean)
    .map((word) => word.replace(/[0134578!|@$+9]/g, (ch) => LEET[ch] ?? ch));
  return { normalized, spaced, compact, deleeted, words };
}

function hasProhibited(value: string) {
  const mod = normalizeIdentityForModeration(value);
  if (
    PHRASES.some(
      (phrase) =>
        mod.spaced.includes(phrase) ||
        mod.deleeted.includes(phrase.replace(/\s/g, '')),
    )
  )
    return true;
  if (mod.words.some((word) => PROHIBITED.includes(word))) return true;
  return SEVERE_TERMS.some(
    (term) =>
      mod.deleeted === term ||
      mod.deleeted.startsWith(term) ||
      mod.deleeted.endsWith(term),
  );
}

export function emailLocalPart(email: string) {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

export function validateUsernameIdentity(username: string): IdentityCheck {
  const trimmed = username.trim();
  if (
    !USERNAME_PATTERN.test(trimmed) ||
    trimmed.startsWith('_') ||
    trimmed.endsWith('_') ||
    trimmed.includes('__')
  )
    return { ok: false, reason: 'invalid_format' };
  const canonical = trimmed.toLocaleLowerCase().replace(/_+/g, '');
  if (
    RESERVED_CANONICAL.has(trimmed.toLocaleLowerCase()) ||
    RESERVED_CANONICAL.has(canonical) ||
    RESERVED_PATTERNS.some((p) => p.test(trimmed))
  )
    return { ok: false, reason: 'reserved_name' };
  if (hasProhibited(trimmed))
    return { ok: false, reason: 'identity_not_allowed' };
  return { ok: true };
}

export function validateFullNameIdentity(name: string): IdentityCheck {
  const trimmed = name.normalize('NFKC').trim();
  if (!trimmed || trimmed.length > 120 || ZERO_WIDTH_CONTROL.test(trimmed))
    return { ok: false, reason: 'invalid_format' };
  if (/https?:\/\/|www\.|\S+@\S+\.\S+/i.test(trimmed))
    return { ok: false, reason: 'invalid_format' };
  if (!/[\p{L}]/u.test(trimmed) || /^[^\p{L}]+$/u.test(trimmed))
    return { ok: false, reason: 'invalid_format' };
  if (!/^[\p{L}\p{M}][\p{L}\p{M}\s'’\-\.]{0,118}[\p{L}\p{M}\.]$/u.test(trimmed))
    return { ok: false, reason: 'invalid_format' };
  if (/(.)\1{5,}/u.test(trimmed))
    return { ok: false, reason: 'invalid_format' };
  if (hasProhibited(trimmed))
    return { ok: false, reason: 'identity_not_allowed' };
  return { ok: true };
}

export function validateEmailLocalPartIdentity(email: string): IdentityCheck {
  const local = emailLocalPart(email);
  if (!local) return { ok: false, reason: 'invalid_format' };
  if (hasProhibited(local))
    return { ok: false, reason: 'identity_not_allowed' };
  return { ok: true };
}

export function auditIdentityRecord(record: {
  id: string;
  username?: string | null;
  full_name?: string | null;
  email?: string | null;
}) {
  const reasons = new Set<IdentityReasonCode>();
  if (record.username) {
    const r = validateUsernameIdentity(record.username);
    if (!r.ok) reasons.add(r.reason);
  }
  if (record.full_name) {
    const r = validateFullNameIdentity(record.full_name);
    if (!r.ok) reasons.add(r.reason);
  }
  if (record.email) {
    const r = validateEmailLocalPartIdentity(record.email);
    if (!r.ok) reasons.add(r.reason);
  }
  return reasons.size ? { id: record.id, reasons: [...reasons] } : null;
}

export function logIdentityRejection(
  route: string,
  reason: IdentityReasonCode,
) {
  if (process.env.NODE_ENV === 'development')
    console.log('[identity-moderation]', {
      route,
      reason,
      at: new Date().toISOString(),
    });
}
