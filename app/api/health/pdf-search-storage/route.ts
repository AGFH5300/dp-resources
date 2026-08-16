export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(
    {
      ok: true,
      pdfSearchStorage: 'dual-object-v1',
      deploymentProvider: process.env.RENDER === 'true' ? 'render' : 'unknown',
      renderCommit: process.env.RENDER_GIT_COMMIT ?? null,
    },
    {
      headers: {
        'cache-control': 'no-store, max-age=0',
        'x-content-type-options': 'nosniff',
      },
    },
  );
}
