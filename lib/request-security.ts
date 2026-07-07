import 'server-only';

export function sameOriginOrForbidden(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (!host) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const proto = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '') || 'https';
  const expected = `${proto}://${host}`;
  return origin === expected ? null : Response.json({ error: 'Forbidden' }, { status: 403 });
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
