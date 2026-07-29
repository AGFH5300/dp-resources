#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  access,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import {
  extractQuestionReferences,
  hashFile,
  redactHeaders,
  sanitizeTextBody,
  sanitizeUrl,
  sha256,
  stableJson,
  verifyChecksums,
  writeChecksums,
} from './question-bank/exam-mate-capture.mjs';

const START_URL =
  'https://www.exam-mate.com/topicalpastpapers/IB%20Diploma-7/Biology-74';
const BODY_LIMIT_BYTES = 25 * 1024 * 1024;
const TOTAL_BODY_LIMIT_BYTES = 500 * 1024 * 1024;
const CAPTURE_SCHEMA_VERSION = 1;

function usage() {
  return `
Authorised Exam-Mate Question Bank capture inspector

Usage:
  node scripts/capture-exam-mate-question-bank.mjs \\
    --acknowledge-authorized-use \\
    --authorization-reference "Written approval from Exam-Mate, 29 July 2026" \\
    [options]

Required:
  --acknowledge-authorized-use    Confirms written permission is held.
  --authorization-reference <s>  Non-secret reference to the written approval.

Options:
  --permission-file <path>       Hash permission evidence without copying it.
  --start-url <url>              Initial Exam-Mate page (default: IB Biology).
  --output <directory>           Capture directory.
  --profile-dir <directory>      Dedicated local Chrome profile for login state.
  --chrome <path>                Chrome/Edge/Brave executable.
  --debug-port <port>            Attach to an already-running debug browser.
  --no-package                   Leave the capture as a directory only.
  --keep-browser-open            Do not close the launched browser at the end.
  --help                         Show this help.

The tool never exports cookies, localStorage, sessionStorage, passwords, or raw
request authorization headers. It records a representative authenticated
session so the complete crawler can be implemented against the real site.
`;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function parseArguments(argv) {
  const options = {
    acknowledgeAuthorizedUse: false,
    authorizationReference: '',
    permissionFile: null,
    startUrl: START_URL,
    output: path.resolve(`exam-mate-capture-${timestamp()}`),
    profileDir: path.join(os.homedir(), '.dp-resources', 'exam-mate-chrome-profile'),
    chrome: null,
    debugPort: null,
    package: true,
    keepBrowserOpen: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') options.help = true;
    else if (token === '--acknowledge-authorized-use') options.acknowledgeAuthorizedUse = true;
    else if (token === '--authorization-reference') options.authorizationReference = argv[++index] || '';
    else if (token === '--permission-file') options.permissionFile = path.resolve(argv[++index]);
    else if (token === '--start-url') options.startUrl = argv[++index];
    else if (token === '--output') options.output = path.resolve(argv[++index]);
    else if (token === '--profile-dir') options.profileDir = path.resolve(argv[++index]);
    else if (token === '--chrome') options.chrome = path.resolve(argv[++index]);
    else if (token === '--debug-port') options.debugPort = Number(argv[++index]);
    else if (token === '--no-package') options.package = false;
    else if (token === '--keep-browser-open') options.keepBrowserOpen = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (options.help) return options;
  if (!options.acknowledgeAuthorizedUse) {
    throw new Error('Refusing capture without --acknowledge-authorized-use.');
  }
  if (!options.authorizationReference.trim()) {
    throw new Error('--authorization-reference is required.');
  }
  const parsed = new URL(options.startUrl);
  if (!/(^|\.)exam-mate\.com$/i.test(parsed.hostname)) {
    throw new Error('--start-url must use an exam-mate.com host.');
  }
  if (options.debugPort !== null && (!Number.isInteger(options.debugPort) || options.debugPort < 1)) {
    throw new Error('--debug-port must be a positive integer.');
  }
  return options;
}

function chromeCandidates() {
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    const suffixes = [
      'Google/Chrome/Application/chrome.exe',
      'Microsoft/Edge/Application/msedge.exe',
      'BraveSoftware/Brave-Browser/Application/brave.exe',
      'Chromium/Application/chrome.exe',
    ];
    return roots.flatMap((root) => suffixes.map((suffix) => path.join(root, ...suffix.split('/'))));
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/usr/bin/brave-browser',
  ];
}

function findChrome(explicit) {
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`Chrome executable does not exist: ${explicit}`);
    return explicit;
  }
  const found = chromeCandidates().find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error('Chrome, Edge, Brave, or Chromium was not found. Pass --chrome <path>.');
  }
  return found;
}

