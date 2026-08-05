import { requireApiMember } from '@/lib/auth';
import { normalizePracticeShareCode } from '@/lib/question-bank/practice-share';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { isPlainObject, sameOriginOrForbidden } from '@/lib/request-security';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

function validatedItems(value: unknown, startPosition: number) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10_000)
    return null;
  const questions = new Set<string>();
  const positions = new Set<number>();
  const result: Array<Record<string, unknown>> = [];
  for (const [index, raw] of value.entries()) {
    if (!isPlainObject(raw)) return null;
    const position = Number(raw.position);
    const questionId = typeof raw.questionId === 'string' ? raw.questionId : '';
    const variantId = typeof raw.variantId === 'string' ? raw.variantId : '';
    const primaryBlockKey =
      typeof raw.primaryBlockKey === 'string' ? raw.primaryBlockKey : '';
    const matchedBlockKeys = Array.isArray(raw.matchedBlockKeys)
      ? raw.matchedBlockKeys
      : null;
    if (
      position !== startPosition + index ||
      positions.has(position) ||
      !UUID.test(questionId) ||
      questions.has(questionId) ||
      !UUID.test(variantId) ||
      primaryBlockKey.length < 1 ||
      primaryBlockKey.length > 100 ||
      !matchedBlockKeys ||
      matchedBlockKeys.length < 1 ||
      matchedBlockKeys.some(
        (key) =>
          typeof key !== 'string' || key.length < 1 || key.length > 100,
      )
    )
      return null;
    positions.add(position);
    questions.add(questionId);
    result.push({
      position,
      questionId,
      variantId,
      primaryBlockKey,
      matchedBlockKeys,
    });
  }
  return result;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;
  const auth = await requireApiMember();
  if (!auth.ok) return auth.response;
  const { user } = auth;
  const { code: rawCode } = await params;
  const code = normalizePracticeShareCode(rawCode);
  if (!code)
    return noStore({ error: 'Practice-set code is invalid.' }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!isPlainObject(body))
    return noStore({ error: 'Expected a JSON request body.' }, { status: 400 });
  const startPosition = Number(body.startPosition);
  if (!Number.isInteger(startPosition) || startPosition < 0)
    return noStore({ error: 'Practice share chunk position is invalid.' }, { status: 400 });
  const items = validatedItems(body.items, startPosition);
  if (!items)
    return noStore({ error: 'Practice share chunk is invalid.' }, { status: 400 });

  const client = createSupabaseAdminClient();
  const { data, error } = await client.rpc(
    'dp_qb_append_local_practice_share_chunk',
    {
      p_user_id: user.id,
      p_code: code,
      p_start_position: startPosition,
      p_items: items,
    },
  );
  if (error) {
    console.error('Unable to upload local Question Bank share chunk.', {
      userId: user.id,
      code,
      startPosition,
      message: error.message,
    });
    return noStore(
      { error: 'This exact practice queue could not be uploaded.' },
      { status: 400 },
    );
  }
  return noStore({ committedCount: Number(data || 0) });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;
  const auth = await requireApiMember();
  if (!auth.ok) return auth.response;
  const { user } = auth;
  const { code: rawCode } = await params;
  const code = normalizePracticeShareCode(rawCode);
  if (!code)
    return noStore({ error: 'Practice-set code is invalid.' }, { status: 400 });
  const body = await request.json().catch(() => null);
  const expectedCount =
    isPlainObject(body) ? Number(body.expectedCount) : Number.NaN;
  if (!Number.isInteger(expectedCount) || expectedCount < 1)
    return noStore({ error: 'Practice share question count is invalid.' }, { status: 400 });

  const client = createSupabaseAdminClient();
  const { data, error } = await client.rpc(
    'dp_qb_finalize_local_practice_share_queue',
    {
      p_user_id: user.id,
      p_code: code,
      p_expected_count: expectedCount,
    },
  );
  if (error) {
    console.error('Unable to finalize local Question Bank share queue.', {
      userId: user.id,
      code,
      expectedCount,
      message: error.message,
    });
    return noStore(
      { error: 'This exact practice queue could not be finalized.' },
      { status: 400 },
    );
  }
  return noStore({ exactQuestionCount: Number(data || 0) });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;
  const auth = await requireApiMember();
  if (!auth.ok) return auth.response;
  const { user } = auth;
  const { code: rawCode } = await params;
  const code = normalizePracticeShareCode(rawCode);
  if (!code)
    return noStore({ deleted: false }, { status: 400 });

  const client = createSupabaseAdminClient();
  const { data, error } = await client.rpc('dp_qb_cancel_local_practice_share', {
    p_user_id: user.id,
    p_code: code,
  });
  if (error) {
    console.error('Unable to cancel local Question Bank share upload.', {
      userId: user.id,
      code,
      message: error.message,
    });
    return noStore({ deleted: false }, { status: 400 });
  }
  return noStore({ deleted: data === true });
}
