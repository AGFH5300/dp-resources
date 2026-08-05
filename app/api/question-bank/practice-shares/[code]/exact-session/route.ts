import { randomBytes, randomUUID } from 'node:crypto';

import { requireApiMember } from '@/lib/auth';
import { normalizePracticeShareCode } from '@/lib/question-bank/practice-share';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { sameOriginOrForbidden } from '@/lib/request-security';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LOCAL_QUEUE_CHUNK_SIZE = 1_000;

type ExactItem = {
  position: number;
  questionId: string;
  variantId: string;
  primaryBlockKey: string;
  matchedBlockKeys: string[];
};

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

function validExactItem(value: unknown): value is ExactItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    Number.isInteger(Number(item.position)) &&
    Number(item.position) >= 0 &&
    typeof item.questionId === 'string' &&
    typeof item.variantId === 'string' &&
    typeof item.primaryBlockKey === 'string' &&
    item.primaryBlockKey.length > 0 &&
    Array.isArray(item.matchedBlockKeys) &&
    item.matchedBlockKeys.length > 0 &&
    item.matchedBlockKeys.every((key) => typeof key === 'string' && key.length > 0)
  );
}

async function loadLegacyExactItems(shareId: string) {
  const client = createSupabaseAdminClient();
  const result: ExactItem[] = [];
  const pageSize = 1_000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from('dp_qb_practice_share_items')
      .select(
        'position,question_id,variant_id,primary_block_snapshot,matches_snapshot',
      )
      .eq('share_id', shareId)
      .order('position')
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data || []) as any[];
    for (const row of rows) {
      const primaryBlockKey = String(row.primary_block_snapshot?.key || '').trim();
      const matchedBlockKeys = Array.isArray(row.matches_snapshot)
        ? row.matches_snapshot
            .map((match: any) =>
              String(match?.key || match?.blockKey || match?.matchKey || '').trim(),
            )
            .filter(Boolean)
        : [];
      result.push({
        position: Number(row.position),
        questionId: String(row.question_id || ''),
        variantId: String(row.variant_id || ''),
        primaryBlockKey,
        matchedBlockKeys: matchedBlockKeys.length
          ? matchedBlockKeys
          : [primaryBlockKey],
      });
    }
    if (rows.length < pageSize) break;
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

  const client = createSupabaseAdminClient();
  const { data: share, error: shareError } = await client
    .from('dp_qb_practice_shares')
    .select(
      'id,code,configuration_snapshot,has_exact_queue,exact_question_count',
    )
    .eq('code', code)
    .maybeSingle();
  if (shareError || !share?.has_exact_queue || !share.exact_question_count)
    return noStore(
      { error: 'This exact shared question queue could not be found.' },
      { status: 404 },
    );

  let items: ExactItem[] = [];
  try {
    const { data: chunks, error: chunkError } = await client
      .from('dp_qb_practice_share_queue_chunks')
      .select('start_position,item_count,items')
      .eq('share_id', share.id)
      .order('start_position');
    if (chunkError) throw new Error(chunkError.message);
    if (chunks?.length) {
      for (const chunk of chunks as any[]) {
        if (!Array.isArray(chunk.items))
          throw new Error('Shared queue chunk is invalid.');
        items.push(...(chunk.items as ExactItem[]));
      }
    } else {
      items = await loadLegacyExactItems(share.id);
    }
  } catch (error) {
    console.error('Unable to load exact Question Bank share queue.', {
      userId: user.id,
      code,
      message: error instanceof Error ? error.message : String(error),
    });
    return noStore(
      { error: 'This exact shared question queue could not be loaded.' },
      { status: 500 },
    );
  }

  items.sort((a, b) => Number(a.position) - Number(b.position));
  if (
    items.length !== Number(share.exact_question_count) ||
    items.some(
      (item, index) => !validExactItem(item) || Number(item.position) !== index,
    )
  )
    return noStore(
      { error: 'This exact shared question queue is incomplete.' },
      { status: 409 },
    );

  const sessionId = randomUUID();
  const generationSeed = `shared-${code.replace('-', '')}-${randomBytes(8).toString('hex')}`;
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: Record<string, unknown>) => {
        if (!cancelled)
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      send({
        type: 'phase',
        phase: 'selecting',
        label: 'Copying the exact shared queue to this device…',
      });
      send({
        type: 'session',
        sessionId,
        userId: user.id,
        schemaVersion: 1,
        configuration: share.configuration_snapshot,
        generationSeed,
        orderingMode:
          share.configuration_snapshot?.orderingMode || 'interleaved',
        totalCount: items.length,
        chunkSize: LOCAL_QUEUE_CHUNK_SIZE,
        createdAt: new Date().toISOString(),
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
      if (!cancelled) {
        send({ type: 'complete', sessionId });
        controller.close();
      }
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