async function waitForFile(filePath, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await access(filePath);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

async function waitForDevtools(port, timeoutMs = 20_000) {
  const started = Date.now();
  let latest;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return response.json();
    } catch (error) {
      latest = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Unable to connect to Chrome DevTools on port ${port}: ${latest?.message || 'timeout'}`);
}

async function launchBrowser(options) {
  if (options.debugPort) {
    return { port: options.debugPort, process: null, launched: false };
  }
  const executable = findChrome(options.chrome);
  await mkdir(options.profileDir, { recursive: true });
  await rm(path.join(options.profileDir, 'DevToolsActivePort'), { force: true });
  const child = spawn(
    executable,
    [
      '--remote-debugging-port=0',
      `--user-data-dir=${options.profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      options.startUrl,
    ],
    { detached: false, stdio: 'ignore' },
  );
  child.once('error', (error) => {
    console.error(`Browser launch failed: ${error.message}`);
  });
  const activePortPath = path.join(options.profileDir, 'DevToolsActivePort');
  await waitForFile(activePortPath);
  const [portLine] = (await readFile(activePortPath, 'utf8')).split(/\r?\n/);
  const port = Number(portLine);
  if (!Number.isInteger(port) || port < 1) throw new Error('Chrome returned an invalid DevTools port.');
  return { port, process: child, launched: true };
}

async function targetForPage(port, preferredUrl) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) throw new Error(`Unable to list Chrome targets: HTTP ${response.status}`);
  const targets = await response.json();
  const pages = targets.filter((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  if (!pages.length) throw new Error('No debuggable page target was found.');
  return (
    pages.find((target) => target.url === preferredUrl) ||
    pages.find((target) => /exam-mate\.com/i.test(target.url)) ||
    pages[0]
  );
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.socket = null;
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out connecting to Chrome DevTools.')), 10_000);
      this.socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('Chrome DevTools WebSocket connection failed.'));
      });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) || []) {
        Promise.resolve(listener(message.params || {})).catch((error) => {
          console.error(`CDP event handler failed (${message.method}): ${error.message}`);
        });
      }
    });
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(listener);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket?.close();
  }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Browser evaluation failed.');
  }
  return result.result?.value;
}

