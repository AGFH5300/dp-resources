import { requireMember } from '@/lib/auth';
import {
  CASE_ATTACHMENT_BUCKET,
  type CaseAttachmentKind,
} from '@/lib/case-attachments';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { user, membership } = await requireMember();
  const { kind: rawKind, id } = await params;
  const kind = rawKind === 'support' || rawKind === 'report' ? rawKind : null;
  if (!kind || !/^[0-9a-f-]{36}$/i.test(id)) {
    return noStore({ error: 'Attachment case not found.' }, { status: 404 });
  }

  const typedKind = kind as CaseAttachmentKind;
  const sb = createSupabaseAdminClient();
  const parentTable =
    typedKind === 'support' ? 'dp_support_tickets' : 'dp_resource_reports';
  let parentQuery = sb.from(parentTable).select('id,reporter_id').eq('id', id);
  if (membership.role !== 'admin') parentQuery = parentQuery.eq('reporter_id', user.id);
  const { data: parent, error: parentError } = await parentQuery.maybeSingle();
  if (parentError || !parent) {
    if (parentError) {
      console.error('[case-attachments] parent lookup failed', {
        code: parentError.code,
        message: parentError.message,
      });
    }
    return noStore({ error: 'Attachment case not found.' }, { status: 404 });
  }

  const relation =
    typedKind === 'support' ? 'support_ticket_id' : 'resource_report_id';
  const { data: rows, error } = await sb
    .from('dp_case_attachments')
    .select('id,original_name,mime_type,size_bytes,created_at,storage_path,scan_status')
    .eq(relation, id)
    .eq('scan_status', 'clean')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[case-attachments] metadata lookup failed', {
      code: error.code,
      message: error.message,
    });
    return noStore({ error: 'Could not load attachments.' }, { status: 503 });
  }

  if (!rows?.length) return noStore({ attachments: [] });

  const paths = rows.map((row) => row.storage_path);
  const { data: signed, error: signedError } = await sb.storage
    .from(CASE_ATTACHMENT_BUCKET)
    .createSignedUrls(paths, 10 * 60);
  if (signedError || !signed) {
    console.error('[case-attachments] signed URL creation failed', {
      message: signedError?.message || 'unknown',
    });
    return noStore({ error: 'Could not open attachments.' }, { status: 503 });
  }

  const signedByPath = new Map(
    signed
      .filter((item) => item.signedUrl)
      .map((item) => [item.path, item.signedUrl] as const),
  );

  return noStore({
    attachments: rows.flatMap((row) => {
      const url = signedByPath.get(row.storage_path);
      if (!url) return [];
      return [
        {
          id: row.id,
          originalName: row.original_name,
          mimeType: row.mime_type,
          sizeBytes: Number(row.size_bytes),
          createdAt: row.created_at,
          url,
        },
      ];
    }),
  });
}
