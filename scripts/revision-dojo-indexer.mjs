#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_STATE = 'audits/revision-dojo-index-state.json';
const DEFAULT_REPORT = 'audits/revision-dojo-delta-latest.json';
const USER_AGENT =
  'DP-Resources-RevisionDojo-Indexer/1.0 (+metadata-and-fingerprints-only; no protected-content ingestion)';

const ORIGINS = [
  { key: 'pirateib_sh', baseUrl: 'https://dojo.pirateib.sh/', role: 'current' },
  { key: 'pirateib_su', baseUrl: 'https://dojo.pirateib.su/', role: 'current_mirror' },
  { key: 'legacy_archive', baseUrl: 'https://rev-dojo-archive.pages.dev/', role: 'legacy_fallback' },
];

const CATALOG_SEEDS = [
  '',
  'questionbank',
  'questionbanks',
  'notes',
  'study-notes',
  'cheatsheets',
  'flashcards',
  'exemplars',
  'coursework',
  'predicted-papers',
  'prediction-papers',
  'predicted-exams',
];

const RESOURCE_PATH_RE = /\b(questionbank|question-bank|questions?|notes?|study-notes?|cheatsheets?|flashcards?|exemplars?|coursework|predicted(?:-|_)?(?:papers?|exams?)|prediction(?:-|_)?(?:papers?|exams?)|mock(?:-|_)?exams?|markschemes?|past(?:-|_)?papers?)\b/i;
const IGNORE_PATH_RE = /\/(?:login|register|auth|account|settings|privacy|terms|contact|about)(?:\/|$)/i;
const ASSET_EXT_RE = /\.(?:pdf|png|jpe?g|webp|gif|svg|mp3|mp4|mov|zip|rar|7z|docx?|pptx?|xlsx?)(?:$|\?)/i;

