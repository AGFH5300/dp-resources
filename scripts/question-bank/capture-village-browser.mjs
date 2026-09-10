#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, open, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const VILLAGE_BROWSER_INDEXER_VERSION = '1.0.0';
export const DEFAULT_VILLAGE_URL = 'https://village.pirateib.su/';

const REQUEST_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 350;
const QUIET_AFTER_ALL_CHUNKS_MS = 3_000;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const nowIso = () => new Date().toISOString();
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function timestamp() {
  const d = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function defaultOutput() {
  return path.join(homedir(), 'Desktop', `VILLAGE-index-${timestamp()}`);
}

function usage() {
  return `PirateIB Village Chromium indexer v${VILLAGE_BROWSER_INDEXER_VERSION}

Usage:
  node scripts/question-bank/capture-village-browser.mjs [options]

Options:
  --output PATH       Output directory (default: ~/Desktop/VILLAGE-index-<timestamp>)
  --browser PATH      Chromium/Chrome executable path (auto-detected when omitted)
  --headless          Run Chromium headless (interactive browsing is recommended)
  --no-sandbox        Pass --no-sandbox to Chromium (sometimes needed in containers/Replit)
  --keep-profile      Keep the temporary Chromium profile after capture
  --port N            DevTools debugging port (default: automatically chosen)
  --help              Show this help

How it works:
  1. Launches a clean Chromium profile and opens ${DEFAULT_VILLAGE_URL}
  2. Detects the Village *.questionData.js chunk catalogue from main.js
  3. Captures question metadata/fingerprints after the app decrypts/parses them
  4. Never writes question text, markscheme text, or media to disk
  5. Shows question-data chunk coverage while you browse

Browse the Village question banks in the opened Chromium window. Press Enter in
this terminal when you are satisfied with coverage. The indexer also finishes
automatically once every discovered question-data chunk has been seen.
`;
}

function positiveInt(value, label, max = 65535) {
  const n = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new Error(`${label} must be an integer from 1 to ${max}.`);
  return n;
}

export function parseBrowserArgs(argv) {
  const options = {
    output: defaultOutput(),
    browser: null,
    headless: false,
    noSandbox: false,
    keepProfile: false,
    port: null,
    help: false,
  };
  const take = (index, label) => {
    const value = argv[index + 1];
    if (!value) throw new Error(`${label} requires a value.`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') options.output = path.resolve(take(index++, '--output'));
    else if (arg.startsWith('--output=')) options.output = path.resolve(arg.slice(9));
    else if (arg === '--browser') options.browser = path.resolve(take(index++, '--browser'));
    else if (arg.startsWith('--browser=')) options.browser = path.resolve(arg.slice(10));
    else if (arg === '--port') options.port = positiveInt(take(index++, '--port'), '--port');
    else if (arg.startsWith('--port=')) options.port = positiveInt(arg.slice(7), '--port');
    else if (arg === '--headless') options.headless = true;
    else if (arg === '--no-sandbox') options.noSandbox = true;
    else if (arg === '--keep-profile') options.keepProfile = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function which(command) {
  const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.split(/\r?\n/).map((v) => v.trim()).find(Boolean) || null;
}

export function browserCandidates() {
  const candidates = [];
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);
  if (process.env.CHROMIUM_PATH) candidates.push(process.env.CHROMIUM_PATH);
  if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      path.join(homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      path.join(homedir(), 'Applications/Chromium.app/Contents/MacOS/Chromium'),
    );
  }
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome']) {
    const found = which(name);
    if (found) candidates.push(found);
  }
  return [...new Set(candidates)];
}

async function fileExists(filename) {
  try {
    await readFile(filename, { encoding: null, flag: 'r' });
    return true;
  } catch {
    return false;
  }
}

export async function resolveBrowserExecutable(explicitPath = null) {
  if (explicitPath) {
    if (!await fileExists(explicitPath)) throw new Error(`Chromium executable not found: ${explicitPath}`);
    return explicitPath;
  }
  for (const candidate of browserCandidates()) {
    if (await fileExists(candidate)) return candidate;
  }
  throw new Error('Could not find Chrome/Chromium. Pass --browser /path/to/chromium or set CHROME_PATH.');
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => port ? resolve(port) : reject(new Error('Unable to allocate a DevTools port.')));
    });
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function discoverQuestionChunkIds(mainSource) {
  const ids = new Set();
  for (const match of String(mainSource || '').matchAll(/\b[A-Za-z_$][\w$]*\.e\(\s*(\d+)\s*\)\s*\.then/g)) {
    ids.add(Number(match[1]));
  }
  return [...ids].sort((a, b) => a - b);
}

