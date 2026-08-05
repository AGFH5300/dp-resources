import { randomBytes } from 'node:crypto';

import { requireApiMember } from '@/lib/auth';
import { parsePracticeConfiguration } from '@/lib/question-bank/practice-configuration';
import {
  practiceSessionItems,
  preparePracticeSession,
  PracticeConfigurationShortageError,
} from '@/lib/question-bank/practice-engine';
import { isPlainObject, sameOriginOrForbidden } from '@/lib/request-security';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_QUEUE_CHUNK_SIZE = 1_000;

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
      const send = (event: Record<string, unknown>) => {
        if (cancelled) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      void (async () => {
        try {
          send({
            type: 'phase',
            phase: 'selecting',
            label: 'Selecting and ordering questions…',
          });
          const prepared = await preparePracticeSession(user.id, configuration);
          if (cancelled) return;

          const generationSeed = randomBytes(16).toString('hex');
          const items = practiceSessionItems(prepared, generationSeed);
          const createdAt = new Date().toISOString();
          send({
            type: 'session',
            sessionId: requestId,
            userId: user.id,
            schemaVersion: 1,
            configuration: prepared.configuration,
            generationSeed,
            orderingMode: prepared.configuration.orderingMode,
            totalCount: items.length,
            chunkSize: LOCAL_QUEUE_CHUNK_SIZE,
            createdAt,
          });

          for (
            let startPosition = 0;
            startPosition < items.length && !cancelled;
            startPosition += LOCAL_QUEUE_CHUNK_SIZE
          ) {
            const batch = items.slice(
              startPosition,
              startPosition + LOCAL_QUEUE_CHUNK_SIZE,
            );
            send({
              type: 'chunk',
              startPosition,
              items: batch.map((item) => [
                item.questionId,
                item.variantId,
                item.primaryBlockKey,
                item.matchedBlockKeys,
              ]),
            });
            send({
              type: 'progress',
              processedCount: startPosition + batch.length,
              totalCount: items.length,
            });
          }

          if (!cancelled) send({ type: 'complete', sessionId: requestId });
        } catch (error) {
          const shortage = error instanceof PracticeConfigurationShortageError;
          console.error('Unable to generate local Question Bank practice session.', {
            userId: user.id,
            requestId,
            message: error instanceof Error ? error.message : String(error),
          });
          if (!cancelled)
            send({
              type: 'error',
              error: shortage
                ? error.message
                : 'Unable to finish this practice session. Please try again.',
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
