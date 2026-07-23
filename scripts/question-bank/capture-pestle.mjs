#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const VERSION = "1.0.0";
const APP_URL = "https://pestle.pages.dev/app/";
const BANK_BASE_URL = "https://pestle-assets.pirateib.sh/";
const DEFAULT_BANK_CONCURRENCY = 4;
const DEFAULT_ASSET_CONCURRENCY = 12;
const RETRIES = 4;
const REQUEST_TIMEOUT_MS = 120_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nowIso = () => new Date().toISOString();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function defaultOutput() {
  const desktop = path.join(homedir(), "Desktop");
  return path.join(desktop, `PESTLE-index-${timestamp()}`);
}

function usage() {
  return `PESTLE concurrent indexer v${VERSION}

Usage:
  node pestle-indexer.mjs [options]

Options:
  --output PATH             Output directory (default: ~/Desktop/PESTLE-index-<timestamp>)
  --bank NAME               Index one bank filename or source button id; repeatable
  --include-hidden          Also fetch hidden/deprecated science variants found in index.js
  --refresh                 Redownload files already present in the output directory
  --no-assets               Do not extract or download question images
  --bank-concurrency N      Concurrent bank downloads (default: ${DEFAULT_BANK_CONCURRENCY})
  --asset-concurrency N     Concurrent linked-image downloads (default: ${DEFAULT_ASSET_CONCURRENCY})
  --fixture-dir PATH        Offline test mode using app-index.html, index.js and raw/banks/*
  --open                    Open the output folder when finished (macOS)
  --help                    Show this help

Examples:
  ./run-pestle-indexer.command
  ./run-pestle-indexer.command --bank "Geography QB.json"
  ./run-pestle-indexer.command --include-hidden
`;
}

function parsePositiveInt(value, label) {
  const n = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(n) || n < 1 || n > 64) {
    throw new Error(`${label} must be an integer from 1 to 64`);
  }
  return n;
}

