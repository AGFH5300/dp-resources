import { describe, expect, it, vi } from 'vitest';

import {
  readPracticeApiJson,
  readPracticeBuildStream,
} from '@/lib/question-bank/practice-api-client';

describe('practice API response handling', () => {
  it('returns JSON objects from successful responses', async () => {
    const payload = await readPracticeApiJson<{ sessionId: string }>(
      Response.json({ sessionId: 'session-1' }),
      'Unable to create this session.',
    );
    expect(payload).toEqual({ sessionId: 'session-1' });
  });

  it('uses a JSON API error without leaking response markup', async () => {
    await expect(
      readPracticeApiJson(
        Response.json(
          { error: 'No questions match these filters.' },
          { status: 409 },
        ),
        'Unable to preview this set.',
      ),
    ).rejects.toThrow('No questions match these filters.');
  });

  it('turns an HTML infrastructure error into a stable retry message', async () => {
    await expect(
      readPracticeApiJson(
        new Response('<!DOCTYPE html><title>Internal Server Error</title>', {
          status: 500,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
        'Unable to preview this set.',
      ),
    ).rejects.toThrow(
      'Unable to preview this set. The server returned error 500; please retry.',
    );
  });

  it('recognizes an authentication-page redirect before parsing the body', async () => {
    const response = new Response('<!DOCTYPE html><title>Sign in</title>', {
      headers: { 'content-type': 'text/html' },
    });
    Object.defineProperties(response, {
      redirected: { value: true },
      url: { value: 'https://example.test/auth' },
    });

    await expect(
      readPracticeApiJson(response, 'Unable to preview this set.'),
    ).rejects.toThrow(
      'Your sign-in has expired. Refresh the page and sign in again.',
    );
  });

  it('rejects a non-JSON success response instead of throwing a parser error', async () => {
    await expect(
      readPracticeApiJson(
        new Response('<!DOCTYPE html>', {
          headers: { 'content-type': 'text/html' },
        }),
        'Unable to preview this set.',
      ),
    ).rejects.toThrow(
      'Unable to preview this set. The server returned an invalid response; please retry.',
    );
  });

  it('reads split local-session NDJSON events through completion', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111111';
    const userId = '22222222-2222-4222-8222-222222222222';
    const questionId = '33333333-3333-4333-8333-333333333333';
    const variantId = '44444444-4444-4444-8444-444444444444';
    const courseId = '55555555-5555-4555-8555-555555555555';
    const configuration = {
      schemaVersion: 1,
      orderingMode: 'interleaved',
      filters: {
        difficulties: ['easy', 'medium', 'hard', 'unrated'],
        statuses: ['not_started', 'in_progress', 'completed'],
        saved: null,
        calculator: null,
      },
      blocks: [
        {
          key: 'course-one',
          selectionType: 'course',
          courseId,
          requestedCount: 1,
          filters: {},
        },
      ],
    };
    const encoder = new TextEncoder();
    const chunks = [
      '{"type":"phase","label":"Selecting questions…"}\n',
      `${JSON.stringify({
        type: 'session',
        sessionId,
        userId,
        schemaVersion: 1,
        configuration,
        generationSeed: 'seed-1',
        orderingMode: 'interleaved',
        totalCount: 1,
        chunkSize: 1000,
        createdAt: '2026-08-05T14:00:00.000Z',
      }).slice(0, 180)}`,
      `${JSON.stringify({
        type: 'session',
        sessionId,
        userId,
        schemaVersion: 1,
        configuration,
        generationSeed: 'seed-1',
        orderingMode: 'interleaved',
        totalCount: 1,
        chunkSize: 1000,
        createdAt: '2026-08-05T14:00:00.000Z',
      }).slice(180)}\n`,
      `${JSON.stringify({
        type: 'chunk',
        startPosition: 0,
        items: [[questionId, variantId, 'course-one', ['course-one']]],
      })}\n`,
      '{"type":"progress","processedCount":1,"totalCount":1}\n',
      `${JSON.stringify({ type: 'complete', sessionId })}\n`,
    ];
    const response = new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } },
    );
    const progress: Array<number | null> = [];
    const sink = {
      begin: vi.fn(async () => undefined),
      append: vi.fn(async () => undefined),
      complete: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    };
    const result = await readPracticeBuildStream(
      response,
      (event) => progress.push(event.processedCount),
      sink,
    );
    expect(result).toEqual({ sessionId });
    expect(progress).toEqual([null, 1]);
    expect(sink.begin).toHaveBeenCalledOnce();
    expect(sink.append).toHaveBeenCalledWith({
      sessionId,
      startPosition: 0,
      itemCount: 1,
      items: [[questionId, variantId, 'course-one', ['course-one']]],
    });
    expect(sink.complete).toHaveBeenCalledWith(sessionId);
    expect(sink.abort).not.toHaveBeenCalled();
  });
});
