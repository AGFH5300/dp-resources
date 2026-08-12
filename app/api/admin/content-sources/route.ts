import { requireAdmin } from '@/lib/auth';
import { sameOriginOrForbidden } from '@/lib/request-security';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { loadContentSourceAudit } from '@/lib/content-source-audit';

export const dynamic = 'force-dynamic';

function slug(value: unknown) {
  const candidate = String(value || '').trim();
  return /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(candidate) ? candidate : null;
}

function driveId(value: unknown) {
  const candidate = String(value || '').trim();
  return candidate && candidate.length <= 200 ? candidate : null;
}

function uuid(value: unknown) {
  const candidate = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null;
}

export async function GET(request: Request) {
  await requireAdmin();
  const sb = createSupabaseAdminClient();
  const url = new URL(request.url);
  const variantId = uuid(url.searchParams.get('variantId'));
  if (url.searchParams.has('variantId')) {
    if (!variantId) return Response.json({ error: 'A valid Question Bank variant ID is required.' }, { status: 400 });
    const { data, error } = await sb.rpc('dp_admin_qb_source_inspector', { p_variant_id: variantId });
    if (error || !data) return Response.json({ error: 'Unable to inspect Question Bank attribution.' }, { status: 404 });
    return Response.json({ inspector: data }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  let data;
  try {
    data = await loadContentSourceAudit();
  } catch (error) {
    console.error('[content-sources] audit load failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: 'Unable to load source audit.' }, { status: 503 });
  }
  const headers: Record<string, string> = { 'Cache-Control': 'private, no-store' };
  if (url.searchParams.get('download') === '1') {
    headers['Content-Disposition'] = 'attachment; filename="content-source-audit.json"';
  }
  return Response.json({ audit: data }, { headers });
}

export async function POST(request: Request) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;
  const { user } = await requireAdmin();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = String(body?.action || '');
  const sb = createSupabaseAdminClient();

  if (action === 'review_qb_source') {
    const sourceRowId = uuid(body?.sourceRowId);
    const sourceSlug = slug(body?.sourceSlug);
    const targetKind = ['question_source', 'variant_source'].includes(String(body?.targetKind))
      ? String(body?.targetKind)
      : null;
    const reviewStatus = ['reviewed', 'under_review', 'rejected'].includes(String(body?.reviewStatus))
      ? String(body?.reviewStatus)
      : null;
    if (!sourceRowId || !sourceSlug || !targetKind || !reviewStatus) {
      return Response.json({ error: 'A valid source row, source, target kind, and review status are required.' }, { status: 400 });
    }
    const { data, error } = await sb.rpc('dp_admin_set_qb_source_review', {
      p_actor_user_id: user.id,
      p_target_kind: targetKind,
      p_source_row_id: sourceRowId,
      p_source_slug: sourceSlug,
      p_review_status: reviewStatus,
    });
    if (error) return Response.json({ error: 'Unable to update Question Bank attribution.' }, { status: 400 });
    return Response.json({ ok: true, result: data });
  }

  const fileId = driveId(body?.driveFileId);
  if (!fileId) return Response.json({ error: 'A valid indexed Drive file ID is required.' }, { status: 400 });

  if (action === 'preview_source' || action === 'apply_source') {
    const sourceSlug = slug(body?.sourceSlug);
    if (!sourceSlug) return Response.json({ error: 'A valid source is required.' }, { status: 400 });
    const recursive = body?.recursive === true;
    const relationship = ['primary', 'adapted_from', 'compiled_from', 'contributed_by', 'hosted_from'].includes(String(body?.relationship))
      ? String(body?.relationship)
      : 'primary';
    const result = action === 'preview_source'
      ? await sb.rpc('dp_admin_preview_resource_source_assignment', {
          p_drive_file_id: fileId, p_source_slug: sourceSlug, p_recursive: recursive,
        })
      : await sb.rpc('dp_admin_set_resource_source', {
          p_actor_user_id: user.id, p_drive_file_id: fileId,
          p_source_slug: sourceSlug, p_recursive: recursive,
          p_relationship: relationship,
        });
    if (result.error) return Response.json({ error: 'Unable to process the source assignment.' }, { status: 400 });
    return Response.json({ ok: true, preview: result.data });
  }

  if (action === 'remove_source_override') {
    const { data, error } = await sb.rpc('dp_admin_remove_resource_source_override', {
      p_actor_user_id: user.id, p_drive_file_id: fileId,
    });
    if (error) return Response.json({ error: 'Unable to remove the source override.' }, { status: 400 });
    return Response.json({ ok: true, result: data });
  }

  if (action === 'set_resource_type') {
    const resourceTypeSlug = slug(body?.resourceTypeSlug);
    if (!resourceTypeSlug) return Response.json({ error: 'A valid resource type is required.' }, { status: 400 });
    const { error } = await sb.rpc('dp_admin_set_resource_type', {
      p_actor_user_id: user.id, p_drive_file_id: fileId,
      p_resource_type_slug: resourceTypeSlug,
    });
    if (error) return Response.json({ error: 'Unable to set the resource type.' }, { status: 400 });
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Unsupported source administration action.' }, { status: 400 });
}
