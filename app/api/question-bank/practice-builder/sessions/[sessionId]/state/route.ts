import { requireMember } from '@/lib/auth';
import { updatePracticeSessionItem } from '@/lib/question-bank/practice-session-state';
import { isPlainObject, sameOriginOrForbidden } from '@/lib/request-security';

export const dynamic = 'force-dynamic';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['viewed', 'completed', 'skipped']);

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;
  const { user } = await requireMember();
  const { sessionId } = await params;
  const body = await request.json().catch(() => null);
  if (!UUID.test(sessionId) || !isPlainObject(body))
    return noStore({ error: 'Invalid practice session state.' }, { status: 400 });
  const variantId = typeof body.variantId === 'string' ? body.variantId : '';
  const status = typeof body.status === 'string' ? body.status : '';
  if (!UUID.test(variantId) || !STATUSES.has(status))
    return noStore({ error: 'Invalid practice session item state.' }, { status: 400 });

  try {
    const updated = await updatePracticeSessionItem({
      userId: user.id,
      sessionId,
      variantId,
      status: status as 'viewed' | 'completed' | 'skipped',
    });
    return updated
      ? noStore({ ok: true })
      : noStore({ error: 'Practice session item not found.' }, { status: 404 });
  } catch (error) {
    console.error('Unable to update Question Bank practice session state.', {
      userId: user.id,
      sessionId,
      variantId,
      message: error instanceof Error ? error.message : String(error),
    });
    return noStore(
      { error: 'Unable to update practice session state.' },
      { status: 500 },
    );
  }
}
