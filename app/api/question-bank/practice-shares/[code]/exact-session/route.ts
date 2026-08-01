import { requireMember } from '@/lib/auth';
import { cloneExactPracticeShare } from '@/lib/question-bank/practice-share';
import { sameOriginOrForbidden } from '@/lib/request-security';

export const dynamic = 'force-dynamic';

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;
  const { user } = await requireMember();
  const { code } = await params;

  try {
    const sessionId = await cloneExactPracticeShare(user.id, code);
    return noStore({ sessionId }, { status: 201 });
  } catch (error) {
    console.error('Unable to copy exact shared practice queue.', {
      userId: user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return noStore(
      { error: 'This exact shared question queue could not be copied.' },
      { status: 404 },
    );
  }
}
