import { requireApiMember } from '@/lib/auth';
import { parsePracticeConfiguration } from '@/lib/question-bank/practice-configuration';
import {
  generatePracticeSession,
  PracticeConfigurationShortageError,
} from '@/lib/question-bank/practice-engine';
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
    const generated = await generatePracticeSession(user.id, configuration);
    return noStore(generated, { status: 201 });
  } catch (error) {
    if (error instanceof PracticeConfigurationShortageError) {
      return noStore(
        {
          error: error.message,
          preview: error.preview,
        },
        { status: 409 },
      );
    }
    console.error('Unable to generate Question Bank practice session.', {
      userId: user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return noStore(
      { error: 'Unable to generate this practice session.' },
      { status: 500 },
    );
  }
}