async function discoverVillageRuntime() {
  const htmlResponse = await fetchWithTimeout(DEFAULT_VILLAGE_URL, {
    headers: { 'user-agent': `DP-Resources-Village-Browser-Indexer/${VILLAGE_BROWSER_INDEXER_VERSION}` },
  });
  if (!htmlResponse.ok) throw new Error(`Village app returned HTTP ${htmlResponse.status}.`);
  const html = await htmlResponse.text();
  const scriptRefs = [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi)]
    .map((match) => new URL(match[1], DEFAULT_VILLAGE_URL).href);
  const mainUrl = scriptRefs.find((url) => /\/main(?:\.[^/]+)?\.js(?:\?|$)/i.test(url)) || new URL('main.js', DEFAULT_VILLAGE_URL).href;
  const mainResponse = await fetchWithTimeout(mainUrl, {
    headers: { 'user-agent': `DP-Resources-Village-Browser-Indexer/${VILLAGE_BROWSER_INDEXER_VERSION}` },
  });
  if (!mainResponse.ok) throw new Error(`Village main bundle returned HTTP ${mainResponse.status}.`);
  const mainSource = await mainResponse.text();
  const chunkIds = discoverQuestionChunkIds(mainSource);
  if (!chunkIds.length || !mainSource.includes('.questionData.js')) {
    throw new Error('Village question-data chunk catalogue was not detected. The site structure may have changed.');
  }
  return {
    appUrl: DEFAULT_VILLAGE_URL,
    mainUrl,
    mainSha256: sha256(mainSource),
    mainBytes: Buffer.byteLength(mainSource),
    chunkIds,
  };
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    if (typeof WebSocket === 'undefined') throw new Error('Node 24+ with global WebSocket support is required.');
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out connecting to Chromium DevTools.')), 15_000);
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Unable to connect to Chromium DevTools.')); }, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${message.error.message || 'CDP error'} (${message.error.code || 'unknown'})`));
        else pending.resolve(message.result || {});
        return;
      }
      const callbacks = this.listeners.get(message.method) || [];
      for (const callback of callbacks) {
        try { callback(message.params || {}); } catch { /* keep capture alive */ }
      }
    });
    this.ws.addEventListener('close', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('Chromium DevTools connection closed.'));
      this.pending.clear();
    });
  }

  send(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('Chromium DevTools is not connected.');
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, callback) {
    const current = this.listeners.get(method) || [];
    current.push(callback);
    this.listeners.set(method, current);
  }

  close() {
    try { this.ws?.close(); } catch { /* no-op */ }
  }
}

async function waitForPageTarget(port) {
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(`${base}/json/list`, {}, 2_000);
      if (response.ok) {
        const targets = await response.json();
        const page = Array.isArray(targets) ? targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl) : null;
        if (page) return page;
      }
    } catch {
      // Chromium may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Chromium started but no DevTools page target became available.');
}

