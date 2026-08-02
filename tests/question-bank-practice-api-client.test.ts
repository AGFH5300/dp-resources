import { describe, expect, it } from 'vitest';

import { readPracticeApiJson } from '@/lib/question-bank/practice-api-client';

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
});
