import 'server-only';

import { createHash } from 'node:crypto';
import { isR2PdfPreviewConfigured } from './r2-s3';
import { createSupabaseAdminClient } from './supabase-admin';

export const PDF_PREVIEW_BUCKET = 'pdf-previews';

export type PdfPreviewStatus = 'queued' | 'processing' | 'partial' | 'ready' | 'failed';
export type PdfPreviewStorageProvider = 'supabase' | 'r2';

export type PdfPreviewDocument = {
  id: string;
  drive_file_id: string;
  version_key: string;
  source_name: string;
  source_modified_at: string | null;
  source_size_bytes: number;
  storage_prefix: string;
  storage_provider: PdfPreviewStorageProvider;
  storage_bucket: string;
  status: PdfPreviewStatus;
  page_count: number | null;
  pages_ready: number;
  last_error: string | null;
  first_page_ready_at: string | null;
  completed_at: string | null;
  text_ready_at: string | null;
  updated_at: string;
};

export type PdfPreviewPage = {
  document_id: string;
  page_number: number;
  width_points: number;
  height_points: number;
  pixel_width: number;
  pixel_height: number;
  object_path: string | null;
  byte_size: number | null;
  etag: string | null;
  ready_at: string | null;
};

export type PdfPreviewSource = {
  fileId: string;
  fileName: string;
  size: number;
  modifiedTime?: string;
};

const documentColumns = 'id,drive_file_id,version_key,source_name,source_modified_at,source_size_bytes,storage_prefix,storage_provider,storage_bucket,status,page_count,pages_ready,last_error,first_page_ready_at,completed_at,text_ready_at,updated_at';

export function normalizePdfPreviewModifiedTime(value?: string) {
  const trimmed = value?.trim() || '';
  if (!trimmed) return '';
  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().replace(/Z$/, '+00:00') : trimmed;
}

export function pdfPreviewVersionKey(source: Pick<PdfPreviewSource, 'fileId' | 'size' | 'modifiedTime'>) {
  return createHash('sha256')
    .update(`${source.fileId}\n${normalizePdfPreviewModifiedTime(source.modifiedTime)}\n${source.size}`)
    .digest('hex');
}

export function pdfPreviewStoragePrefix(source: Pick<PdfPreviewSource, 'fileId' | 'size' | 'modifiedTime'>) {
  return `${source.fileId}/${pdfPreviewVersionKey(source)}`;
}

export function isPdfPreviewViewable(document: Pick<PdfPreviewDocument, 'status' | 'pages_ready'> | null) {
  return Boolean(document && document.pages_ready >= 1 && (document.status === 'partial' || document.status === 'ready' || document.status === 'processing'));
}

export function pdfPreviewDefaultStorageTarget(): { provider: PdfPreviewStorageProvider; bucket: string } {
  const requested = process.env.PDF_PREVIEW_DEFAULT_STORAGE_PROVIDER?.trim().toLowerCase() || 'supabase';
  if (requested === 'r2') {
    const bucket = process.env.R2_PDF_PREVIEW_BUCKET?.trim();
    if (!bucket || !isR2PdfPreviewConfigured()) {
      throw new Error('R2 is selected for PDF previews but its bucket or S3 credentials are not configured');
    }
    return { provider: 'r2', bucket };
  }
  if (requested !== 'supabase') throw new Error(`Unsupported PDF preview storage provider: ${requested}`);
  return { provider: 'supabase', bucket: process.env.PDF_PREVIEW_SUPABASE_BUCKET?.trim() || PDF_PREVIEW_BUCKET };
}

