import { requireApiMember } from '@/lib/auth';
import { parsePracticeConfiguration } from '@/lib/question-bank/practice-configuration';
import { previewPracticeConfiguration } from '@/lib/question-bank/practice-engine';
import { isPlainObject, sameOriginOrForbidden } from '@/lib/request-security';

export const dynamic = 'force-dynamic';

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export async function POST(request: Request) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;

  // Read the POST stream immediately. The builder can replace stale previews
  // rapidly, and leaving the body unread while authentication performs network
  // work allows Node/Next to observe a cancelled, disturbed stream.
  const body = await request.json().catch(() => null);
  if (!isPlainObject(body))
    return noStore({ error: 'Expected a JSON request body.' }, { status: 400 });

  const auth = await requireApiMember();
  if (!auth.ok) return auth.response;
  const { user } = auth;
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

  try {
    const preview = await previewPracticeConfiguration(user.id, configuration);
    return noStore({ preview });
  } catch (error) {
    console.error('Unable to preview Question Bank practice configuration.', {
      userId: user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return noStore(
      { error: 'Unable to preview this practice set.' },
      { status: 500 },
    );
  }
}
