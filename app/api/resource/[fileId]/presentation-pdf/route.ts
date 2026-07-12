import { requireMember } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  await requireMember();
  return Response.json(
    {
      status: 'disabled',
      message: 'Server-side PPTX conversion has been permanently removed. Presentations are rendered in the authenticated browser preview.',
    },
    {
      status: 410,
      headers: {
        'cache-control': 'no-store',
        vary: 'Cookie',
      },
    },
  );
}
