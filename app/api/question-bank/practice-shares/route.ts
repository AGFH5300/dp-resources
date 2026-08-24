import { requireApiMember } from '@/lib/auth';
import { parsePracticeConfiguration } from '@/lib/question-bank/practice-configuration';
import { createPracticeShare } from '@/lib/question-bank/practice-share';
import { isPlainObject, sameOriginOrForbidden } from '@/lib/request-security';

export const dynamic = 'force-dynamic';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export async function POST(request: Request) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  if (!isPlainObject(body))
    return noStore({ error: 'Expected a JSON request body.' }, { status: 400 });

  const auth = await requireApiMember();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 3 || name.length > 120)
    return noStore(
      { error: 'Name the practice set using 3 to 120 characters.' },
      { status: 400 },
    );

  let configuration;
  try {
    configuration = parsePracticeConfiguration(body.configuration);
  } catch (error) {
    return noStore(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Invalid practice configuration.',
      },
      { status: 400 },
    );
  }

  const sessionId =
    typeof body.sessionId === 'string' && body.sessionId.trim()
      ? body.sessionId.trim()
      : null;
  if (sessionId && !UUID.test(sessionId))
    return noStore(
      { error: 'Practice session ID is invalid.' },
      { status: 400 },
    );

  try {
    const shared = await createPracticeShare({
      userId: user.id,
      name,
      configuration,
      sessionId,
    });
    return noStore(shared, { status: 201 });
  } catch (error) {
    console.error('Unable to create Question Bank practice share.', {
      userId: user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return noStore(
      { error: 'Unable to create this practice-set code.' },
      { status: 400 },
    );
  }
}
