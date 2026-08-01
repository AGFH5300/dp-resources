import { requireMember } from '@/lib/auth';
import { parsePracticeConfiguration } from '@/lib/question-bank/practice-configuration';
import { maximizePracticeConfiguration } from '@/lib/question-bank/practice-engine';
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

  // Consume the POST stream before authentication performs any asynchronous
  // work. This avoids Node/Next attempting to adapt a body that the browser has
  // already cancelled while a newer Max/preview request replaces it.
  const body = await request.json().catch(() => null);
  if (!isPlainObject(body))
    return noStore({ error: 'Expected a JSON request body.' }, { status: 400 });

  const { user } = await requireMember();
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
    const maximum = await maximizePracticeConfiguration(user.id, configuration);
    return noStore({ maximum });
  } catch (error) {
    console.error('Unable to maximize Question Bank practice configuration.', {
      userId: user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return noStore(
      {
        error:
          'The maximum could not be calculated. Try fewer filters or selections and retry.',
      },
      { status: 503 },
    );
  }
}
