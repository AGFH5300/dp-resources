import { requireApiMember } from '@/lib/auth';
import { parsePracticeConfiguration } from '@/lib/question-bank/practice-configuration';
import {
  appendPracticeSessionBuildBatch,
  beginPracticeSessionBuild,
  practiceSessionItems,
  preparePracticeSession,
  PracticeConfigurationShortageError,
} from '@/lib/question-bank/practice-engine';
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

  const requestId = typeof body.requestId === 'string' ? body.requestId : '';
  if (!UUID.test(requestId))
    return noStore({ error: 'Invalid practice session request ID.' }, { status: 400 });

  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      void (async () => {
        try {
          send({
            type: 'phase',
            phase: 'selecting',
            label: 'Selecting and ordering questions…',
          });
          const prepared = await preparePracticeSession(user.id, configuration);
          let state = await beginPracticeSessionBuild({
            userId: user.id,
            requestId,
            prepared,
          });
          const items = practiceSessionItems(prepared, state.generationSeed);
          send({ type: 'progress', ...state });

          while (!cancelled && state.status !== 'complete') {
            let lastError: unknown = null;
            for (let attempt = 0; attempt < 4; attempt += 1) {
              try {
                state = await appendPracticeSessionBuildBatch({
                  userId: user.id,
                  configurationHash: prepared.configurationHash,
                  state,
                  items,
                });
                lastError = null;
                break;
              } catch (error) {
                lastError = error;
                const message = error instanceof Error ? error.message : String(error);
                if (
                  attempt >= 3 ||
                  !/\b(?:timeout|connection|fetch|502|503|504|520)\b/i.test(message)
                )
                  break;
                await new Promise((resolve) =>
                  setTimeout(resolve, 350 * 2 ** attempt),
                );
              }
            }
            if (lastError) throw lastError;
            send({ type: 'progress', ...state });
          }

          if (!cancelled && state.status === 'complete') {
            send({ type: 'complete', sessionId: state.sessionId });
          }
        } catch (error) {
          const shortage = error instanceof PracticeConfigurationShortageError;
          console.error('Unable to generate Question Bank practice session.', {
            userId: user.id,
            requestId,
            message: error instanceof Error ? error.message : String(error),
          });
          if (!cancelled)
            send({
              type: 'error',
              error: shortage
                ? error.message
                : 'Unable to finish this practice session. Your saved progress can be retried.',
              ...(shortage ? { preview: error.preview } : {}),
            });
        } finally {
          if (!cancelled) controller.close();
        }
      })();
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
