#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ORIGINS = [
  { key: 'pirateib_sh', url: 'https://dojo.pirateib.sh/' },
  { key: 'pirateib_su', url: 'https://dojo.pirateib.su/' },
  { key: 'legacy_archive', url: 'https://rev-dojo-archive.pages.dev/' },
];
const SEEDS = ['', 'questionbank', 'questionbanks', 'notes', 'study-notes', 'cheatsheets', 'flashcards', 'exemplars', 'coursework', 'predicted-papers', 'prediction-papers', 'predicted-exams', 'mock-exams', 'past-papers'];
const ASSET_RE = /\.(?:pdf|png|jpe?g|webp|gif|svg|mp3|m4a|wav|ogg|mp4|mov|webm|zip|rar|7z|docx?|pptx?|xlsx?)(?:$|\?)/i;
const STATIC_RE = /\.(?:js|mjs|css|map|json|woff2?|ttf|otf|ico)(?:$|\?)/i;
const IGNORE_RE = /\/(?:login|register|auth|account|settings|privacy|terms|contact|about)(?:\/|$)/i;
const RESOURCE_RE = /question|paper|markscheme|mark[-_ ]scheme|note|cheatsheet|flashcard|exemplar|coursework|predicted|prediction|mock|\bia\b|\bee\b|\btok\b/i;
const UA = 'DP-Resources-RevisionDojo-FullCrawler/1.0 (+metadata-fingerprints-only)';

function args(argv) {
  const o = { maxUrls: 50000, maxDepth: 24, concurrency: 10, timeoutMs: 10000, report: 'audits/revision-dojo-full-delta.json', manifest: 'audits/revision-dojo-full-manifest.json', state: 'audits/revision-dojo-full-state.json', writeState: false, origins: null };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--max-urls') o.maxUrls = Number(argv[++i]);
    else if (t === '--max-depth') o.maxDepth = Number(argv[++i]);
    else if (t === '--concurrency') o.concurrency = Number(argv[++i]);
    else if (t === '--timeout-ms') o.timeoutMs = Number(argv[++i]);
    else if (t === '--report') o.report = argv[++i];
    else if (t === '--manifest') o.manifest = argv[++i];
    else if (t === '--state') o.state = argv[++i];
    else if (t === '--origins') o.origins = argv[++i].split(',').map((x) => x.trim()).filter(Boolean);
    else if (t === '--write-state') o.writeState = true;
    else if (t === '--help' || t === '-h') o.help = true;
    else throw new Error(`Unknown argument: ${t}`);
  }
  if (!Number.isInteger(o.maxUrls) || o.maxUrls < 1 || o.maxUrls > 100000) throw new Error('--max-urls must be 1..100000');
  if (!Number.isInteger(o.maxDepth) || o.maxDepth < 0 || o.maxDepth > 100) throw new Error('--max-depth must be 0..100');
  if (!Number.isInteger(o.concurrency) || o.concurrency < 1 || o.concurrency > 32) throw new Error('--concurrency must be 1..32');
  return o;
}

function help() {
  return `RevisionDojo full route crawler\n\nnode scripts/revision-dojo-full-crawl.mjs --write-state --max-urls 50000 --max-depth 24 --concurrency 10\n\nCurrent PirateIB mirrors only:\nnode scripts/revision-dojo-full-crawl.mjs --write-state --origins pirateib_sh,pirateib_su --max-urls 50000 --max-depth 24 --concurrency 10\n\nThis inventories routes, resource URLs, asset URLs and hashes. It does not download or persist protected question/PDF/note/image bodies.\n`;
}