const DOM_SNAPSHOT_EXPRESSION = String.raw`(() => {
  const text = (node) => String(node?.innerText || node?.textContent || '').replace(/\s+/g, ' ').trim();
  const attrs = (node) => Object.fromEntries([...node.attributes].map((attribute) => [attribute.name, attribute.value]));
  const sensitive = /(?:password|email|csrf|token|session|auth|cookie|secret)/i;
  const safeAttrs = (node) => Object.fromEntries(Object.entries(attrs(node)).map(([name, value]) => [name, sensitive.test(name) || (sensitive.test(value) && /value|content|data-/i.test(name)) ? '[REDACTED]' : value]));
  const describe = (node) => ({
    tag: node.tagName.toLowerCase(),
    text: text(node).slice(0, 500),
    attributes: safeAttrs(node),
  });
  const clone = document.documentElement.cloneNode(true);
  clone.querySelectorAll('input,textarea').forEach((node) => {
    const identity = String(node.getAttribute('name') || node.getAttribute('id') || node.getAttribute('type') || '');
    if (sensitive.test(identity)) node.setAttribute('value', '[REDACTED]');
    else if (node.hasAttribute('value')) node.setAttribute('value', '');
    node.textContent = '';
  });
  clone.querySelectorAll('meta').forEach((node) => {
    const identity = String(node.getAttribute('name') || node.getAttribute('property') || '');
    if (sensitive.test(identity)) node.setAttribute('content', '[REDACTED]');
  });
  clone.querySelectorAll('[data-token],[data-csrf],[data-session],[data-auth]').forEach((node) => {
    for (const attribute of [...node.attributes]) {
      if (sensitive.test(attribute.name)) node.setAttribute(attribute.name, '[REDACTED]');
    }
  });
  const referencePattern = /(?:[A-Z][A-Z0-9-]{2,}\/\d+(?:_[A-Z]{2})?_[A-Za-z]+_\d{4}_Q\d+|exam-mate\s+QID\d+)/i;
  return {
    capturedAt: new Date().toISOString(),
    url: location.href,
    title: document.title,
    html: '<!doctype html>\n' + clone.outerHTML,
    forms: [...document.forms].map((form) => ({
      attributes: safeAttrs(form),
      controls: [...form.elements].map(describe),
    })),
    controls: [...document.querySelectorAll('select,input,button,[role="button"],textarea')].map(describe),
    links: [...document.querySelectorAll('a[href]')].map((node) => ({ ...describe(node), href: node.href })),
    scripts: [...document.scripts].map((node) => ({ src: node.src || null, type: node.type || null, inlineBytes: node.src ? 0 : node.textContent.length })),
    images: [...document.images].map((node) => ({ src: node.currentSrc || node.src, alt: node.alt || '', width: node.naturalWidth, height: node.naturalHeight })),
    questionCandidates: [...document.querySelectorAll('a,button,li,[role="button"],div,span')]
      .filter((node) => referencePattern.test(text(node)) && text(node).length < 250)
      .slice(0, 500)
      .map(describe),
    resources: performance.getEntriesByType('resource').map((entry) => ({ name: entry.name, initiatorType: entry.initiatorType, transferSize: entry.transferSize, decodedBodySize: entry.decodedBodySize })),
    cookieCount: document.cookie ? document.cookie.split(';').filter(Boolean).length : 0,
    storageExported: false,
  };
})()`;

function sanitizeSnapshot(snapshot) {
  return {
    ...snapshot,
    url: sanitizeUrl(snapshot.url),
    links: (snapshot.links || []).map((link) => ({ ...link, href: sanitizeUrl(link.href) })),
    scripts: (snapshot.scripts || []).map((script) => ({
      ...script,
      src: script.src ? sanitizeUrl(script.src) : null,
    })),
    images: (snapshot.images || []).map((image) => ({ ...image, src: sanitizeUrl(image.src) })),
    resources: (snapshot.resources || []).map((resource) => ({
      ...resource,
      name: sanitizeUrl(resource.name),
    })),
  };
}

async function captureSanitizedScreenshot(client, filePath) {
  const marker = `dp-capture-redact-${crypto.randomUUID()}`;
  await evaluate(
    client,
    `(() => {
      const marker = ${JSON.stringify(marker)};
      const style = document.createElement('style');
      style.id = marker;
      style.textContent = '[data-dp-capture-redact="' + marker + '"] { filter: blur(10px) !important; color: transparent !important; text-shadow: none !important; }';
      document.documentElement.appendChild(style);
      const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i;
      for (const node of document.querySelectorAll('input[type="email"], input[type="password"], [autocomplete*="email"], [autocomplete*="password"]')) {
        node.setAttribute('data-dp-capture-redact', marker);
      }
      for (const node of document.querySelectorAll('body *')) {
        if (node.children.length === 0 && email.test(String(node.textContent || ''))) {
          node.setAttribute('data-dp-capture-redact', marker);
        }
      }
      return true;
    })()`,
  );
  try {
    const screenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await writeFile(filePath, Buffer.from(screenshot.data, 'base64'));
  } finally {
    await evaluate(
      client,
      `(() => {
        const marker = ${JSON.stringify(marker)};
        document.getElementById(marker)?.remove();
        for (const node of document.querySelectorAll('[data-dp-capture-redact="' + marker + '"]')) {
          node.removeAttribute('data-dp-capture-redact');
        }
        return true;
      })()`,
    );
  }
}

