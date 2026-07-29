import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { opendir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SENSITIVE_HEADER = /^(?:authorization|cookie|set-cookie|proxy-authorization|x-api-key|x-csrf-token|x-xsrf-token)$/i;
const SENSITIVE_KEY = /(?:^|[_-])(?:access|auth|authorization|bearer|cookie|csrf|email|jwt|key|password|refresh|secret|session|token|xsrf)(?:$|[_-])/i;
const QUESTION_REFERENCE_PATTERNS = [
  /\b[A-Z][A-Z0-9-]{2,}\/\d+(?:_[A-Z]{2})?_(?:Summer|Winter|Spring)_\d{4}_Q\d+\b/gi,
  /\b[A-Z][A-Z0-9-]{2,}\/\d+(?:_[A-Z]{2})?_[A-Za-z]+_\d{4}_Q\d+\b/gi,
  /\bexam-mate\s+QID\d+\b/gi,
];

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

export function stableJson(value) {
  const seen = new WeakSet();
  const normalize = (entry) => {
    if (entry === null || typeof entry !== 'object') return entry;
    if (seen.has(entry)) return '[Circular]';
    seen.add(entry);
    if (Array.isArray(entry)) return entry.map(normalize);
    return Object.fromEntries(
      Object.entries(entry)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]),
    );
  };
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}

export function safeFilename(value, fallback = 'item') {
  const cleaned = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120);
  return cleaned || fallback;
}

export function redactHeaders(headers = {}) {
  const output = {};
  for (const [name, value] of Object.entries(headers || {})) {
    output[name] = SENSITIVE_HEADER.test(name) ? '[REDACTED]' : String(value ?? '');
  }
  return output;
}

export function sanitizeUrl(value) {
  try {
    const parsed = new URL(String(value));
    parsed.username = '';
    parsed.password = '';
    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_KEY.test(key)) parsed.searchParams.set(key, '[REDACTED]');
    }
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return String(value || '').replace(
      /([?&](?:access|auth|authorization|csrf|key|password|secret|session|token|xsrf)[^=]*=)[^&#\s]+/gi,
      '$1[REDACTED]',
    );
  }
}

function redactSensitiveObject(value) {
  if (Array.isArray(value)) return value.map(redactSensitiveObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactSensitiveObject(child),
    ]),
  );
}

export function sanitizeTextBody(body, contentType = '') {
  const text = String(body ?? '');
  if (/\bjson\b/i.test(contentType) || /^[\s\r\n]*[\[{]/.test(text)) {
    try {
      return JSON.stringify(redactSensitiveObject(JSON.parse(text)));
    } catch {
      // Fall through to conservative text redaction.
    }
  }
  return text
    .replace(
      /((?:access|auth|authorization|csrf|key|password|secret|session|token|xsrf)[_-]?[a-z0-9]*["']?\s*[:=]\s*["'])[^"']+(["'])/gi,
      '$1[REDACTED]$2',
    )
    .replace(/(<input\b[^>]*\b(?:name|id)=["'][^"']*(?:csrf|token|password|email|session)[^"']*["'][^>]*\bvalue=["'])[^"']*(["'])/gi, '$1[REDACTED]$2');
}

export function extractQuestionReferences(text) {
  const source = String(text || '');
  const found = new Set();
  for (const pattern of QUESTION_REFERENCE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) found.add(match[0].trim());
  }
  return [...found].sort((left, right) => left.localeCompare(right));
}

async function* walk(directory) {
  const handle = await opendir(directory);
  for await (const entry of handle) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(fullPath);
    else if (entry.isFile()) yield fullPath;
  }
}

export async function writeChecksums(root, outputName = 'checksums.sha256') {
  const rows = [];
  for await (const filePath of walk(root)) {
    const relative = path.relative(root, filePath).split(path.sep).join('/');
    if (relative === outputName) continue;
    rows.push({ relative, sha256: await hashFile(filePath) });
  }
  rows.sort((left, right) => left.relative.localeCompare(right.relative));
  const content = rows.map((row) => `${row.sha256}  ${row.relative}`).join('\n');
  await writeFile(path.join(root, outputName), `${content}\n`, 'utf8');
  return rows;
}

export async function verifyChecksums(root, checksumName = 'checksums.sha256') {
  const content = await readFile(path.join(root, checksumName), 'utf8');
  const rows = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([0-9a-f]{64})\s{2}(.+)$/i);
      if (!match) throw new Error(`Invalid checksum row: ${line}`);
      return { sha256: match[1].toLowerCase(), relative: match[2] };
    });
  for (const row of rows) {
    const actual = await hashFile(path.join(root, ...row.relative.split('/')));
    if (actual !== row.sha256) throw new Error(`Checksum mismatch: ${row.relative}`);
  }
  return rows.length;
}