function launchBrowser(executable, port, profileDir, options) {
  const args = [
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--metrics-recording-only',
    '--password-store=basic',
    'about:blank',
  ];
  if (options.headless) args.unshift('--headless=new');
  if (options.noSandbox || process.getuid?.() === 0) args.unshift('--no-sandbox');
  return spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

const PAGE_CAPTURE_HOOK = String.raw`(() => {
  if (globalThis.__DP_VILLAGE_CAPTURE_INSTALLED__) return;
  globalThis.__DP_VILLAGE_CAPTURE_INSTALLED__ = true;
  const queue = [];
  let pending = 0;
  const emitted = new Set();
  const encoder = new TextEncoder();

  const normKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const byKeys = (record, names) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return undefined;
    const wanted = new Set(names.map(normKey));
    for (const [key, value] of Object.entries(record)) if (wanted.has(normKey(key))) return value;
    return undefined;
  };
  const scalar = (value) => {
    if (value == null || typeof value === 'object') return null;
    const text = String(value).trim();
    return text || null;
  };
  const cleanArray = (value) => {
    if (value == null) return [];
    return (Array.isArray(value) ? value : [value])
      .flatMap((item) => typeof item === 'string' ? item.split(/\s*[|;]\s*/) : [item])
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
      .slice(0, 50);
  };
  const textify = (value) => {
    if (value == null) return '';
    let text;
    try { text = typeof value === 'string' ? value : JSON.stringify(value); } catch { text = String(value); }
    try {
      const doc = new DOMParser().parseFromString(String(text), 'text/html');
      text = doc.body?.textContent || text;
    } catch { /* keep original */ }
    return String(text).normalize('NFKC').replace(/\s+/g, ' ').trim();
  };
  const questionValue = (record) => byKeys(record, [
    'question', 'questionHtml', 'question_html', 'questionText', 'question_text',
    'prompt', 'stem', 'body', 'content'
  ]);
  const markschemeValue = (record) => byKeys(record, [
    'markscheme', 'markScheme', 'mark_scheme', 'markschemeHtml', 'markscheme_html',
    'solution', 'answer', 'explanation'
  ]);
  const recordId = (record) => scalar(byKeys(record, [
    'sourceQuestionId', 'source_question_id', 'questionId', 'question_id', 'uuid', 'id'
  ]));
  const looksLikeQuestion = (record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
    const q = textify(questionValue(record));
    const m = textify(markschemeValue(record));
    const id = recordId(record);
    const taxonomy = byKeys(record, ['topic', 'topics', 'subtopic', 'subtopics', 'subject', 'course']);
    return Boolean((id && (q.length >= 8 || m.length >= 8)) || (q.length >= 24 && (m.length >= 4 || taxonomy != null)));
  };
  const hash = async (text) => {
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  };
  const emit = async (record) => {
    const question = textify(questionValue(record));
    const markscheme = textify(markschemeValue(record));
    if (!question && !markscheme) return;
    pending += 1;
    try {
      const [questionHash, markschemeHash] = await Promise.all([
        hash(question.toLowerCase()),
        hash(markscheme.toLowerCase()),
      ]);
      const combined = await hash(questionHash + '\n' + markschemeHash);
      const id = recordId(record) || ('hash:' + questionHash);
      const dedupe = id + ':' + combined;
      if (emitted.has(dedupe)) return;
      emitted.add(dedupe);
      queue.push({
        source_question_id: id,
        subject: scalar(byKeys(record, ['subject', 'subjectName', 'subject_name', 'subjectGroup', 'subject_group'])),
        course: scalar(byKeys(record, ['course', 'courseName', 'course_name', 'syllabus', 'bank'])),
        level: scalar(byKeys(record, ['level', 'tier'])),
        paper: scalar(byKeys(record, ['paper', 'paperName', 'paper_name'])),
        session: scalar(byKeys(record, ['session', 'examSession', 'exam_session'])),
        reference: scalar(byKeys(record, ['reference', 'ref', 'questionReference', 'question_reference'])),
        difficulty: scalar(byKeys(record, ['difficulty', 'difficultyLevel', 'difficulty_level'])),
        marks: scalar(byKeys(record, ['marks', 'mark', 'points', 'maxMarks', 'max_marks'])),
        topics: cleanArray(byKeys(record, ['topics', 'topic'])),
        subtopics: cleanArray(byKeys(record, ['subtopics', 'subtopic'])),
        question_length: question.length,
        markscheme_length: markscheme.length,
        question_sha256: questionHash,
        markscheme_sha256: markschemeHash,
        combined_sha256: combined,
        page_path: location.pathname + location.search + location.hash,
      });
    } finally {
      pending -= 1;
    }
  };
  const scan = (root) => {
    if (root == null || typeof root !== 'object') return;
    const stack = [root];
    const seen = new WeakSet();
    let visited = 0;
    const step = () => {
      let budget = 700;
      while (stack.length && budget-- > 0 && visited < 250000) {
        const value = stack.pop();
        if (!value || typeof value !== 'object' || seen.has(value)) continue;
        seen.add(value);
        visited += 1;
        if (looksLikeQuestion(value)) void emit(value);
        if (Array.isArray(value)) {
          for (const child of value) if (child && typeof child === 'object') stack.push(child);
        } else {
          for (const child of Object.values(value)) if (child && typeof child === 'object') stack.push(child);
        }
      }
      if (stack.length && visited < 250000) setTimeout(step, 0);
    };
    step();
  };

  JSON.parse = new Proxy(JSON.parse, {
    apply(target, thisArg, args) {
      const result = Reflect.apply(target, thisArg, args);
      try { scan(result); } catch { /* non-invasive */ }
      return result;
    },
  });

  if (typeof Response !== 'undefined' && Response.prototype?.json) {
    const nativeResponseJson = Response.prototype.json;
    Response.prototype.json = async function(...args) {
      const result = await nativeResponseJson.apply(this, args);
      try { scan(result); } catch { /* non-invasive */ }
      return result;
    };
  }

  globalThis.__DP_VILLAGE_DRAIN__ = () => queue.splice(0, queue.length);
  globalThis.__DP_VILLAGE_CAPTURE_STATUS__ = () => ({ queued: queue.length, pending });
})();`;

function mergeQuestion(map, row) {
  if (!row || !row.source_question_id) return;
  const id = String(row.source_question_id);
  const existing = map.get(id);
  if (!existing) {
    map.set(id, { ...row, occurrences: 1, page_paths: row.page_path ? [row.page_path] : [] });
    return;
  }
  existing.occurrences += 1;
  if (row.page_path && !existing.page_paths.includes(row.page_path)) existing.page_paths.push(row.page_path);
  for (const field of ['subject', 'course', 'level', 'paper', 'session', 'reference', 'difficulty', 'marks']) {
    if (!existing[field] && row[field]) existing[field] = row[field];
  }
  existing.topics = [...new Set([...(existing.topics || []), ...(row.topics || [])])].sort();
  existing.subtopics = [...new Set([...(existing.subtopics || []), ...(row.subtopics || [])])].sort();
  if (existing.combined_sha256 !== row.combined_sha256) {
    existing.conflicting_fingerprints = [...new Set([
      existing.combined_sha256,
      ...(existing.conflicting_fingerprints || []),
      row.combined_sha256,
    ])];
  }
}

async function drainCapture(cdp, questionMap) {
  try {
    const result = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify(globalThis.__DP_VILLAGE_DRAIN__ ? globalThis.__DP_VILLAGE_DRAIN__() : [])`,
      returnByValue: true,
      awaitPromise: true,
    });
    const text = result.result?.value;
    if (!text) return 0;
    const rows = JSON.parse(text);
    for (const row of rows) mergeQuestion(questionMap, row);
    return rows.length;
  } catch {
    return 0;
  }
}

async function captureStatus(cdp) {
  try {
    const result = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify(globalThis.__DP_VILLAGE_CAPTURE_STATUS__ ? globalThis.__DP_VILLAGE_CAPTURE_STATUS__() : {queued:0,pending:0})`,
      returnByValue: true,
    });
    return JSON.parse(result.result?.value || '{"queued":0,"pending":0}');
  } catch {
    return { queued: 0, pending: 0 };
  }
}