function parseArgs(argv) {
  const options = {
    state: DEFAULT_STATE,
    report: DEFAULT_REPORT,
    writeState: false,
    maxUrls: 20_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--state') options.state = argv[++index];
    else if (token === '--report') options.report = argv[++index];
    else if (token === '--write-state') options.writeState = true;
    else if (token === '--max-urls') options.maxUrls = Number(argv[++index]);
    else if (token === '--help' || token === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!Number.isInteger(options.maxUrls) || options.maxUrls < 1 || options.maxUrls > 100_000) {
    throw new Error('--max-urls must be an integer between 1 and 100000.');
  }
  return options;
}

function usage() {
  return `\nRevisionDojo metadata/fingerprint indexer\n\n` +
    `  node scripts/revision-dojo-indexer.mjs --write-state\n\n` +
    `The scanner inventories catalog URLs and page fingerprints only. It does not copy PDFs,\n` +
    `question text, markschemes, notes, images, flashcards, or exemplar content.\n`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(value) {
  return decodeEntities(String(value || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function canonicalUrl(rawUrl, baseUrl) {
  try {
    const parsed = new URL(rawUrl, baseUrl);
    parsed.hash = '';
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      parsed.searchParams.delete(key);
    }
    if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString();
  } catch {
    return null;
  }
}

function classify(url, label = '') {
  const haystack = `${new URL(url).pathname} ${label}`.toLowerCase();
  if (/predicted|prediction/.test(haystack)) return 'predicted_paper_or_exam';
  if (/mock[-_ ]?exam/.test(haystack)) return 'mock_exam';
  if (/exemplar|coursework|\bia\b|extended[-_ ]?essay|\bee\b|\btok\b/.test(haystack)) return 'coursework_or_exemplar';
  if (/flashcard/.test(haystack)) return 'flashcards';
  if (/cheatsheet/.test(haystack)) return 'cheatsheet';
  if (/study[-_ ]?notes?|\/notes?\b/.test(haystack)) return 'revision_notes';
  if (/markscheme|mark[-_ ]?scheme/.test(haystack)) return 'markscheme';
  if (/questionbank|question[-_ ]?bank|questions?/.test(haystack)) return 'question_bank';
  if (/past[-_ ]?paper|\/papers?\b/.test(haystack)) return 'paper_or_practice';
  return 'catalog_resource';
}

function resourceItem(originKey, url, label = '', discoveredBy = 'catalog') {
  const canonical = canonicalUrl(url, url);
  if (!canonical) return null;
  const kind = classify(canonical, label);
  const normalizedLabel = stripTags(label).slice(0, 240);
  const key = sha256(`revisiondojo\n${kind}\n${canonical}`).slice(0, 32);
  return { key, source: 'revisiondojo', origin: originKey, kind, url: canonical, label: normalizedLabel, discoveredBy };
}

function dedupeItems(items) {
  const byKey = new Map();
  for (const item of items) {
    if (!item) continue;
    const existing = byKey.get(item.key);
    if (!existing || (!existing.label && item.label)) byKey.set(item.key, item);
  }
  return [...byKey.values()].sort((a, b) => `${a.kind}|${a.url}`.localeCompare(`${b.kind}|${b.url}`));
}

function parseSitemapLocs(xml, baseUrl) {
  const urls = [];
  for (const match of String(xml).matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)) {
    const value = stripTags(match[1]);
    const canonical = canonicalUrl(value, baseUrl);
    if (canonical) urls.push(canonical);
  }
  return [...new Set(urls)];
}

function extractAnchors(html, pageUrl) {
  const values = [];
  for (const match of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = match[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href || /^(?:#|javascript:|mailto:|tel:)/i.test(href.trim())) continue;
    const url = canonicalUrl(href, pageUrl);
    if (!url) continue;
    values.push({ url, label: stripTags(match[2]) });
  }
  return values;
}

function isSameOrigin(url, baseUrl) {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

function looksLikeResource(url, label = '') {
  const parsed = new URL(url);
  if (IGNORE_PATH_RE.test(parsed.pathname)) return false;
  if (ASSET_EXT_RE.test(parsed.pathname)) return false;
  return RESOURCE_PATH_RE.test(`${parsed.pathname} ${label}`);
}

async function fetchText(url, accept = 'text/html,application/xhtml+xml,application/xml,text/xml,text/plain') {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(25_000),
    headers: { 'user-agent': USER_AGENT, accept },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return {
    status: response.status,
    finalUrl: response.url,
    text,
    contentType: response.headers.get('content-type'),
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  };
}

async function readJsonIfExists(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function discoverRobotsSitemaps(baseUrl) {
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl).toString();
    const response = await fetchText(robotsUrl, 'text/plain');
    const urls = [];
    for (const match of response.text.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim)) {
      const url = canonicalUrl(match[1], baseUrl);
      if (url) urls.push(url);
    }
    return { robotsUrl, urls: [...new Set(urls)], error: null };
  } catch (error) {
    return { robotsUrl: new URL('/robots.txt', baseUrl).toString(), urls: [], error: String(error.message || error) };
  }
}

async function discoverViaSitemaps(origin, maxUrls) {
  const robots = await discoverRobotsSitemaps(origin.baseUrl);
  const queue = [...robots.urls];
  for (const pathname of ['/sitemap.xml', '/sitemap-index.xml']) {
    const candidate = new URL(pathname, origin.baseUrl).toString();
    if (!queue.includes(candidate)) queue.push(candidate);
  }

  const visited = new Set();
  const catalogUrls = [];
  const sitemapChecks = [];

  while (queue.length > 0 && catalogUrls.length < maxUrls) {
    const sitemapUrl = queue.shift();
    if (visited.has(sitemapUrl)) continue;
    visited.add(sitemapUrl);
    try {
      const response = await fetchText(sitemapUrl, 'application/xml,text/xml,text/plain');
      const locs = parseSitemapLocs(response.text, response.finalUrl);
      sitemapChecks.push({ url: sitemapUrl, status: response.status, locCount: locs.length, sha256: sha256(response.text) });
      for (const loc of locs) {
        if (!isSameOrigin(loc, origin.baseUrl)) continue;
        if (/sitemap/i.test(new URL(loc).pathname) && !visited.has(loc)) queue.push(loc);
        else if (looksLikeResource(loc)) catalogUrls.push(loc);
        if (catalogUrls.length >= maxUrls) break;
      }
    } catch (error) {
      sitemapChecks.push({ url: sitemapUrl, error: String(error.message || error) });
    }
  }

  return { robots, sitemapChecks, urls: [...new Set(catalogUrls)].slice(0, maxUrls) };
}

async function discoverViaCatalogPages(origin, maxUrls) {
  const pageChecks = [];
  const items = [];
  for (const seed of CATALOG_SEEDS) {
    if (items.length >= maxUrls) break;
    const requestedUrl = new URL(seed, origin.baseUrl).toString();
    try {
      const response = await fetchText(requestedUrl);
      const anchors = extractAnchors(response.text, response.finalUrl)
        .filter(({ url, label }) => isSameOrigin(url, origin.baseUrl) && looksLikeResource(url, label));
      pageChecks.push({
        requestedUrl,
        finalUrl: response.finalUrl,
        status: response.status,
        contentType: response.contentType,
        etag: response.etag,
        lastModified: response.lastModified,
        htmlSha256: sha256(response.text),
        linkCount: anchors.length,
      });
      for (const anchor of anchors) {
        items.push(resourceItem(origin.key, anchor.url, anchor.label, `catalog:${seed || '/'}`));
        if (items.length >= maxUrls) break;
      }
    } catch (error) {
      pageChecks.push({ requestedUrl, error: String(error.message || error) });
    }
  }
  return { pageChecks, items: dedupeItems(items) };
}

async function scanOrigin(origin, maxUrls) {
  const sitemap = await discoverViaSitemaps(origin, maxUrls);
  const sitemapItems = sitemap.urls.map((url) => resourceItem(origin.key, url, '', 'sitemap'));
  const catalog = await discoverViaCatalogPages(origin, Math.max(0, maxUrls - sitemapItems.length));
  const items = dedupeItems([...sitemapItems, ...catalog.items]).slice(0, maxUrls);
  return {
    key: origin.key,
    role: origin.role,
    baseUrl: origin.baseUrl,
    scannedAt: new Date().toISOString(),
    robots: sitemap.robots,
    sitemapChecks: sitemap.sitemapChecks,
    pageChecks: catalog.pageChecks,
    items,
  };
}

function summarizeKinds(items) {
  const counts = {};
  for (const item of items) counts[item.kind] = (counts[item.kind] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

async function scan(options) {
  const previous = await readJsonIfExists(options.state, { items: [] });
  const originResults = [];
  for (const origin of ORIGINS) {
    process.stderr.write(`Scanning ${origin.baseUrl}\n`);
    originResults.push(await scanOrigin(origin, options.maxUrls));
  }

  const items = dedupeItems(originResults.flatMap((result) => result.items));
  const previousByKey = new Map((previous.items || []).map((item) => [item.key, item]));
  const currentKeys = new Set(items.map((item) => item.key));
  const newItems = items.filter((item) => !previousByKey.has(item.key));
  const removedItems = (previous.items || []).filter((item) => !currentKeys.has(item.key));

  const report = {
    schema: 'dp_revision_dojo_delta_v1',
    generatedAt: new Date().toISOString(),
    canonicalSource: 'revisiondojo',
    requestedSite: 'https://dojo.pirateib.sh/',
    sourcePolicy: {
      discovery: 'catalog-metadata-links-and-fingerprints-only',
      protectedContent: 'never-persisted-by-scanner',
      binaryAssets: 'never-downloaded-by-scanner',
      productionImport: 'separate-authorised-reviewed-import-only',
      duplicateStrategy: 'source-independent-content-dedupe-before-any-import',
    },
    inventory: {
      itemCount: items.length,
      byKind: summarizeKinds(items),
      newItemCount: newItems.length,
      removedItemCount: removedItems.length,
    },
    newItems,
    removedItems,
    origins: originResults.map(({ items: originItems, ...result }) => ({
      ...result,
      itemCount: originItems.length,
      byKind: summarizeKinds(originItems),
    })),
  };

  await mkdir(path.dirname(options.report), { recursive: true });
  await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (options.writeState) {
    const state = {
      schema: 'dp_revision_dojo_index_state_v1',
      updatedAt: new Date().toISOString(),
      canonicalSource: 'revisiondojo',
      origins: originResults.map(({ items: _items, ...result }) => result),
      items,
    };
    await mkdir(path.dirname(options.state), { recursive: true });
    await writeFile(options.state, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }

  process.stdout.write(`${JSON.stringify({
    report: options.report,
    stateWritten: options.writeState ? options.state : null,
    items: items.length,
    newItems: newItems.length,
    removedItems: removedItems.length,
    byKind: summarizeKinds(items),
  }, null, 2)}\n`);
}

const options = parseArgs(process.argv.slice(2));
if (options.help) process.stdout.write(usage());
else scan(options).catch((error) => {
  process.stderr.write(`RevisionDojo indexer failed: ${error.message || error}\n`);
  process.exitCode = 1;
});
