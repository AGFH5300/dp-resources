import ExcelJS from 'exceljs';
import { requireMember } from '@/lib/auth';
import { assertInsideRoot, getDriveMetadata, getDriveStream, isDriveConfigured } from '@/lib/drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CacheEntry = { expires: number; modified: string | undefined; model: unknown };
const cache = new Map<string, CacheEntry>();
const TTL = 5 * 60 * 1000;
const MAX_CACHE = 8;
const MAX_CELLS = 25000;
const MAX_ROWS = 800;
const MAX_COLS = 120;

async function streamToBuffer(stream: ReadableStream) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 25 * 1024 * 1024) throw new Error('Workbook is too large to preview safely.');
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
function argb(c?: Partial<ExcelJS.Color>) { return c && 'argb' in c && c.argb ? `#${String(c.argb).slice(-6)}` : undefined; }
function safeLink(v: unknown) { const s = typeof v === 'string' ? v : ''; return /^(https?:|mailto:)/i.test(s) ? s : undefined; }
function textValue(v: ExcelJS.CellValue) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if ('result' in v) return textValue(v.result as ExcelJS.CellValue);
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((x) => x.text).join('');
    if ('text' in v) return String(v.text ?? '');
    if (v instanceof Date) return v.toISOString();
    return String((v as { value?: unknown }).value ?? '');
  }
  return String(v);
}
function colName(n: number) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

async function buildModel(fileId: string, title: string, modified?: string) {
  const metaMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const media = await getDriveStream(fileId, metaMime);
  if ('unavailable' in media) throw new Error('Workbook preview unavailable.');
  const wb = new ExcelJS.Workbook();
  wb.calcProperties.fullCalcOnLoad = false;
  await (wb.xlsx.load as any)(await streamToBuffer(media.stream));
  let cellsLeft = MAX_CELLS;
  const sheets = wb.worksheets.map((ws) => {
    const colCount = Math.min(ws.actualColumnCount || ws.columnCount || 1, MAX_COLS);
    const rowCount = Math.min(ws.actualRowCount || ws.rowCount || 1, MAX_ROWS, Math.max(1, Math.floor(cellsLeft / Math.max(colCount, 1))));
    cellsLeft -= rowCount * colCount;
    const merges = Object.keys((ws as unknown as { _merges?: Record<string, unknown> })._merges || {});
    const rows = [];
    for (let r = 1; r <= rowCount; r++) {
      const row = ws.getRow(r);
      if (row.hidden) continue;
      const cells = [];
      for (let c = 1; c <= colCount; c++) {
        const col = ws.getColumn(c);
        if (col.hidden) continue;
        const cell = row.getCell(c);
        const hyperlink = typeof cell.hyperlink === 'string' ? cell.hyperlink : undefined;
        cells.push({ address: cell.address, row: r, col: c, value: textValue(cell.value), formulaResult: cell.formula ? textValue(cell.result as ExcelJS.CellValue) : undefined, hyperlink: safeLink(hyperlink), style: { fill: argb(cell.fill && 'fgColor' in cell.fill ? cell.fill.fgColor : undefined), color: argb(cell.font?.color), bold: cell.font?.bold || undefined, italic: cell.font?.italic || undefined, align: cell.alignment?.horizontal, valign: cell.alignment?.vertical, border: cell.border ? true : undefined } });
      }
      rows.push({ number: r, height: row.height, cells });
    }
    return { name: ws.name, state: ws.state, rowCount, colCount, columns: Array.from({ length: colCount }, (_, i) => ({ index: i + 1, letter: colName(i + 1), width: ws.getColumn(i + 1).width, hidden: ws.getColumn(i + 1).hidden })), rows, merges, frozen: ws.views?.find((v) => v.state === 'frozen') || null };
  });
  const active = wb.views?.[0]?.activeTab ?? 0;
  return { title, modified, sheetNames: sheets.map((s) => s.name), activeSheet: sheets[active]?.name || sheets[0]?.name || '', sheets, capped: cellsLeft <= 0 };
}

export async function GET(_: Request, { params }: { params: Promise<{ fileId: string }> }) {
  await requireMember();
  if (!isDriveConfigured()) return Response.json({ error: 'Resources are not yet available' }, { status: 503 });
  const { fileId } = await params;
  if (!(await assertInsideRoot(fileId))) return Response.json({ error: 'Not found' }, { status: 404 });
  const meta = await getDriveMetadata(fileId);
  if (!meta || meta.isFolder) return Response.json({ error: 'Not found' }, { status: 404 });
  const key = `${fileId}:${meta.modifiedTime || ''}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Response.json(hit.model);
  const model = await buildModel(fileId, meta.name, meta.modifiedTime);
  cache.set(key, { model, modified: meta.modifiedTime, expires: Date.now() + TTL });
  while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string);
  return Response.json(model, { headers: { 'cache-control': 'private, max-age=60' } });
}
