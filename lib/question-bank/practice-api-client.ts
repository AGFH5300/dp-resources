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
