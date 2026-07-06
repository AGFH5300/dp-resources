import { unstable_cache } from 'next/cache';
import { requireMember } from '@/lib/auth';
import { assertInsideRoot, getDriveMetadata, sheetsClient } from '@/lib/drive';

export const runtime = 'nodejs';

type Tab = { title: string; sheetId: number; gid: number; index: number; hidden: boolean };

const getTabsCached = unstable_cache(async (fileId: string) => {
  const res = await sheetsClient().spreadsheets.get({ spreadsheetId: fileId, fields: 'sheets(properties(sheetId,title,index,hidden))' });
  return (res.data.sheets || []).map((sheet): Tab => {
    const p = sheet.properties || {};
    const sheetId = Number(p.sheetId ?? 0);
    return { title: p.title || 'Untitled sheet', sheetId, gid: sheetId, index: Number(p.index ?? 0), hidden: Boolean(p.hidden) };
  }).sort((a, b) => a.index - b.index);
}, ['worksheet-tabs-v1'], { revalidate: 60 });

export async function GET(_req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  await requireMember();
  const { fileId } = await params;
  if (!(await assertInsideRoot(fileId))) return Response.json({ error: 'Not found' }, { status: 404 });
  const meta = await getDriveMetadata(fileId);
  if (!meta || !/spreadsheet/i.test(meta.mimeType + ' ' + meta.name)) return Response.json({ error: 'Not a spreadsheet' }, { status: 400 });
  try {
    return Response.json({ tabs: await getTabsCached(fileId) });
  } catch {
    return Response.json({ error: 'Worksheet metadata unavailable' }, { status: 502 });
  }
}
