import { requireApiMember } from '@/lib/auth';
import { getPracticeShare } from '@/lib/question-bank/practice-share';

export const dynamic = 'force-dynamic';

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const auth = await requireApiMember();
  if (!auth.ok) return auth.response;
  const { code } = await params;

  try {
    const share = await getPracticeShare(code);
    if (!share)
      return noStore(
        { valid: false, error: 'That practice-set code is invalid.' },
        { status: 404 },
      );
    return noStore({
      valid: true,
      code: share.code,
      name: share.name,
      creatorLabel: share.creatorLabel,
    });
  } catch (error) {
    console.error('Unable to validate Question Bank practice code.', {
      message: error instanceof Error ? error.message : String(error),
    });
    return noStore(
      { valid: false, error: 'That practice-set code could not be checked.' },
      { status: 503 },
    );
  }
}
