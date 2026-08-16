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

async function existingManifest(document) {
  const key = `pdf-preview-search/${document.id}.json`;
  const response = await getPrivateR2Object({
    bucket: document.storage_bucket,
    key,
    signal: AbortSignal.timeout(60_000),
  });
  if (response.status === 404) return null;
  const body = Buffer.from(await response.arrayBuffer());
  return { key, body };
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

  const existing = await existingManifest(document);
  if (existing && !options.force && sha256(existing.body) === digest) {
    return {
      documentId: document.id,
      driveFileId: document.drive_file_id,
      pages: rows.length,
      bytes: body.length,
      sha256: digest,
      action: 'already-current',
    };
  }

  await putPrivateR2Object({
    bucket: document.storage_bucket,
    key,
    body,
    contentType: 'application/json',
    cacheControl: 'private, max-age=31536000, immutable',
    sha256Metadata: digest,
    signal: AbortSignal.timeout(90_000),
  });

  const verified = await existingManifest(document);
  if (!verified || sha256(verified.body) !== digest) {
    throw new Error(`R2 verification failed for ${document.id}`);
  }

  return {
    documentId: document.id,
    driveFileId: document.drive_file_id,
    pages: rows.length,
    bytes: body.length,
    sha256: digest,
    action: existing ? 'replaced-and-verified' : 'created-and-verified',
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
      console.log(JSON.stringify({
        event: 'pdf_search_manifest_backfill',
        current: index + 1,
        total: documents.length,
        ...result,
      }));
    } catch (error) {
      failures += 1;
      const failure = {
        documentId: document.id,
        driveFileId: document.drive_file_id,
        action: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
      results.push(failure);
      console.error(JSON.stringify({
        event: 'pdf_search_manifest_backfill_failed',
        current: index + 1,
        total: documents.length,
        ...failure,
      }));
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
  console.log(JSON.stringify({ event: 'pdf_search_manifest_summary', ...summary }));
  if (failures) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
