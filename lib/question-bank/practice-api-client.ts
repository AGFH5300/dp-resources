type ApiErrorPayload = {
  error?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function redirectedToAuthentication(response: Response) {
  if (!response.redirected || !response.url) return false;
  try {
    return new URL(response.url).pathname.startsWith('/auth');
  } catch {
    return false;
  }
}

/**
 * Reads a practice API response without ever exposing an HTML platform error to
 * the user as a JSON parse exception. Non-2xx responses are converted to a
 * stable, user-facing Error and successful responses must contain a JSON object.
 */
export async function readPracticeApiJson<T extends Record<string, unknown>>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  if (redirectedToAuthentication(response)) {
    throw new Error(
      'Your sign-in has expired. Refresh the page and sign in again.',
    );
  }

  const contentType = response.headers.get('content-type') || '';
  let payload: unknown = null;

  if (/\b(?:application|text)\/[^;]*json\b/i.test(contentType)) {
    payload = await response.json().catch(() => null);
  } else {
    // Consume non-JSON responses so the connection can be reused, but never
    // display HTML or infrastructure response bodies in the interface.
    await response.text().catch(() => '');
  }

  if (!response.ok) {
    const errorPayload = isObject(payload) ? (payload as ApiErrorPayload) : null;
    if (typeof errorPayload?.error === 'string' && errorPayload.error.trim()) {
      throw new Error(errorPayload.error.trim());
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        'Your sign-in has expired. Refresh the page and sign in again.',
      );
    }
    throw new Error(
      response.status >= 500
        ? `${fallbackMessage} The server returned error ${response.status}; please retry.`
        : fallbackMessage,
    );
  }

  if (!isObject(payload)) {
    throw new Error(
      `${fallbackMessage} The server returned an invalid response; please retry.`,
    );
  }

  return payload as T;
}

export type PracticeBuildProgress = {
  phase: 'selecting' | 'building';
  label: string;
  processedCount: number | null;
  totalCount: number | null;
};

export async function readPracticeBuildStream(
  response: Response,
  onProgress: (progress: PracticeBuildProgress) => void,
) {
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !/application\/x-ndjson/i.test(contentType)) {
    return readPracticeApiJson<{ sessionId: string }>(
      response,
      'Unable to create this session.',
    );
  }
  if (!response.body)
    throw new Error('Unable to create this session. The server returned no progress stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  let sessionId = '';

  const readEvent = (line: string) => {
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      throw new Error('Unable to create this session. The progress response was invalid.');
    }
    if (!isObject(event) || typeof event.type !== 'string')
      throw new Error('Unable to create this session. The progress response was invalid.');
    if (event.type === 'phase') {
      onProgress({
        phase: 'selecting',
        label:
          typeof event.label === 'string'
            ? event.label
            : 'Selecting and ordering questions…',
        processedCount: null,
        totalCount: null,
      });
      return;
    }
    if (event.type === 'progress') {
      const processedCount = Number(event.processedCount);
      const totalCount = Number(event.totalCount);
      if (
        !Number.isInteger(processedCount) ||
        processedCount < 0 ||
        !Number.isInteger(totalCount) ||
        totalCount < 1 ||
        processedCount > totalCount
      )
        throw new Error('Unable to create this session. The progress response was invalid.');
      onProgress({
        phase: 'building',
        label: 'Saving your fixed question queue…',
        processedCount,
        totalCount,
      });
      return;
    }
    if (event.type === 'error') {
      throw new Error(
        typeof event.error === 'string' && event.error.trim()
          ? event.error.trim()
          : 'Unable to finish this practice session.',
      );
    }
    if (event.type === 'complete') {
      if (typeof event.sessionId !== 'string' || !event.sessionId)
        throw new Error('Unable to create this session. The session ID was missing.');
      sessionId = event.sessionId;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffered += decoder.decode(value, { stream: !done });
    const lines = buffered.split('\n');
    buffered = lines.pop() || '';
    for (const line of lines) if (line.trim()) readEvent(line);
    if (done) break;
  }
  if (buffered.trim()) readEvent(buffered);
  if (!sessionId)
    throw new Error('Unable to finish this practice session. Please retry.');
  return { sessionId };
}
