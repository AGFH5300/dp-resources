import {
  parsePracticeConfiguration,
  type PracticeConfiguration,
} from './practice-configuration';
import type {
  LocalPracticeQueueChunk,
  LocalPracticeQueueTuple,
} from './local-practice-session-storage';

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

export type LocalPracticeBuildMetadata = {
  sessionId: string;
  schemaVersion: 1;
  configuration: PracticeConfiguration;
  generationSeed: string;
  orderingMode: PracticeConfiguration['orderingMode'];
  totalCount: number;
  chunkSize: number;
  createdAt: string;
};

export type LocalPracticeBuildSink = {
  begin: (metadata: LocalPracticeBuildMetadata) => Promise<void>;
  append: (chunk: LocalPracticeQueueChunk) => Promise<void>;
  complete: (sessionId: string) => Promise<void>;
  abort: (sessionId: string | null) => Promise<void>;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function localQueueTuple(value: unknown): LocalPracticeQueueTuple | null {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    typeof value[0] !== 'string' ||
    !UUID.test(value[0]) ||
    typeof value[1] !== 'string' ||
    !UUID.test(value[1]) ||
    typeof value[2] !== 'string' ||
    value[2].length < 1 ||
    value[2].length > 100 ||
    !Array.isArray(value[3]) ||
    value[3].length < 1 ||
    !value[3].every(
      (key) => typeof key === 'string' && key.length >= 1 && key.length <= 100,
    )
  )
    return null;
  return [value[0], value[1], value[2], [...value[3]]];
}

export async function readPracticeBuildStream(
  response: Response,
  onProgress: (progress: PracticeBuildProgress) => void,
  sink: LocalPracticeBuildSink,
) {
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !/application\/x-ndjson/i.test(contentType)) {
    await readPracticeApiJson<Record<string, never>>(
      response,
      'Unable to create this session.',
    );
    throw new Error('Unable to create this session.');
  }
  if (!response.body)
    throw new Error('Unable to create this session. The server returned no progress stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  let sessionId: string | null = null;
  let sessionStarted = false;
  let sessionCompleted = false;

  const readEvent = async (line: string) => {
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

    if (event.type === 'session') {
      const nextSessionId =
        typeof event.sessionId === 'string' ? event.sessionId : '';
      const generationSeed =
        typeof event.generationSeed === 'string' ? event.generationSeed : '';
      const totalCount = Number(event.totalCount);
      const chunkSize = Number(event.chunkSize);
      const createdAt = typeof event.createdAt === 'string' ? event.createdAt : '';
      let configuration: PracticeConfiguration;
      try {
        configuration = parsePracticeConfiguration(event.configuration);
      } catch {
        throw new Error('Unable to create this session. Its configuration was invalid.');
      }
      if (
        !UUID.test(nextSessionId) ||
        !generationSeed ||
        !Number.isInteger(totalCount) ||
        totalCount < 1 ||
        !Number.isInteger(chunkSize) ||
        chunkSize < 1 ||
        chunkSize > 10_000 ||
        !createdAt ||
        Number.isNaN(Date.parse(createdAt)) ||
        event.schemaVersion !== 1 ||
        event.orderingMode !== configuration.orderingMode ||
        sessionStarted
      )
        throw new Error('Unable to create this session. Its metadata was invalid.');

      sessionId = nextSessionId;
      sessionStarted = true;
      await sink.begin({
        sessionId: nextSessionId,
        schemaVersion: 1,
        configuration,
        generationSeed,
        orderingMode: configuration.orderingMode,
        totalCount,
        chunkSize,
        createdAt,
      });
      return;
    }

    if (event.type === 'chunk') {
      if (!sessionId || !sessionStarted || sessionCompleted)
        throw new Error('Unable to create this session. Its queue arrived out of order.');
      const startPosition = Number(event.startPosition);
      const rawItems = Array.isArray(event.items) ? event.items : null;
      const items = rawItems?.map(localQueueTuple) || null;
      if (
        !Number.isInteger(startPosition) ||
        startPosition < 0 ||
        !items ||
        !items.length ||
        items.some((item) => item === null)
      )
        throw new Error('Unable to create this session. Its queue was invalid.');
      await sink.append({
        sessionId,
        startPosition,
        itemCount: items.length,
        items: items as LocalPracticeQueueTuple[],
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
        label: 'Saving your fixed question queue on this device…',
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
      if (
        !sessionId ||
        typeof event.sessionId !== 'string' ||
        event.sessionId !== sessionId ||
        sessionCompleted
      )
        throw new Error('Unable to create this session. The session ID was missing.');
      await sink.complete(sessionId);
      sessionCompleted = true;
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffered += decoder.decode(value, { stream: !done });
      const lines = buffered.split('\n');
      buffered = lines.pop() || '';
      for (const line of lines) if (line.trim()) await readEvent(line);
      if (done) break;
    }
    if (buffered.trim()) await readEvent(buffered);
    if (!sessionId || !sessionCompleted)
      throw new Error('Unable to finish this practice session. Please retry.');
    return { sessionId };
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    await sink.abort(sessionId).catch(() => undefined);
    throw error;
  }
}