async function writeNdjson(filename, rows) {
  await mkdir(path.dirname(filename), { recursive: true });
  const handle = await open(filename, 'w');
  try {
    for (const row of rows) await handle.write(`${JSON.stringify(row)}\n`);
  } finally {
    await handle.close();
  }
}

async function writeChecksums(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name !== 'checksums.sha256') files.push(full);
    }
  }
  await walk(root);
  const lines = [];
  for (const filename of files.sort()) {
    const bytes = await readFile(filename);
    lines.push(`${sha256(bytes)}  ${path.relative(root, filename).split(path.sep).join('/')}`);
  }
  await writeFile(path.join(root, 'checksums.sha256'), `${lines.join('\n')}\n`);
}

function waitForEnterOrSignal() {
  let done;
  const promise = new Promise((resolve) => { done = resolve; });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  if (process.stdin.isTTY) {
    process.stdin.setRawMode?.(false);
    rl.once('line', () => done('enter'));
  }
  const signal = () => done('signal');
  process.once('SIGINT', signal);
  process.once('SIGTERM', signal);
  return {
    promise,
    resolve: done,
    close: () => {
      process.removeListener('SIGINT', signal);
      process.removeListener('SIGTERM', signal);
      rl.close();
    },
  };
}

async function finalizeCapture({ output, runtime, browserExecutable, loadedChunks, chunkResponses, questionMap, startedAt, stopReason }) {
  await mkdir(path.join(output, 'source'), { recursive: true });
  await mkdir(path.join(output, 'index'), { recursive: true });

  const expected = new Set(runtime.chunkIds);
  const loaded = [...loadedChunks].sort((a, b) => a - b);
  const missing = runtime.chunkIds.filter((id) => !loadedChunks.has(id));
  const questions = [...questionMap.values()].sort((a, b) => String(a.source_question_id).localeCompare(String(b.source_question_id)));
  const conflicting = questions.filter((row) => row.conflicting_fingerprints?.length).map((row) => row.source_question_id);

  await writeFile(path.join(output, 'source', 'runtime.json'), json({
    app_url: runtime.appUrl,
    main_url: runtime.mainUrl,
    main_sha256: runtime.mainSha256,
    main_bytes: runtime.mainBytes,
    expected_question_chunk_ids: runtime.chunkIds,
  }));
  await writeFile(path.join(output, 'source', 'chunk-coverage.json'), json({
    expected_count: expected.size,
    loaded_count: loaded.length,
    loaded_chunk_ids: loaded,
    missing_chunk_ids: missing,
    responses: [...chunkResponses.values()].sort((a, b) => a.chunk_id - b.chunk_id),
  }));
  await writeNdjson(path.join(output, 'index', 'questions.ndjson'), questions);

  const summary = {
    format: 'dp-resources-pirateib-village-browser-index-v1',
    indexer_version: VILLAGE_BROWSER_INDEXER_VERSION,
    started_at: startedAt,
    completed_at: nowIso(),
    stop_reason: stopReason,
    browser_executable: browserExecutable,
    capture_policy: 'metadata-and-content-fingerprints-only',
    expected_question_chunks: expected.size,
    loaded_question_chunks: loaded.length,
    chunk_coverage_percent: expected.size ? Math.round((loaded.length / expected.size) * 10000) / 100 : 0,
    missing_question_chunks: missing.length,
    unique_source_question_ids: questions.length,
    conflicting_source_id_fingerprints: conflicting.length,
    conflicting_source_question_ids: conflicting,
    output_question_text: false,
    output_markscheme_text: false,
    output_media: false,
  };
  await writeFile(path.join(output, 'summary.json'), json(summary));
  await writeChecksums(output);
  return summary;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseBrowserArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  const runtime = await discoverVillageRuntime();
  const browserExecutable = await resolveBrowserExecutable(options.browser);
  const port = options.port || await freePort();
  const profileDir = await mkdtemp(path.join(tmpdir(), 'dp-village-chromium-'));
  const startedAt = nowIso();

  console.log(`\nPirateIB Village Chromium indexer v${VILLAGE_BROWSER_INDEXER_VERSION}`);
  console.log(`Browser: ${browserExecutable}`);
  console.log(`Village question-data catalogue: ${runtime.chunkIds.length} chunks`);
  console.log(`Output: ${options.output}`);
  console.log('Question/markscheme text and media are never written to disk.');

  const browser = launchBrowser(browserExecutable, port, profileDir, options);
  let browserStderr = '';
  browser.stderr?.on('data', (chunk) => {
    if (browserStderr.length < 16_000) browserStderr += chunk.toString();
  });

  let cdp;
  const loadedChunks = new Set();
  const chunkResponses = new Map();
  const questionMap = new Map();
  let lastProgress = '';
  let allChunksSince = null;
  let stopReason = 'enter';
  const stopper = waitForEnterOrSignal();

  try {
    const target = await waitForPageTarget(port);
    cdp = new CdpClient(target.webSocketDebuggerUrl);
    await cdp.connect();
    await Promise.all([
      cdp.send('Page.enable'),
      cdp.send('Runtime.enable'),
      cdp.send('Network.enable', { maxTotalBufferSize: 0, maxResourceBufferSize: 0 }),
    ]);

    cdp.on('Network.responseReceived', ({ response }) => {
      const url = response?.url || '';
      const match = url.match(/\/(\d+)\.questionData\.js(?:[?#]|$)/i);
      if (!match) return;
      const chunkId = Number(match[1]);
      if (!runtime.chunkIds.includes(chunkId)) return;
      loadedChunks.add(chunkId);
      chunkResponses.set(chunkId, {
        chunk_id: chunkId,
        url,
        status: response.status,
        mime_type: response.mimeType || null,
        encoded_data_length: response.encodedDataLength || null,
        from_disk_cache: Boolean(response.fromDiskCache),
        from_service_worker: Boolean(response.fromServiceWorker),
      });
    });

    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_CAPTURE_HOOK });
    await cdp.send('Page.navigate', { url: DEFAULT_VILLAGE_URL });

    console.log('\nChromium is open. Browse Village normally.');
    console.log('The terminal shows chunk coverage and captured source-question IDs.');
    console.log('Press Enter here when you want to stop and write the index.\n');

    const stopPromise = stopper.promise.then((reason) => {
      stopReason = reason;
      return reason;
    });

    let stopped = false;
    stopPromise.then(() => { stopped = true; });

    while (!stopped) {
      await drainCapture(cdp, questionMap);
      const status = await captureStatus(cdp);
      const progress = `${loadedChunks.size}/${runtime.chunkIds.length} chunks · ${questionMap.size} questions · ${status.pending || 0} hashes pending`;
      if (progress !== lastProgress) {
        process.stdout.write(`\r${progress.padEnd(Math.max(lastProgress.length, progress.length))}`);
        lastProgress = progress;
      }
      if (loadedChunks.size === runtime.chunkIds.length) {
        if (!allChunksSince) allChunksSince = Date.now();
        if (Date.now() - allChunksSince >= QUIET_AFTER_ALL_CHUNKS_MS && (status.pending || 0) === 0) {
          stopReason = 'all-chunks-seen';
          stopper.resolve(stopReason);
          break;
        }
      } else {
        allChunksSince = null;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    console.log('');
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await drainCapture(cdp, questionMap);
      const status = await captureStatus(cdp);
      if ((status.pending || 0) === 0 && (status.queued || 0) === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  } catch (error) {
    if (!browser.killed) browser.kill('SIGTERM');
    const suffix = browserStderr.trim() ? `\nChromium output:\n${browserStderr.slice(-4000)}` : '';
    throw new Error(`${error.message}${suffix}`);
  } finally {
    stopper.close();
    cdp?.close();
  }

  const summary = await finalizeCapture({
    output: options.output,
    runtime,
    browserExecutable,
    loadedChunks,
    chunkResponses,
    questionMap,
    startedAt,
    stopReason,
  });

  if (!browser.killed) browser.kill('SIGTERM');
  if (!options.keepProfile) await rm(profileDir, { recursive: true, force: true });

  console.log('\nVillage index written successfully.');
  console.log(json(summary));
  console.log(`Send me the folder or at minimum: ${path.join(options.output, 'summary.json')} and ${path.join(options.output, 'index', 'questions.ndjson')}`);
}

async function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    const [modulePath, invokedPath] = await Promise.all([
      realpath(fileURLToPath(import.meta.url)),
      realpath(path.resolve(process.argv[1])),
    ]);
    return modulePath === invokedPath;
  } catch {
    return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
  }
}

if (await isMainModule()) {
  main().catch((error) => {
    console.error(`\nFatal error: ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}
