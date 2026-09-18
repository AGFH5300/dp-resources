import { getWhatsNewRelease } from '@/lib/whats-new';

export const dynamic = 'force-dynamic';

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export async function GET(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return noStore({ error: 'Not found.' }, { status: 404 });
  }

  const releaseId = new URL(req.url).searchParams.get('releaseId');
  const release = getWhatsNewRelease(releaseId);
  if (!release) {
    return noStore({ error: 'Release not found.' }, { status: 404 });
  }

  return noStore({ releaseId: release.id });
}
