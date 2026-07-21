import { requireMember } from '@/lib/auth';
import { isPlainObject, sameOriginOrForbidden } from '@/lib/request-security';
import { createClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['not_started', 'in_progress', 'completed']);

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export async function PATCH(request: Request) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;
  const { user } = await requireMember();
  const body = await request.json().catch(() => null);
  if (!isPlainObject(body))
    return noStore({ error: 'Expected a JSON request body.' }, { status: 400 });

  const questionId = typeof body.questionId === 'string' ? body.questionId : '';
  const variantId = typeof body.variantId === 'string' ? body.variantId : '';
  if (!UUID_PATTERN.test(questionId) || !UUID_PATTERN.test(variantId))
    return noStore({ error: 'Invalid question identifier.' }, { status: 400 });
  const requestedStatus =
    typeof body.status === 'string' && STATUSES.has(body.status)
      ? body.status
      : null;
  const requestedRevisit =
    typeof body.toRevisit === 'boolean' ? body.toRevisit : null;
  const requestedSaved = typeof body.saved === 'boolean' ? body.saved : null;
  const viewed = body.viewed === true;
  if (
    !requestedStatus &&
    requestedRevisit === null &&
    requestedSaved === null &&
    !viewed
  )
    return noStore({ error: 'No state change requested.' }, { status: 400 });

  const client = await createClient();
  const { data: variant, error: variantError } = await client
    .from('dp_qb_question_variants')
    .select('question_id')
    .eq('id', variantId)
    .eq('question_id', questionId)
    .maybeSingle();
  if (variantError)
    return noStore({ error: 'Unable to verify question.' }, { status: 500 });
  if (!variant) return noStore({ error: 'Question not found.' }, { status: 404 });

  if (requestedSaved !== null) {
    const savedQuery = requestedSaved
      ? client.from('dp_qb_user_saved_questions').upsert(
          {
            user_id: user.id,
            question_id: questionId,
            last_variant_id: variantId,
          },
          { onConflict: 'user_id,question_id' },
        )
      : client
          .from('dp_qb_user_saved_questions')
          .delete()
          .eq('user_id', user.id)
          .eq('question_id', questionId);
    const { error } = await savedQuery;
    if (error)
      return noStore({ error: 'Unable to update saved question.' }, { status: 500 });
  }

  if (requestedStatus || requestedRevisit !== null || viewed) {
    const { data: existing, error: readError } = await client
      .from('dp_qb_user_progress')
      .select('status,to_revisit,first_viewed_at,completed_at')
      .eq('user_id', user.id)
      .eq('question_id', questionId)
      .maybeSingle();
    if (readError)
      return noStore({ error: 'Unable to read progress.' }, { status: 500 });
    const now = new Date().toISOString();
    const status =
      requestedStatus ||
      (viewed && (!existing || existing.status === 'not_started')
        ? 'in_progress'
        : existing?.status || 'not_started');
    const { error } = await client.from('dp_qb_user_progress').upsert(
      {
        user_id: user.id,
        question_id: questionId,
        last_variant_id: variantId,
        status,
        to_revisit: requestedRevisit ?? existing?.to_revisit ?? false,
        first_viewed_at: existing?.first_viewed_at || (viewed ? now : null),
        last_viewed_at: viewed ? now : undefined,
        completed_at:
          status === 'completed' ? existing?.completed_at || now : null,
        updated_at: now,
      },
      { onConflict: 'user_id,question_id' },
    );
    if (error)
      return noStore({ error: 'Unable to update progress.' }, { status: 500 });
  }

  return noStore({ ok: true });
}