function bodyExtension(mimeType, resourceType) {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('json')) return '.json';
  if (normalized.includes('javascript')) return '.js';
  if (normalized.includes('css')) return '.css';
  if (normalized.includes('html')) return '.html';
  if (normalized.includes('svg')) return '.svg';
  if (normalized.includes('png')) return '.png';
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return '.jpg';
  if (normalized.includes('webp')) return '.webp';
  if (normalized.includes('gif')) return '.gif';
  if (normalized.includes('pdf')) return '.pdf';
  if (normalized.includes('mpeg')) return resourceType === 'Media' ? '.mp3' : '.bin';
  return '.bin';
}

function shouldCaptureBody(response) {
  const type = response.type;
  const mime = String(response.response?.mimeType || '');
  if (['XHR', 'Fetch', 'Script', 'Image', 'Media'].includes(type)) return true;
  return /(?:json|javascript|image\/|audio\/)/i.test(mime);
}

async function packageCapture(directory) {
  const archive = `${directory}.zip`;
  if (process.platform === 'darwin') {
    const result = spawnSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', directory, archive], { encoding: 'utf8' });
    if (result.status === 0) return archive;
  }
  if (process.platform === 'win32') {
    const escapedDirectory = directory.replaceAll("'", "''");
    const escapedArchive = archive.replaceAll("'", "''");
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `Compress-Archive -Path '${escapedDirectory}' -DestinationPath '${escapedArchive}' -Force`],
      { encoding: 'utf8' },
    );
    if (result.status === 0) return archive;
  }
  const result = spawnSync('zip', ['-q', '-r', archive, path.basename(directory)], {
    cwd: path.dirname(directory),
    encoding: 'utf8',
  });
  if (result.status === 0) return archive;
  console.warn('Unable to create a ZIP automatically; the capture directory is complete.');
  return null;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const startedAt = new Date().toISOString();
  await mkdir(options.output, { recursive: false });
  await mkdir(path.join(options.output, 'snapshots'), { recursive: true });
  await mkdir(path.join(options.output, 'network', 'bodies'), { recursive: true });

  let permissionEvidence = null;
  if (options.permissionFile) {
    const fileStat = await stat(options.permissionFile);
    if (!fileStat.isFile()) throw new Error('--permission-file must point to a file.');
    permissionEvidence = {
      filename: path.basename(options.permissionFile),
      sha256: await hashFile(options.permissionFile),
      copiedIntoCapture: false,
    };
  }

  const browser = await launchBrowser(options);
  await waitForDevtools(browser.port);
  const target = await targetForPage(browser.port, options.startUrl);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await Promise.all([
    client.send('Page.enable'),
    client.send('Runtime.enable'),
    client.send('Network.enable', { maxTotalBufferSize: TOTAL_BODY_LIMIT_BYTES, maxResourceBufferSize: BODY_LIMIT_BYTES }),
  ]);

  const requests = new Map();
  const networkRows = [];
  const bodyRows = [];
  const pendingBodyTasks = new Set();
  let totalBodyBytes = 0;

  client.on('Network.requestWillBeSent', (event) => {
    requests.set(event.requestId, {
      requestId: event.requestId,
      startedAt: new Date().toISOString(),
      type: event.type,
      url: sanitizeUrl(event.request.url),
      method: event.request.method,
      requestHeaders: redactHeaders(event.request.headers),
      documentUrl: sanitizeUrl(event.documentURL),
      initiatorType: event.initiator?.type || null,
    });
  });

  client.on('Network.responseReceived', (event) => {
    const row = requests.get(event.requestId) || { requestId: event.requestId };
    Object.assign(row, {
      type: event.type,
      status: event.response.status,
      statusText: event.response.statusText,
      mimeType: event.response.mimeType,
      responseUrl: sanitizeUrl(event.response.url),
      responseHeaders: redactHeaders(event.response.headers),
      protocol: event.response.protocol,
      remoteIPAddress: event.response.remoteIPAddress || null,
      fromDiskCache: Boolean(event.response.fromDiskCache),
      fromServiceWorker: Boolean(event.response.fromServiceWorker),
    });
    requests.set(event.requestId, row);
  });

  client.on('Network.loadingFinished', (event) => {
    const task = (async () => {
      const row = requests.get(event.requestId);
      if (!row) return;
      row.completedAt = new Date().toISOString();
      row.encodedDataLength = event.encodedDataLength;
      if (!row.bodyCaptured && shouldCaptureBody({ ...row, response: { mimeType: row.mimeType } })) {
        row.bodyCaptured = true;
        try {
          const response = await client.send('Network.getResponseBody', { requestId: event.requestId });
          const buffer = response.base64Encoded
            ? Buffer.from(response.body, 'base64')
            : Buffer.from(response.body, 'utf8');
          if (buffer.length > BODY_LIMIT_BYTES) {
            row.bodySkipped = `body exceeds ${BODY_LIMIT_BYTES} bytes`;
          } else if (totalBodyBytes + buffer.length > TOTAL_BODY_LIMIT_BYTES) {
            row.bodySkipped = `capture exceeds ${TOTAL_BODY_LIMIT_BYTES} bytes`;
          } else {
            const isText = !response.base64Encoded || /(?:json|javascript|css|html|xml|svg|text)/i.test(row.mimeType || '');
            const safeBuffer = isText
              ? Buffer.from(sanitizeTextBody(buffer.toString('utf8'), row.mimeType), 'utf8')
              : buffer;
            const digest = sha256(safeBuffer);
            const extension = bodyExtension(row.mimeType, row.type);
            const relative = `network/bodies/${digest.slice(0, 2)}/${digest}${extension}`;
            const fullPath = path.join(options.output, ...relative.split('/'));
            await mkdir(path.dirname(fullPath), { recursive: true });
            if (!existsSync(fullPath)) await writeFile(fullPath, safeBuffer);
            totalBodyBytes += safeBuffer.length;
            row.body = { relative, sha256: digest, bytes: safeBuffer.length, base64Decoded: Boolean(response.base64Encoded) };
            bodyRows.push({ requestId: event.requestId, url: row.responseUrl || row.url, mimeType: row.mimeType, ...row.body });
          }
        } catch (error) {
          row.bodySkipped = error.message;
        }
      }
      networkRows.push(row);
    })();
    pendingBodyTasks.add(task);
    task.finally(() => pendingBodyTasks.delete(task));
  });

  client.on('Network.loadingFailed', (event) => {
    const row = requests.get(event.requestId) || { requestId: event.requestId };
    Object.assign(row, {
      completedAt: new Date().toISOString(),
      failed: true,
      errorText: event.errorText,
      canceled: Boolean(event.canceled),
    });
    networkRows.push(row);
  });

  const terminal = readline.createInterface({ input, output });
  console.log('\nChrome is open with a dedicated Exam-Mate profile.');
  console.log('1. Log in to the authorised Exam-Mate account.');
  console.log('2. Return to an IB Diploma or MYP topical question-bank page.');
  console.log('3. Open one representative question and its Answer/Mark Scheme view.');
  console.log('4. Where available, also open a recent subscribed question and a model answer.');
  console.log('No passwords, cookies, or browser storage are written into the capture.\n');
  await terminal.question('Press Enter after the representative page is ready... ');

  const initial = sanitizeSnapshot(await evaluate(client, DOM_SNAPSHOT_EXPRESSION));
  const initialHtml = initial.html;
  delete initial.html;
  await writeFile(path.join(options.output, 'snapshots', 'initial.html'), initialHtml, 'utf8');
  await writeFile(path.join(options.output, 'snapshots', 'initial.json'), stableJson(initial), 'utf8');
  await captureSanitizedScreenshot(client, path.join(options.output, 'snapshots', 'initial.png'));

  console.log('\nNetwork recording continues. You may now click a few question references, switch');
  console.log('between Question and Answer, change one topic filter, and move to page 2.');
  await terminal.question('Press Enter when those representative interactions are complete... ');

  const final = sanitizeSnapshot(await evaluate(client, DOM_SNAPSHOT_EXPRESSION));
  const finalHtml = final.html;
  delete final.html;
  await writeFile(path.join(options.output, 'snapshots', 'final.html'), finalHtml, 'utf8');
  await writeFile(path.join(options.output, 'snapshots', 'final.json'), stableJson(final), 'utf8');
  await captureSanitizedScreenshot(client, path.join(options.output, 'snapshots', 'final.png'));
  terminal.close();

  await new Promise((resolve) => setTimeout(resolve, 1000));
  await Promise.allSettled([...pendingBodyTasks]);
  const allRows = [...new Map(networkRows.map((row) => [row.requestId, row])).values()]
    .sort((left, right) => String(left.startedAt || '').localeCompare(String(right.startedAt || '')));
  await writeFile(
    path.join(options.output, 'network', 'requests.ndjson'),
    allRows.map((row) => JSON.stringify(row)).join('\n') + '\n',
    'utf8',
  );
  await writeFile(path.join(options.output, 'network', 'bodies.json'), stableJson(bodyRows), 'utf8');

  const pageText = `${initialHtml}\n${finalHtml}`;
  const questionReferences = extractQuestionReferences(pageText);
  const browserVersion = await waitForDevtools(browser.port);
  const completedAt = new Date().toISOString();
  const summary = {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    captureId: crypto.randomUUID(),
    source: 'exam-mate',
    purpose: 'authorised-question-bank-inspection',
    startedAt,
    completedAt,
    authorization: {
      confirmed: true,
      reference: options.authorizationReference.trim(),
      evidence: permissionEvidence,
      scopeRecordedPrivately: true,
    },
    startUrl: sanitizeUrl(options.startUrl),
    finalUrl: sanitizeUrl(final.url),
    browser: {
      product: browserVersion.Browser || null,
      userAgent: browserVersion['User-Agent'] || null,
      launchedByTool: browser.launched,
    },
    security: {
      cookiesExported: false,
      localStorageExported: false,
      sessionStorageExported: false,
      authorizationHeadersExported: false,
      browserProfileIncluded: false,
    },
    counts: {
      networkRequests: allRows.length,
      capturedBodies: bodyRows.length,
      capturedBodyBytes: totalBodyBytes,
      questionReferencesObserved: questionReferences.length,
      controlsObserved: final.controls?.length || 0,
      linksObserved: final.links?.length || 0,
      scriptsObserved: final.scripts?.length || 0,
      imagesObserved: final.images?.length || 0,
    },
    questionReferences,
    nextStep: 'Review this archive, identify stable endpoints/selectors, then pin a complete capture checksum before enabling any production importer write mode.',
  };
  await writeFile(path.join(options.output, 'summary.json'), stableJson(summary), 'utf8');
  await writeFile(
    path.join(options.output, 'README.txt'),
    [
      'Authorised Exam-Mate inspection capture for DP Resources.',
      '',
      'Upload/share this ZIP or directory for importer engineering.',
      'Do NOT share the separate Chrome profile directory.',
      'The capture intentionally excludes cookies and browser storage.',
      '',
      `Capture ID: ${summary.captureId}`,
      `Authorization reference: ${summary.authorization.reference}`,
      `Observed question references: ${summary.counts.questionReferencesObserved}`,
      '',
    ].join('\n'),
    'utf8',
  );

  await writeChecksums(options.output);
  await verifyChecksums(options.output);
  const packagePath = options.package ? await packageCapture(options.output) : null;

  client.close();
  if (browser.process && !options.keepBrowserOpen) browser.process.kill('SIGTERM');

  console.log('\nCapture completed and checksum-verified.');
  console.log(`Directory: ${options.output}`);
  if (packagePath) console.log(`ZIP: ${packagePath}`);
  console.log(`Observed ${questionReferences.length} question references and captured ${bodyRows.length} response bodies.`);
}

main().catch((error) => {
  console.error(`\nExam-Mate capture failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
