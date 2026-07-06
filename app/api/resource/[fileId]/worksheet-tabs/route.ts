import { unstable_cache } from 'next/cache';
import { requireMember } from '@/lib/auth';
import { assertInsideRoot, getDriveMetadata, sheetsClient } from '@/lib/drive';

export const runtime = 'nodejs';

type Tab = { title: string; sheetId: number; gid: number; index: number; hidden: boolean };

type GoogleApiLikeError = {
  code?: number;
  status?: number;
  message?: string;
  errors?: { reason?: string; message?: string }[];
  response?: { status?: number; data?: { error?: { status?: string; message?: string; errors?: { reason?: string; message?: string }[] } } };
};

function safeGoogleSheetError(error: unknown) {
  const err = error as GoogleApiLikeError;
  const statusCode = err.response?.status ?? err.code ?? err.status;
  const apiError = err.response?.data?.error;
  const reasons = [...(apiError?.errors || []), ...(err.errors || [])].map(item => item.reason || '').filter(Boolean);
  const message = String(apiError?.message || err.message || 'Unexpected Google API failure').replace(/-----BEGIN[\s\S]*?-----END[^\n]*/g, '[redacted]').slice(0, 240);
  const status = apiError?.status || '';
  const lower = `${status} ${message} ${reasons.join(' ')}`.toLowerCase();
  let diagnosis = 'unexpected Google API failure';
  if (statusCode === 403 && (lower.includes('access_not_configured') || lower.includes('api has not been used') || lower.includes('disabled') || lower.includes('sheets api'))) diagnosis = 'Google Sheets API disabled';
  else if (statusCode === 403) diagnosis = 'service account lacks access';
  else if (statusCode === 404) diagnosis = 'spreadsheet not found';
  return { statusCode, message, diagnosis };
}

function logWorksheetSelectorFailure(fileId: string, error: unknown) {
  if (process.env.NODE_ENV === 'production') return;
  const safe = safeGoogleSheetError(error);
  console.warn('[worksheet-tabs] Google Sheets metadata unavailable', { fileId, ...safe });
}


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
  } catch (error) {
    logWorksheetSelectorFailure(fileId, error);
    return Response.json({ error: 'Worksheet selector unavailable' }, { status: 502 });
  }
}
