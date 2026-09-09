import crypto from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

export const JULY_BASE_ARCHIVE_SHA256 =
  'fc93fd8129ba7e945e11249c12fba08c565b2923074413a5835ce8935dafa5e9';

export const RV_INDEXER_V141_SHA256 =
  '53dd97bc5c6eeddb6e7fb6c063f79717c95b7b6a97d65de98933aad46fe3272a';

export const RV_FINALIZER_V102_SHA256 =
  '0696ad6cb0adc5d1f08c8f04bc652b5e5ebadeea6c06b826a60acbbf56233966';

export const RETIRED_SUBJECT_GROUPS = new Set(['ib-english-b']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RV_ORIGIN = 'https://www.revisionvillage.com';

export function isUuid(value) {
  return UUID_RE.test(String(value || '').trim());
}

export function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sha256Json(value) {
  return sha256Buffer(Buffer.from(JSON.stringify(value)));
}

export async function sha256File(file) {
  return sha256Buffer(await readFile(file));
}

export function normalizeRoute(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value), RV_ORIGIN);
    if (url.hostname !== 'www.revisionvillage.com') return null;
    url.hash = '';
    url.search = '';
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url.toString();
  } catch {
    return null;
  }
}

export function subjectGroupFromRoute(route) {
  const normalized = normalizeRoute(route);
  if (!normalized) return null;
  const match = new URL(normalized).pathname.match(/^\/(ib-[^/]+)\//i);
  return match ? match[1].toLowerCase() : null;
}

function candidateReference(row) {
  if (typeof row?.reference === 'string' && row.reference.trim()) {
    return row.reference.trim();
  }
  if (Array.isArray(row?.references)) {
    const value = row.references.find((item) => typeof item === 'string' && item.trim());
    if (value) return value.trim();
  }
  return null;
}

function candidateRoute(row) {
  const direct = normalizeRoute(row?.route);
  if (direct) return direct;
  if (Array.isArray(row?.routes)) {
    for (const item of row.routes) {
      const route = normalizeRoute(item);
      if (route) return route;
    }
  }
  return null;
}

function recursivelyCollectTargetRows(value, output, seen) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const child of value) recursivelyCollectTargetRows(child, output, seen);
    return;
  }

  const id = String(value.id || '').toLowerCase();
  const route = candidateRoute(value);
  const reference = candidateReference(value);
  const reason = String(value.reason || '').toLowerCase();
  const status = String(value.status || '').toLowerCase();

  if (
    isUuid(id) &&
    route &&
    reference &&
    !reason.includes('paper') &&
    !reason.includes('false') &&
    !status.includes('removed') &&
    !status.includes('not-found')
  ) {
    output.push({ id, reference, route });
  }

  for (const child of Object.values(value)) {
    recursivelyCollectTargetRows(child, output, seen);
  }
}

export function extractVerifiedTargets(report, { expected = 42 } = {}) {
  const collected = [];
  recursivelyCollectTargetRows(report, collected, new WeakSet());

  const byId = new Map();
  for (const row of collected) {
    const existing = byId.get(row.id);
    if (!existing) {
      byId.set(row.id, row);
      continue;
    }
    if (existing.reference !== row.reference) {
      throw new Error(
        `Verified report contains conflicting references for ${row.id}: ` +
          `${existing.reference} vs ${row.reference}`,
      );
    }
  }

  const targets = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  if (expected != null && targets.length !== expected) {
    throw new Error(
      `Expected exactly ${expected} verified Revision Village questions, found ${targets.length}. ` +
        'Refusing to continue with an ambiguous verification report.',
    );
  }
  return targets;
}

export function classifyTargets(targets) {
  const active = [];
  const quarantined = [];
  for (const target of targets) {
    const subjectGroup = subjectGroupFromRoute(target.route);
    const row = { ...target, subjectGroup };
    if (RETIRED_SUBJECT_GROUPS.has(subjectGroup)) {
      quarantined.push({
        ...row,
        quarantineReason: 'retired-subject-group',
      });
    } else {
      active.push(row);
    }
  }
  return { active, quarantined };
}

export function extractNextData(html) {
  const source = String(html || '');
  const match = source.match(
    /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`Unable to parse __NEXT_DATA__: ${error.message}`);
  }
}

function collectExplicitQuestions(value, output, seen, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 40) return;
  if (seen.has(value)) return;
  seen.add(value);

  if (!Array.isArray(value) && Array.isArray(value.questions)) {
    for (const question of value.questions) {
      if (!question || typeof question !== 'object') continue;
      const id = String(question.id || '').toLowerCase();
      if (!isUuid(id)) continue;
      if (
        typeof question.content !== 'string' &&
        typeof question.markScheme !== 'string' &&
        typeof question.mark_scheme !== 'string'
      ) {
        continue;
      }
      output.push(question);
    }
  }

  if (Array.isArray(value)) {
    for (const child of value) collectExplicitQuestions(child, output, seen, depth + 1);
  } else {
    for (const child of Object.values(value)) {
      collectExplicitQuestions(child, output, seen, depth + 1);
    }
  }
}

export function explicitQuestionsFromNextData(nextData) {
  const rows = [];
  collectExplicitQuestions(nextData, rows, new WeakSet());
  const byId = new Map();
  for (const row of rows) {
    const id = String(row.id).toLowerCase();
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, row);
      continue;
    }
    const left = JSON.stringify(existing);
    const right = JSON.stringify(row);
    if (left !== right) {
      throw new Error(`Question ${id} appears with conflicting explicit question payloads.`);
    }
  }
  return [...byId.values()];
}

export function sourceQuestionId(row) {
  const value = row?.id || row?.questionId || row?.sourceQuestionId || row?.source_question_id;
  return isUuid(value) ? String(value).toLowerCase() : null;
}

export function strictQuestionSignature(question) {
  return sha256Json({
    reference: String(question?.reference || '').trim(),
    content: String(question?.content || question?.markdownContent || '').trim(),
    markScheme: String(question?.markScheme || question?.mark_scheme || '').trim(),
    maximumMark: question?.maximumMark ?? question?.maximum_mark ?? null,
  });
}

export function assertDecryptedQuestion(question) {
  const id = sourceQuestionId(question) || '<unknown>';
  const content = String(question?.content || '');
  const markScheme = String(question?.markScheme || question?.mark_scheme || '');
  if (!content.trim()) throw new Error(`Question ${id} has empty decrypted content.`);
  if (content.startsWith('U2FsdGVk')) {
    throw new Error(`Question ${id} content is still encrypted.`);
  }
  if (markScheme.startsWith('U2FsdGVk')) {
    throw new Error(`Question ${id} mark scheme is still encrypted.`);
  }
}

export async function readNdjson(file) {
  const source = await readFile(file, 'utf8');
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid NDJSON at ${file}:${index + 1}: ${error.message}`);
      }
    });
}

export async function writeNdjson(file, rows) {
  const body = rows.map((row) => JSON.stringify(row)).join('\n');
  await writeFile(file, body ? `${body}\n` : '', 'utf8');
}