async function findReusablePdfPreviewDocument(
  sb: ReturnType<typeof createSupabaseAdminClient>,
  source: Pick<PdfPreviewSource, 'fileId' | 'size' | 'modifiedTime'>,
) {
  let query = sb
    .from('dp_pdf_preview_documents')
    .select(documentColumns)
    .eq('drive_file_id', source.fileId)
    .eq('source_size_bytes', source.size)
    .in('status', ['ready', 'partial', 'processing'])
    .order('pages_ready', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  const modifiedTime = normalizePdfPreviewModifiedTime(source.modifiedTime);
  query = modifiedTime ? query.eq('source_modified_at', modifiedTime) : query.is('source_modified_at', null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Unable to read reusable PDF preview state: ${error.message}`);
  return data as PdfPreviewDocument | null;
}

export async function ensurePdfPreviewDocument(source: PdfPreviewSource) {
  const sb = createSupabaseAdminClient();

  const reusable = await findReusablePdfPreviewDocument(sb, source);
  if (reusable) return reusable;

  const normalizedSource = {
    ...source,
    modifiedTime: normalizePdfPreviewModifiedTime(source.modifiedTime) || undefined,
  };
  const versionKey = pdfPreviewVersionKey(normalizedSource);
  const storagePrefix = pdfPreviewStoragePrefix(normalizedSource);
  const storage = pdfPreviewDefaultStorageTarget();
  const { data, error } = await sb.rpc('dp_queue_pdf_preview_v2', {
    p_drive_file_id: source.fileId,
    p_source_name: source.fileName,
    p_source_modified_at: normalizedSource.modifiedTime || null,
    p_source_size_bytes: source.size,
    p_version_key: versionKey,
    p_storage_prefix: storagePrefix,
    p_storage_provider: storage.provider,
    p_storage_bucket: storage.bucket,
  });
  if (error) throw new Error(`Unable to queue PDF preview: ${error.message}`);
  const document = (Array.isArray(data) ? data[0] : data) as PdfPreviewDocument | null;
  if (!document) throw new Error('Unable to queue PDF preview');
  return document;
}

export async function getPdfPreviewDocument(source: Pick<PdfPreviewSource, 'fileId' | 'size' | 'modifiedTime'>) {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from('dp_pdf_preview_documents')
    .select(documentColumns)
    .eq('drive_file_id', source.fileId)
    .eq('version_key', pdfPreviewVersionKey(source))
    .maybeSingle();
  if (error) throw new Error(`Unable to read PDF preview state: ${error.message}`);
  if (data) return data as PdfPreviewDocument;
  return findReusablePdfPreviewDocument(sb, source);
}

export async function getPdfPreviewManifest(source: Pick<PdfPreviewSource, 'fileId' | 'size' | 'modifiedTime'>) {
  const document = await getPdfPreviewDocument(source);
  if (!document) return null;

  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from('dp_pdf_preview_pages')
    .select('document_id,page_number,width_points,height_points,pixel_width,pixel_height,object_path,byte_size,etag,ready_at')
    .eq('document_id', document.id)
    .order('page_number', { ascending: true });
  if (error) throw new Error(`Unable to read PDF preview pages: ${error.message}`);

  return { document, pages: (data || []) as PdfPreviewPage[] };
}

export async function getPdfPreviewPage(source: Pick<PdfPreviewSource, 'fileId' | 'size' | 'modifiedTime'>, pageNumber: number) {
  const document = await getPdfPreviewDocument(source);
  if (!document || !isPdfPreviewViewable(document)) return null;

  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from('dp_pdf_preview_pages')
    .select('document_id,page_number,width_points,height_points,pixel_width,pixel_height,object_path,byte_size,etag,ready_at')
    .eq('document_id', document.id)
    .eq('page_number', pageNumber)
    .maybeSingle();
  if (error) throw new Error(`Unable to read PDF preview page: ${error.message}`);
  return data as PdfPreviewPage | null;
}

export async function getPdfPreviewDocumentByIdentity(previewId: string, versionKey: string) {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from('dp_pdf_preview_documents')
    .select(documentColumns)
    .eq('id', previewId)
    .eq('version_key', versionKey)
    .maybeSingle();
  if (error) throw new Error(`Unable to read PDF preview state: ${error.message}`);
  return data as PdfPreviewDocument | null;
}

export async function getPdfPreviewManifestByIdentity(previewId: string, versionKey: string) {
  const document = await getPdfPreviewDocumentByIdentity(previewId, versionKey);
  if (!document) return null;

  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from('dp_pdf_preview_pages')
    .select('document_id,page_number,width_points,height_points,pixel_width,pixel_height,object_path,byte_size,etag,ready_at')
    .eq('document_id', previewId)
    .order('page_number', { ascending: true });
  if (error) throw new Error(`Unable to read PDF preview pages: ${error.message}`);
  return { document, pages: (data || []) as PdfPreviewPage[] };
}

export async function getPdfPreviewPageByIdentity(previewId: string, versionKey: string, pageNumber: number) {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from('dp_pdf_preview_pages')
    .select('document_id,page_number,width_points,height_points,pixel_width,height_points,pixel_height,object_path,byte_size,etag,ready_at,dp_pdf_preview_documents!inner(version_key,status)')
    .eq('document_id', previewId)
    .eq('page_number', pageNumber)
    .eq('dp_pdf_preview_documents.version_key', versionKey)
    .in('dp_pdf_preview_documents.status', ['processing', 'partial', 'ready'])
    .maybeSingle();
  if (error) throw new Error(`Unable to read PDF preview page: ${error.message}`);
  if (!data) return null;
  const { dp_pdf_preview_documents: _document, ...page } = data as PdfPreviewPage & { dp_pdf_preview_documents: unknown };
  return page as PdfPreviewPage;
}