const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const clean = (v) => String(v || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
function canon(raw, base) {
  try {
    const u = new URL(raw, base); if (!/^https?:$/.test(u.protocol)) return null; u.hash = '';
    for (const k of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid']) u.searchParams.delete(k);
    u.searchParams.sort(); if (u.pathname !== '/') u.pathname = u.pathname.replace(/\/+$/, ''); return u.toString();
  } catch { return null; }
}
const sameOrigin = (u, base) => { try { return new URL(u).origin === new URL(base).origin; } catch { return false; } };
const crawlable = (u, base) => sameOrigin(u, base) && !IGNORE_RE.test(new URL(u).pathname) && !ASSET_RE.test(new URL(u).pathname) && !STATIC_RE.test(new URL(u).pathname);
function kind(u, label = '') {
  const s = `${new URL(u).pathname} ${label}`.toLowerCase();
  if (/predicted|prediction/.test(s)) return 'predicted_paper_or_exam';
  if (/mock[-_ ]?exam/.test(s)) return 'mock_exam';
  if (/exemplar|coursework|\bia\b|extended[-_ ]?essay|\bee\b|\btok\b/.test(s)) return 'coursework_or_exemplar';
  if (/flashcard/.test(s)) return 'flashcards'; if (/cheatsheet/.test(s)) return 'cheatsheet';
  if (/study[-_ ]?notes?|\/notes?\b/.test(s)) return 'revision_notes';
  if (/markscheme|mark[-_ ]?scheme/.test(s)) return 'markscheme';
  if (/questionbank|question[-_ ]?bank|questions?/.test(s)) return 'question_bank';
  if (/past[-_ ]?paper|\/papers?\b/.test(s)) return 'paper_or_practice'; return 'catalog_resource';
}
function anchors(html, page) {
  const out = []; for (const m of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const h = m[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]; if (!h || /^(?:#|javascript:|mailto:|tel:|data:)/i.test(h)) continue;
    const u = canon(h, page); if (u) out.push({ url: u, label: clean(m[2]).slice(0, 240) });
  } return out;
}
function assets(html, page, origin) {
  const out = new Map(); const add = (raw, role) => { const u = canon(raw, page); if (!u || !ASSET_RE.test(new URL(u).pathname)) return; const key = sha(`asset\n${u}`).slice(0,32); if (!out.has(key)) out.set(key, { key, origin, url: u, role, extension: new URL(u).pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || null, discoveredOn: page }); };
  for (const m of String(html).matchAll(/<(?:img|source|video|audio|embed|iframe)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) add(m[1], 'embedded_asset');
  for (const m of String(html).matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) add(m[1], 'linked_asset');
  for (const m of String(html).matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi)) for (const c of m[1].split(',')) add(c.trim().split(/\s+/)[0], 'responsive_image');
  return [...out.values()];
}
async function get(url, timeoutMs, accept = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1') {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': UA, accept } });
  const text = await r.text(); if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return { status: r.status, url: r.url, text, type: r.headers.get('content-type') || '', etag: r.headers.get('etag'), modified: r.headers.get('last-modified') };
}
async function sitemapSeeds(origin, o) {
  const todo = [new URL('/sitemap.xml', origin).toString(), new URL('/sitemap-index.xml', origin).toString()]; const seen = new Set(); const pages = new Set();
  try { const r = await get(new URL('/robots.txt', origin), o.timeoutMs, 'text/plain'); for (const m of r.text.matchAll(/^\s*Sitemap:\s*(\S+)/gim)) todo.push(canon(m[1], origin)); } catch {}
  while (todo.length && seen.size < 250) {
    const batch = todo.splice(0, o.concurrency).filter(Boolean).filter((u) => !seen.has(u)); batch.forEach((u) => seen.add(u));
    const rs = await Promise.all(batch.map(async (u) => { try { return await get(u, o.timeoutMs, 'application/xml,text/xml,text/plain'); } catch { return null; } }));
    for (const r of rs.filter(Boolean)) for (const m of r.text.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)) { const u = canon(clean(m[1]), r.url); if (!u || !sameOrigin(u, origin)) continue; if (/sitemap/i.test(new URL(u).pathname)) todo.push(u); else if (crawlable(u, origin)) pages.add(u); }
  } return [...pages];
}
async function crawl(origin, o) {
  const q = [], queued = new Set(), visited = new Set(), pages = [], errors = [], resourceMap = new Map(), assetMap = new Map();
  const enqueue = (u, d, via) => { u = canon(u, origin.url); if (!u || !crawlable(u, origin.url) || d > o.maxDepth || visited.has(u) || queued.has(u) || visited.size + queued.size >= o.maxUrls) return; queued.add(u); q.push({u,d,via}); };
  enqueue(origin.url, 0, 'root'); SEEDS.forEach((s) => enqueue(new URL(s, origin.url), 0, `seed:${s || '/'}`)); for (const u of await sitemapSeeds(origin.url, o)) enqueue(u, 0, 'sitemap');
  while (q.length && visited.size < o.maxUrls) {
    const batch = q.splice(0, o.concurrency); batch.forEach((x) => queued.delete(x.u));
    const rs = await Promise.all(batch.map(async (x) => { if (visited.has(x.u)) return null; visited.add(x.u); try { return { x, r: await get(x.u, o.timeoutMs) }; } catch (e) { return { x, e: String(e.message || e) }; } }));
    for (const z of rs.filter(Boolean)) {
      if (z.e) { errors.push({ url:z.x.u, depth:z.x.d, error:z.e }); continue; }
      const finalUrl = canon(z.r.url, z.x.u) || z.x.u; const as = assets(z.r.text, finalUrl, origin.key); as.forEach((a) => assetMap.set(a.key, a)); const an = anchors(z.r.text, finalUrl);
      for (const a of an) { if (ASSET_RE.test(new URL(a.url).pathname)) continue; if (sameOrigin(a.url, origin.url)) { if (RESOURCE_RE.test(`${new URL(a.url).pathname} ${a.label}`)) { const k = kind(a.url,a.label); const key = sha(`resource\n${k}\n${a.url}`).slice(0,32); resourceMap.set(key,{key,source:'revisiondojo',origin:origin.key,kind:k,url:a.url,label:a.label,discoveredOn:finalUrl}); } enqueue(a.url,z.x.d+1,finalUrl); } }
      if (RESOURCE_RE.test(new URL(finalUrl).pathname)) { const k = kind(finalUrl); const key = sha(`resource\n${k}\n${finalUrl}`).slice(0,32); if (!resourceMap.has(key)) resourceMap.set(key,{key,source:'revisiondojo',origin:origin.key,kind:k,url:finalUrl,label:'',discoveredOn:z.x.via}); }
      pages.push({ origin:origin.key, requestedUrl:z.x.u, finalUrl, depth:z.x.d, status:z.r.status, contentType:z.r.type, etag:z.r.etag, lastModified:z.r.modified, htmlSha256:sha(z.r.text), title:clean(z.r.text.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').slice(0,300), internalLinkCount:an.filter((a)=>sameOrigin(a.url,origin.url)).length, assetRefCount:as.length });
    }
  }
  return { origin:origin.key, baseUrl:origin.url, pages, errors, resources:[...resourceMap.values()], assets:[...assetMap.values()], truncated:q.length>0 };
}
const counts = (xs) => xs.reduce((a,x)=>(a[x.kind]=(a[x.kind]||0)+1,a),{});
async function readJson(file,fallback){ try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e?.code==='ENOENT')return fallback;throw e;} }
async function main(o) {
  const selected = o.origins ? ORIGINS.filter((x)=>o.origins.includes(x.key)) : ORIGINS; if (!selected.length) throw new Error('No matching origins selected');
  const previous = await readJson(o.state,{logicalResources:[]}); const results = await Promise.all(selected.map((x)=>crawl(x,o)));
  const occurrences = results.flatMap((r)=>r.resources); const logical = new Map(); for (const x of occurrences) { const u=new URL(x.url); const lk=`${x.kind}\n${u.pathname.toLowerCase()}\n${u.search}`; const key=sha(`logical\n${lk}`).slice(0,32); const g=logical.get(key)||{key,source:'revisiondojo',kind:x.kind,path:u.pathname,query:u.search,label:x.label||'',occurrences:[]}; g.occurrences.push({origin:x.origin,url:x.url,discoveredOn:x.discoveredOn}); if(!g.label&&x.label)g.label=x.label; logical.set(key,g); }
  const logicalResources=[...logical.values()].sort((a,b)=>`${a.kind}|${a.path}`.localeCompare(`${b.kind}|${b.path}`)); const prev=new Map((previous.logicalResources||[]).map((x)=>[x.key,x])); const cur=new Set(logicalResources.map((x)=>x.key)); const newItems=logicalResources.filter((x)=>!prev.has(x.key)); const removedItems=(previous.logicalResources||[]).filter((x)=>!cur.has(x.key));
  const manifest={schema:'dp_revision_dojo_full_manifest_v1',generatedAt:new Date().toISOString(),canonicalSource:'revisiondojo',logicalResources,resourceOccurrences:occurrences,assets:results.flatMap((r)=>r.assets),pages:results.flatMap((r)=>r.pages)};
  const report={schema:'dp_revision_dojo_full_delta_v1',generatedAt:manifest.generatedAt,canonicalSource:'revisiondojo',policy:{discovery:'recursive-route-metadata-and-fingerprints',protectedContent:'not-persisted',binaryAssets:'urls-only-not-downloaded',import:'separate-authorised-reviewed-import-only'},inventory:{origins:results.length,pages:manifest.pages.length,pageErrors:results.reduce((n,r)=>n+r.errors.length,0),logicalResources:logicalResources.length,resourceOccurrences:occurrences.length,assetUrls:manifest.assets.length,byKind:counts(logicalResources),newItems:newItems.length,removedItems:removedItems.length},newItems,removedItems,origins:results.map((r)=>({origin:r.origin,baseUrl:r.baseUrl,pages:r.pages.length,errors:r.errors.length,resources:r.resources.length,assets:r.assets.length,truncated:r.truncated,errorDetails:r.errors}))};
  await mkdir(path.dirname(o.manifest),{recursive:true}); await mkdir(path.dirname(o.report),{recursive:true}); await writeFile(o.manifest,`${JSON.stringify(manifest,null,2)}\n`); await writeFile(o.report,`${JSON.stringify(report,null,2)}\n`);
  if(o.writeState){await mkdir(path.dirname(o.state),{recursive:true});await writeFile(o.state,`${JSON.stringify({schema:'dp_revision_dojo_full_state_v1',updatedAt:manifest.generatedAt,logicalResources,pageFingerprints:manifest.pages.map(({origin,finalUrl,htmlSha256,etag,lastModified,status})=>({origin,finalUrl,htmlSha256,etag,lastModified,status}))},null,2)}\n`);}
  console.log(JSON.stringify({report:o.report,manifest:o.manifest,state:o.writeState?o.state:null,...report.inventory},null,2));
}
const o=args(process.argv.slice(2)); if(o.help) console.log(help()); else main(o).catch((e)=>{console.error(`RevisionDojo full crawl failed: ${e.message||e}`);process.exit(1);});
