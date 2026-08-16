#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

import {
  getPrivateR2Object,
  putPrivateR2Object,
} from './r2-s3.mjs';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseArguments(argv) {
  const options = {
    write: false,
    confirmProduction: false,
    force: false,
    limit: null,
  };
  for (const token of argv) {
    if (token === '--write') options.write = true;
    else if (token === '--confirm-production') options.confirmProduction = true;
    else if (token === '--force') options.force = true;
    else if (token.startsWith('--limit=')) {
      options.limit = Number(token.slice('--limit='.length));
      if (!Number.isSafeInteger(options.limit) || options.limit < 1)
        throw new Error('--limit must be a positive integer');
    } else throw new Error(`Unknown argument: ${token}`);
  }
  if (options.write && !options.confirmProduction) {
    throw new Error('--write requires --confirm-production');
  }
  return options;
}

const options = parseArguments(process.argv.slice(2));
const supabase = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const r2Bucket = required('R2_PDF_PREVIEW_BUCKET');
const fallbackBucket =
  process.env.PDF_SEARCH_MANIFEST_FALLBACK_BUCKET?.trim() || 'pdf-previews';

const sha256 = (body) => createHash('sha256').update(body).digest('hex');

async function fetchDocuments() {
  const documents = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('dp_pdf_preview_documents')
      .select(
        'id,drive_file_id,version_key,storage_provider,storage_bucket,page_count,text_ready_at',
      )
      .eq('storage_provider', 'r2')
      .not('text_ready_at', 'is', null)
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Document read failed: ${error.message}`);
    documents.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return options.limit === null ? documents : documents.slice(0, options.limit);
}

async function fetchPageText(documentId) {
  const pages = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('dp_pdf_preview_pages')
      .select('page_number,search_text')
      .eq('document_id', documentId)
      .not('search_text', 'is', null)
      .order('page_number')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Page-text read failed: ${error.message}`);
    pages.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return pages;
}

function buildManifest(document, rows) {
  let previousPage = 0;
  const pages = rows.map((row) => {
    const pageNumber = Number(row.page_number);
    const text = row.search_text;
    if (
      !Number.isSafeInteger(pageNumber) ||
      pageNumber < 1 ||
      pageNumber <= previousPage ||
      typeof text !== 'string' ||
      text.length > 200_000
    ) {
      throw new Error(`Invalid search text in ${document.id}`);
    }
    previousPage = pageNumber;
    return [pageNumber, text];
  });
  const expectedPages = Number(document.page_count || 0);
  if (expectedPages > 0 && pages.length !== expectedPages) {
    throw new Error(
      `Search-text coverage for ${document.id} is ${pages.length}/${expectedPages}`,
    );
  }
  return Buffer.from(JSON.stringify({ v: 1, d: document.id, p: pages }), 'utf8');
}

async function existingR2Manifest(documentId) {
  const key = `pdf-preview-search/${documentId}.json`;
  const response = await getPrivateR2Object({
    bucket: r2Bucket,
    key,
    signal: AbortSignal.timeout(60_000),
  });
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`R2 manifest read failed (${response.status}) for ${documentId}`);
  const body = Buffer.from(await response.arrayBuffer());
  return { key, body };
}

async function existingFallbackManifest(documentId) {
  const key = `pdf-preview-search/${documentId}.json`;
  const { data, error } = await supabase.storage
    .from(fallbackBucket)
    .download(key);
  if (error) {
    const status = Number(error.status || error.statusCode || 0);
    const message = String(error.message || '');
    if (status === 404 || /not found/i.test(message)) return null;
    throw new Error(`Supabase fallback manifest read failed for ${documentId}: ${message}`);
  }
  const body = Buffer.from(await data.arrayBuffer());
  return { key, body };
}

async function putFallbackManifest(key, body) {
  const { error } = await supabase.storage
    .from(fallbackBucket)
    .upload(key, body, {
      contentType: 'application/json',
      cacheControl: '31536000',
      upsert: true,
    });
  if (error)
    throw new Error(`Supabase fallback manifest upload failed: ${error.message}`);
}

async function processDocument(document) {
  const rows = await fetchPageText(document.id);
  const body = buildManifest(document, rows);
  const digest = sha256(body);
  const key = `pdf-preview-search/${document.id}.json`;

  if (!options.write) {
    return {
      documentId: document.id,
      driveFileId: document.drive_file_id,
      pages: rows.length,
      bytes: body.length,
      sha256: digest,
      action: 'dry-run',
    };
  }

  const [existingR2, existingFallback] = await Promise.all([
    existingR2Manifest(document.id),
    existingFallbackManifest(document.id),
  ]);
  const r2Current = existingR2 && sha256(existingR2.body) === digest;
  const fallbackCurrent =
    existingFallback && sha256(existingFallback.body) === digest;

  if (!options.force && r2Current && fallbackCurrent) {
    return {
      documentId: document.id,
      driveFileId: document.drive_file_id,
      pages: rows.length,
      bytes: body.length,
      sha256: digest,
      action: 'already-current',
    };
  }

  let created = false;
  let replaced = false;
  const writes = [];
  if (options.force || !r2Current) {
    created ||= !existingR2;
    replaced ||= Boolean(existingR2);
    writes.push(
      putPrivateR2Object({
        bucket: r2Bucket,
        key,
        body,
        contentType: 'application/json',
        cacheControl: 'private, max-age=31536000, immutable',
        sha256Metadata: digest,
        signal: AbortSignal.timeout(90_000),
      }),
    );
  }
  if (options.force || !fallbackCurrent) {
    created ||= !existingFallback;
    replaced ||= Boolean(existingFallback);
    writes.push(putFallbackManifest(key, body));
  }
  await Promise.all(writes);

  const [verifiedR2, verifiedFallback] = await Promise.all([
    existingR2Manifest(document.id),
    existingFallbackManifest(document.id),
  ]);
  if (
    !verifiedR2 ||
    !verifiedFallback ||
    sha256(verifiedR2.body) !== digest ||
    sha256(verifiedFallback.body) !== digest
  ) {
    throw new Error(`Dual manifest verification failed for ${document.id}`);
  }

  return {
    documentId: document.id,
    driveFileId: document.drive_file_id,
    pages: rows.length,
    bytes: body.length,
    sha256: digest,
    action: replaced
      ? 'replaced-and-verified'
      : created
        ? 'created-and-verified'
        : 'already-current',
  };
}

async function main() {
  const documents = await fetchDocuments();
  const results = [];
  let failures = 0;
  for (const [index, document] of documents.entries()) {
    try {
      const result = await processDocument(document);
      results.push(result);
      console.log(
        JSON.stringify({
          event: 'pdf_search_manifest_backfill',
          current: index + 1,
          total: documents.length,
          ...result,
        }),
      );
    } catch (error) {
      failures += 1;
      const failure = {
        documentId: document.id,
        driveFileId: document.drive_file_id,
        action: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
      results.push(failure);
      console.error(
        JSON.stringify({
          event: 'pdf_search_manifest_backfill_failed',
          current: index + 1,
          total: documents.length,
          ...failure,
        }),
      );
    }
  }

  const summary = {
    mode: options.write ? 'write-and-verify' : 'dry-run',
    documents: documents.length,
    failures,
    manifestBytes: results.reduce(
      (total, result) => total + Number(result.bytes || 0),
      0,
    ),
  };
  console.log(
    JSON.stringify({ event: 'pdf_search_manifest_summary', ...summary }),
  );
  if (failures) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