export function parseArgs(argv) {
  const options = {
    output: defaultOutput(),
    requestedBanks: [],
    includeHidden: false,
    refresh: false,
    assets: true,
    bankConcurrency: DEFAULT_BANK_CONCURRENCY,
    assetConcurrency: DEFAULT_ASSET_CONCURRENCY,
    fixtureDir: null,
    open: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const take = (label) => {
      const value = argv[++i];
      if (!value) throw new Error(`${label} requires a value`);
      return value;
    };

    if (arg === "--output") options.output = take("--output");
    else if (arg.startsWith("--output=")) options.output = arg.slice(9);
    else if (arg === "--bank") options.requestedBanks.push(take("--bank"));
    else if (arg.startsWith("--bank=")) options.requestedBanks.push(arg.slice(7));
    else if (arg === "--include-hidden") options.includeHidden = true;
    else if (arg === "--refresh") options.refresh = true;
    else if (arg === "--no-assets") options.assets = false;
    else if (arg === "--bank-concurrency") options.bankConcurrency = parsePositiveInt(take("--bank-concurrency"), "--bank-concurrency");
    else if (arg.startsWith("--bank-concurrency=")) options.bankConcurrency = parsePositiveInt(arg.slice(19), "--bank-concurrency");
    else if (arg === "--asset-concurrency") options.assetConcurrency = parsePositiveInt(take("--asset-concurrency"), "--asset-concurrency");
    else if (arg.startsWith("--asset-concurrency=")) options.assetConcurrency = parsePositiveInt(arg.slice(20), "--asset-concurrency");
    else if (arg === "--fixture-dir") options.fixtureDir = path.resolve(take("--fixture-dir"));
    else if (arg.startsWith("--fixture-dir=")) options.fixtureDir = path.resolve(arg.slice(14));
    else if (arg === "--open") options.open = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  options.output = path.resolve(options.output);
  return options;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function ensureParent(file) {
  await mkdir(path.dirname(file), { recursive: true });
}

function safeFilename(filename) {
  const base = path.basename(filename);
  if (base !== filename || !base.toLowerCase().endsWith(".json")) {
    throw new Error(`Unsafe bank filename discovered: ${filename}`);
  }
  return base;
}

async function withTimeout(timeoutMs, operation) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Request timed out")), timeoutMs);
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function download(url, destination, { refresh = false, label = path.basename(destination) } = {}) {
  await ensureParent(destination);
  if (!refresh && await exists(destination) && (await stat(destination)).size > 0) {
    return { status: "reused", url, destination, bytes: (await stat(destination)).size };
  }

  const partial = `${destination}.part`;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    await rm(partial, { force: true });
    try {
      const response = await withTimeout(REQUEST_TIMEOUT_MS, (signal) => fetch(url, {
        signal,
        redirect: "follow",
        headers: { "user-agent": `DP-Resources-PESTLE-Indexer/${VERSION}` },
      }));
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
      const info = await stat(partial);
      if (info.size === 0) throw new Error("Downloaded file is empty");
      await rename(partial, destination);
      return {
        status: "downloaded",
        url: response.url || url,
        destination,
        bytes: info.size,
        contentType: response.headers.get("content-type"),
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
      };
    } catch (error) {
      await rm(partial, { force: true });
      if (attempt === RETRIES) throw new Error(`${label}: ${error.message}`);
      await sleep(600 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`${label}: download failed`);
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = { ok: true, value: await worker(items[index], index) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export function discoverBanks(html, source) {
  const mapBlock = source.match(/(?:const|let|var)\s+fileNameMap\s*=\s*\{([\s\S]*?)\}\s*;/);
  if (!mapBlock) throw new Error("Could not find fileNameMap in index.js");

  const mapping = new Map();
  for (const match of mapBlock[1].matchAll(/["']([^"']+)["']\s*:\s*["']([^"']+\.json)["']/g)) {
    mapping.set(match[1], safeFilename(match[2]));
  }
  if (mapping.size === 0) throw new Error("fileNameMap was found but contained no JSON banks");

  const uncommented = html.replace(/<!--[\s\S]*?-->/g, "");
  const activeIds = [];
  for (const match of uncommented.matchAll(/<button\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    if (mapping.has(match[1]) && !activeIds.includes(match[1])) activeIds.push(match[1]);
  }

  const live = activeIds.map((id) => ({ id, filename: mapping.get(id), visibility: "live" }));
  const hidden = [...mapping.entries()]
    .filter(([id]) => !activeIds.includes(id))
    .map(([id, filename]) => ({ id, filename, visibility: "hidden" }));
  if (live.length === 0) throw new Error("No live bank buttons matched fileNameMap");
  return { live, hidden, all: [...live, ...hidden] };
}

function chooseBanks(discovery, options) {
  let selected = options.includeHidden ? discovery.all : discovery.live;
  if (options.requestedBanks.length) {
    selected = options.requestedBanks.map((requested) => {
      const match = discovery.all.find((bank) => bank.id === requested || bank.filename.toLowerCase() === requested.toLowerCase());
      if (!match) throw new Error(`Requested bank not found in live source: ${requested}`);
      return match;
    });
  }
  return [...new Map(selected.map((bank) => [bank.filename, bank])).values()];
}

async function captureSource(root, options) {
  const sourceDir = path.join(root, "source");
  await mkdir(sourceDir, { recursive: true });
  const targets = [
    { name: "app-index.html", url: APP_URL },
    { name: "index.js", url: new URL("./index.js", APP_URL).href },
    { name: "style.css", url: new URL("../assets/style.css", APP_URL).href },
    { name: "favicon.svg", url: new URL("../favicon.svg", APP_URL).href },
  ];

  if (options.fixtureDir) {
    for (const target of targets) {
      const source = path.join(options.fixtureDir, "source", target.name);
      const fallback = path.join(options.fixtureDir, target.name);
      const input = await exists(source) ? source : fallback;
      if (await exists(input)) await copyFile(input, path.join(sourceDir, target.name));
      else if (["app-index.html", "index.js"].includes(target.name)) throw new Error(`Fixture missing ${target.name}`);
    }
  } else {
    const results = await mapLimit(targets, 4, (target) => download(target.url, path.join(sourceDir, target.name), { refresh: options.refresh, label: target.name }));
    const failed = results.find((result, index) => !result.ok && ["app-index.html", "index.js"].includes(targets[index].name));
    if (failed) throw failed.error;
  }

  return {
    html: await readFile(path.join(sourceDir, "app-index.html"), "utf8"),
    source: await readFile(path.join(sourceDir, "index.js"), "utf8"),
    sourceDir,
  };
}

export async function* iterateJsonArray(filename) {
  const stream = createReadStream(filename, { encoding: "utf8" });
  let arrayStarted = false;
  let arrayEnded = false;
  let collecting = false;
  let inString = false;
  let escaped = false;
  let depth = 0;
  let buffer = "";

  for await (const chunk of stream) {
    for (const char of chunk) {
      if (!arrayStarted) {
        if (/\s/.test(char)) continue;
        if (char !== "[") throw new Error("Top-level JSON value is not an array");
        arrayStarted = true;
        continue;
      }
      if (arrayEnded) {
        if (!/\s/.test(char)) throw new Error("Unexpected content after top-level array");
        continue;
      }
      if (!collecting) {
        if (/\s/.test(char) || char === ",") continue;
        if (char === "]") {
          arrayEnded = true;
          continue;
        }
        if (char !== "{") throw new Error(`Expected a question object, found ${JSON.stringify(char)}`);
        collecting = true;
        depth = 1;
        buffer = char;
        continue;
      }

      buffer += char;
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{" || char === "[") depth += 1;
      else if (char === "}" || char === "]") depth -= 1;

      if (depth === 0) {
        yield JSON.parse(buffer);
        collecting = false;
        buffer = "";
      }
    }
  }

  if (!arrayStarted) throw new Error("JSON file is empty");
  if (collecting || !arrayEnded) throw new Error("JSON array ended unexpectedly");
}

function decodeEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

export function normalizeHtml(value) {
  return decodeEntities(String(value || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<img\b[^>]*>/gi, " [image] ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .normalize("NFKC")
    .replace(/\r/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function recordMetadata(questionId) {
  const parts = String(questionId || "").split(".").filter(Boolean);
  const sessionIndex = parts.findIndex((part) => /^\d{2}[MN]$/i.test(part));
  const level = parts.find((part) => /^(?:SL|HL)$/i.test(part)) || null;
  const timezone = parts.find((part) => /^TZ\d+$/i.test(part)) || null;
  return {
    session: sessionIndex >= 0 ? parts[sessionIndex].toUpperCase() : null,
    paper: sessionIndex >= 0 ? parts[sessionIndex + 1] || null : null,
    level: level ? level.toUpperCase() : null,
    timezone: timezone ? timezone.toUpperCase() : null,
  };
}

function extractImageSources(html) {
  const sources = [];
  const pattern = /<img\b[^>]*?\bsrc\s*=\s*(?:(["'])([\s\S]*?)\1|([^\s>]+))/gi;
  for (const match of String(html || "").matchAll(pattern)) {
    const src = (match[2] || match[3] || "").trim();
    if (src) sources.push(src);
  }
  return sources;
}

function mimeExtension(mime) {
  const normalized = String(mime || "").toLowerCase().split(";")[0];
  return {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/bmp": ".bmp",
  }[normalized] || ".bin";
}

function linkedExtension(url) {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : ".bin";
  } catch {
    return ".bin";
  }
}

async function writeWithBackpressure(stream, value) {
  if (stream.write(value)) return;
  await new Promise((resolve, reject) => {
    stream.once("drain", resolve);
    stream.once("error", reject);
  });
}

async function closeStream(stream) {
  await new Promise((resolve, reject) => {
    stream.end(resolve);
    stream.once("error", reject);
  });
}

async function processBank(bank, rawFile, root, assetState, options) {
  const slug = bank.filename.replace(/\.json$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const recordsFile = path.join(root, "index", "questions", `${slug}.ndjson`);
  await ensureParent(recordsFile);
  const recordsStream = createWriteStream(recordsFile, { encoding: "utf8" });
  const ids = new Set();
  const duplicateIds = [];
  const topics = new Set();
  const subtopics = new Set();
  let recordCount = 0;
  let questionParts = 0;
  let embeddedImages = 0;
  let linkedImages = 0;
  let examinerReports = 0;

  try {
    for await (const record of iterateJsonArray(rawFile)) {
      recordCount += 1;
      const questionId = String(record.question_id || "").trim();
      if (ids.has(questionId)) duplicateIds.push(questionId);
      ids.add(questionId);
      for (const topic of Array.isArray(record.topics) ? record.topics : []) topics.add(String(topic));
      for (const subtopic of Array.isArray(record.subtopics) ? record.subtopics : []) subtopics.add(String(subtopic));

      const questionHtml = String(record.Question || "");
      const markschemeHtml = String(record.Markscheme || "");
      const reportHtml = String(record["Examiners report"] || "");
      const questionText = normalizeHtml(questionHtml);
      const markschemeText = normalizeHtml(markschemeHtml);
      const reportText = normalizeHtml(reportHtml);
      const reportSubstantive = reportText.replace(/\[N\/A\]/gi, "").replace(/[a-z]\./gi, "").trim().length > 20;
      if (reportSubstantive) examinerReports += 1;
      const parts = (questionHtml.match(/class\s*=\s*["'][^"']*question_part_label/gi) || []).length;
      questionParts += Math.max(1, parts);

      const marks = [...questionHtml.matchAll(/class\s*=\s*["'][^"']*marks[^"']*["'][^>]*>\s*\[?\s*(\d+)\s*\]?/gi)].map((match) => Number(match[1]));
      const indexed = {
        bank: bank.filename,
        source_visibility: bank.visibility,
        question_id: questionId,
        ...recordMetadata(questionId),
        topics: Array.isArray(record.topics) ? record.topics : [],
        subtopics: Array.isArray(record.subtopics) ? record.subtopics : [],
        question_parts: Math.max(1, parts),
        marks,
        has_examiner_report: reportSubstantive,
        question_sha256: sha256(questionHtml),
        markscheme_sha256: sha256(markschemeHtml),
        examiner_report_sha256: sha256(reportHtml),
        normalized_question_sha256: sha256(questionText.toLowerCase()),
        normalized_question_preview: questionText.slice(0, 500),
      };
      await writeWithBackpressure(recordsStream, `${JSON.stringify(indexed)}\n`);

      if (!options.assets) continue;
      for (const [field, html] of [["Question", questionHtml], ["Markscheme", markschemeHtml], ["Examiners report", reportHtml]]) {
        const sources = extractImageSources(html);
        for (let ordinal = 0; ordinal < sources.length; ordinal += 1) {
          const src = sources[ordinal];
          const dataMatch = src.match(/^data:([^;,]+);base64,([\s\S]+)$/i);
          if (dataMatch) {
            const mime = dataMatch[1].toLowerCase();
            let bytes;
            try {
              bytes = Buffer.from(dataMatch[2].replace(/\s+/g, ""), "base64");
            } catch {
              assetState.failures.push({ bank: bank.filename, question_id: questionId, field, ordinal, kind: "embedded", error: "Invalid base64 image" });
              continue;
            }
            const hash = sha256(bytes);
            const relative = path.join("assets", "embedded", `${hash}${mimeExtension(mime)}`);
            const destination = path.join(root, relative);
            if (!assetState.embedded.has(hash)) {
              await ensureParent(destination);
              await writeFile(destination, bytes, { flag: "wx" }).catch((error) => {
                if (error.code !== "EEXIST") throw error;
              });
              assetState.embedded.set(hash, { path: relative, bytes: bytes.length, mime });
            }
            embeddedImages += 1;
            assetState.occurrences.push({
              bank: bank.filename, question_id: questionId, field, ordinal,
              kind: "embedded", sha256: hash, mime, bytes: bytes.length,
              path: relative.split(path.sep).join("/"),
            });
          } else {
            let url;
            try {
              url = new URL(src, APP_URL).href;
            } catch {
              assetState.failures.push({ bank: bank.filename, question_id: questionId, field, ordinal, kind: "linked", source: src, error: "Invalid image URL" });
              continue;
            }
            if (!/^https:\/\//i.test(url)) {
              assetState.failures.push({ bank: bank.filename, question_id: questionId, field, ordinal, kind: "linked", source: src, error: "Non-HTTPS image URL rejected" });
              continue;
            }
            const urlHash = sha256(url);
            const relative = path.join("assets", "linked", `${urlHash}${linkedExtension(url)}`);
            if (!assetState.linked.has(url)) assetState.linked.set(url, { url, relative });
            linkedImages += 1;
            assetState.occurrences.push({
              bank: bank.filename, question_id: questionId, field, ordinal,
              kind: "linked", source: src, resolved_url: url,
              path: relative.split(path.sep).join("/"),
            });
          }
        }
      }
    }
  } finally {
    await closeStream(recordsStream);
  }

  return {
    id: bank.id,
    filename: bank.filename,
    visibility: bank.visibility,
    raw_file: path.relative(root, rawFile).split(path.sep).join("/"),
    records_file: path.relative(root, recordsFile).split(path.sep).join("/"),
    records: recordCount,
    unique_question_ids: ids.size,
    duplicate_question_ids: duplicateIds,
    question_parts: questionParts,
    topics: [...topics].sort(),
    subtopics: [...subtopics].sort(),
    unique_topics: topics.size,
    unique_subtopics: subtopics.size,
    substantive_examiner_reports: examinerReports,
    embedded_image_occurrences: embeddedImages,
    linked_image_occurrences: linkedImages,
  };
}

async function downloadLinkedAssets(root, assetState, options) {
  if (!options.assets || assetState.linked.size === 0) return [];
  const items = [...assetState.linked.values()];
  const results = await mapLimit(items, options.assetConcurrency, async (item, index) => {
    const destination = path.join(root, item.relative);
    const result = await download(item.url, destination, { refresh: options.refresh, label: `linked image ${index + 1}/${items.length}` });
    return { ...item, ...result, path: item.relative.split(path.sep).join("/") };
  });
  for (let i = 0; i < results.length; i += 1) {
    if (!results[i].ok) assetState.failures.push({ kind: "linked", source: items[i].url, path: items[i].relative, error: results[i].error.message });
  }
  return results;
}

async function hashFile(filename) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filename)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { hash: hash.digest("hex"), bytes };
}

async function listFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, full));
    else if (entry.isFile() && entry.name !== "checksums.sha256" && !/^PESTLE-audit-bundle-.*\.zip$/i.test(entry.name)) files.push(full);
  }
  return files;
}

async function writeChecksums(root) {
  const files = (await listFiles(root)).sort();
  const results = await mapLimit(files, 4, async (file) => ({ file, ...await hashFile(file) }));
  const lines = results.map((result) => {
    if (!result.ok) throw result.error;
    const relative = path.relative(root, result.value.file).split(path.sep).join("/");
    return `${result.value.hash}  ${relative}`;
  });
  await writeFile(path.join(root, "checksums.sha256"), `${lines.join("\n")}\n`);
}

async function downloadBanks(selected, root, options) {
  const rawDir = path.join(root, "raw", "banks");
  await mkdir(rawDir, { recursive: true });
  return mapLimit(selected, options.bankConcurrency, async (bank, index) => {
    const filename = safeFilename(bank.filename);
    const destination = path.join(rawDir, filename);
    console.log(`[bank ${index + 1}/${selected.length}] ${filename}`);
    let result;
    if (options.fixtureDir) {
      const candidates = [
        path.join(options.fixtureDir, "raw", "banks", filename),
        path.join(options.fixtureDir, filename),
      ];
      const source = await exists(candidates[0]) ? candidates[0] : candidates[1];
      if (!await exists(source)) throw new Error(`Fixture missing bank: ${filename}`);
      await copyFile(source, destination);
      result = { status: "copied-fixture", url: null, destination, bytes: (await stat(destination)).size };
    } else {
      const url = new URL(encodeURIComponent(filename), BANK_BASE_URL).href;
      result = await download(url, destination, { refresh: options.refresh, label: filename });
    }
    await writeFile(`${destination}.source.json`, json({ bank, captured_at: nowIso(), ...result, destination: path.basename(destination) }));
    return { bank, rawFile: destination, download: result };
  });
}

async function writeNdjson(filename, rows) {
  await ensureParent(filename);
  const handle = await open(filename, "w");
  try {
    for (const row of rows) await handle.write(`${JSON.stringify(row)}\n`);
  } finally {
    await handle.close();
  }
}

async function openOutput(root) {
  if (process.platform !== "darwin") return;
  const child = spawn("open", [root], { detached: true, stdio: "ignore" });
  child.unref();
}

async function createAuditBundle(root) {
  const filename = `PESTLE-audit-bundle-${timestamp()}.zip`;
  const destination = path.join(root, filename);
  const inputs = ["summary.json", "checksums.sha256", "source", "index"];
  try {
    await new Promise((resolve, reject) => {
      const child = spawn("zip", ["-r", "-9", destination, ...inputs], {
        cwd: root,
        stdio: "ignore",
      });
      child.once("error", reject);
      child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`zip exited with code ${code}`)));
    });
    return destination;
  } catch (error) {
    console.warn(`Could not create the upload-ready audit ZIP: ${error.message}`);
    return null;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  const startedAt = nowIso();
  await mkdir(options.output, { recursive: true });
  console.log(`\nPESTLE concurrent indexer v${VERSION}`);
  console.log(`Output: ${options.output}`);

  console.log("\nCapturing live source...");
  const capture = await captureSource(options.output, options);
  const discovery = discoverBanks(capture.html, capture.source);
  const selected = chooseBanks(discovery, options);
  console.log(`Discovered ${discovery.live.length} live and ${discovery.hidden.length} hidden bank files.`);
  console.log(`Selected ${selected.length} bank files.`);

  await writeFile(path.join(options.output, "source", "bank-discovery.json"), json({
    captured_at: nowIso(), app_url: APP_URL, bank_base_url: BANK_BASE_URL,
    live: discovery.live, hidden: discovery.hidden, selected,
  }));

  console.log(`\nDownloading banks with concurrency ${options.bankConcurrency}...`);
  const downloadResults = await downloadBanks(selected, options.output, options);
  const successfulDownloads = downloadResults.filter((result) => result.ok).map((result) => result.value);
  const failedBanks = downloadResults.flatMap((result, index) => result.ok ? [] : [{ ...selected[index], stage: "download", error: result.error.message }]);

  const assetState = { embedded: new Map(), linked: new Map(), occurrences: [], failures: [] };
  const bankSummaries = [];
  console.log(`\nIndexing ${successfulDownloads.length} downloaded banks sequentially...`);
  for (let i = 0; i < successfulDownloads.length; i += 1) {
    const item = successfulDownloads[i];
    console.log(`[index ${i + 1}/${successfulDownloads.length}] ${item.bank.filename}`);
    try {
      bankSummaries.push(await processBank(item.bank, item.rawFile, options.output, assetState, options));
    } catch (error) {
      failedBanks.push({ ...item.bank, stage: "index", error: error.message });
    }
  }

  console.log(`\nDownloading ${assetState.linked.size} linked images with concurrency ${options.assetConcurrency}...`);
  const linkedResults = await downloadLinkedAssets(options.output, assetState, options);
  await writeNdjson(path.join(options.output, "index", "asset-occurrences.ndjson"), assetState.occurrences);
  await writeNdjson(path.join(options.output, "index", "asset-failures.ndjson"), assetState.failures);
  await writeFile(path.join(options.output, "index", "bank-summary.json"), json(bankSummaries));

  const totals = bankSummaries.reduce((acc, bank) => {
    acc.banks += 1;
    acc.records += bank.records;
    acc.uniqueQuestionIds += bank.unique_question_ids;
    acc.questionParts += bank.question_parts;
    acc.examinerReports += bank.substantive_examiner_reports;
    acc.embeddedImageOccurrences += bank.embedded_image_occurrences;
    acc.linkedImageOccurrences += bank.linked_image_occurrences;
    return acc;
  }, { banks: 0, records: 0, uniqueQuestionIds: 0, questionParts: 0, examinerReports: 0, embeddedImageOccurrences: 0, linkedImageOccurrences: 0 });

  const summary = {
    format: "dp-resources-pestle-index-v1",
    indexer_version: VERSION,
    started_at: startedAt,
    completed_at: nowIso(),
    app_url: APP_URL,
    bank_base_url: BANK_BASE_URL,
    output_directory: options.output,
    options: {
      include_hidden: options.includeHidden,
      assets: options.assets,
      bank_concurrency: options.bankConcurrency,
      asset_concurrency: options.assetConcurrency,
      fixture_mode: Boolean(options.fixtureDir),
    },
    discovered: { live_banks: discovery.live.length, hidden_banks: discovery.hidden.length },
    selected_banks: selected.length,
    successful_bank_downloads: successfulDownloads.length,
    failed_banks: failedBanks,
    totals,
    unique_embedded_assets: assetState.embedded.size,
    unique_linked_assets: assetState.linked.size,
    linked_asset_downloads_succeeded: linkedResults.filter((result) => result.ok).length,
    asset_failures: assetState.failures.length,
  };
  await writeFile(path.join(options.output, "summary.json"), json(summary));

  console.log("\nWriting SHA-256 checksums...");
  await writeChecksums(options.output);
  const auditBundle = await createAuditBundle(options.output);
  if (auditBundle) console.log(`Upload-ready audit ZIP: ${auditBundle}`);
  if (options.open) await openOutput(options.output);

  console.log("\nIndexing complete.");
  console.log(json(summary));
  if (failedBanks.length || assetState.failures.length) process.exitCode = 2;
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
