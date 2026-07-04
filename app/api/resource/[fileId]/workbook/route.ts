import * as XLSX from 'xlsx';
import { requireMember } from '@/lib/auth';
import { assertInsideRoot, getDriveMetadata, getDriveStream, isDriveConfigured } from '@/lib/drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CacheEntry = { expires: number; model: unknown };
const cache = new Map<string, CacheEntry>();
const TTL = 5 * 60 * 1000;
const MAX_CACHE = 16;
const MAX_CELLS = 25000;
const MAX_ROWS = 1000;
const MAX_COLS = 160;

async function streamToBuffer(stream: ReadableStream) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 30 * 1024 * 1024) throw new Error('Workbook is too large to preview safely.');
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
function colName(n: number) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function safeLink(v: unknown) { const s = typeof v === 'string' ? v : ''; return /^(https?:|mailto:)/i.test(s) ? s : undefined; }
function cssColor(rgb?: string) { return rgb && /^[0-9a-f]{6,8}$/i.test(rgb) ? `#${rgb.slice(-6)}` : undefined; }
function cellText(cell: XLSX.CellObject | undefined) { if (!cell) return ''; if (cell.w != null) return String(cell.w); if (cell.v == null) return ''; if (cell.v instanceof Date) return cell.v.toISOString(); return String(cell.v); }
function jsonError(message: string, status = 500, code = 'WORKBOOK_PARSE_FAILED') { return Response.json({ error: message, code }, { status }); }

async function loadWorkbook(fileId: string) {
  const media = await getDriveStream(fileId, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  if ('unavailable' in media) throw new Error('Workbook preview unavailable.');
  return XLSX.read(await streamToBuffer(media.stream), {
    type: 'buffer',
    cellStyles: true,
    cellFormula: true,
    cellHTML: false,
    cellNF: true,
    cellDates: true,
    bookVBA: false,
    bookDeps: false,
    WTF: false,
  });
}
function workbookMetadata(wb: XLSX.WorkBook, title: string, modified?: string) {
  const active = Math.max(0, ((wb.Workbook?.Views?.[0] as { activeTab?: number } | undefined)?.activeTab ?? 0));
  return { title, modified, sheetNames: wb.SheetNames, activeSheet: wb.SheetNames[active] || wb.SheetNames[0] || '', metadata: { sheetCount: wb.SheetNames.length, props: wb.Props || {} } };
}
function sheetModel(wb: XLSX.WorkBook, title: string, modified: string | undefined, sheetName: string) {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('Selected sheet was not found.');
  const decoded = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  const rowMax = Math.min(decoded.e.r, decoded.s.r + MAX_ROWS - 1);
  const colMax = Math.min(decoded.e.c, decoded.s.c + MAX_COLS - 1);
  const cols = ws['!cols'] || [];
  const rowInfo = ws['!rows'] || [];
  const rows = [];
  let cellsSeen = 0;
  for (let r = decoded.s.r; r <= rowMax && cellsSeen < MAX_CELLS; r++) {
    if (rowInfo[r]?.hidden) continue;
    const cells = [];
    for (let c = decoded.s.c; c <= colMax && cellsSeen < MAX_CELLS; c++) {
      if (cols[c]?.hidden) continue;
      const address = XLSX.utils.encode_cell({ r, c });
      const cell = ws[address] as (XLSX.CellObject & { l?: { Target?: string }, s?: any }) | undefined;
      const style = cell?.s || {};
      cells.push({ address, row: r + 1, col: c + 1, value: cellText(cell), formulaResult: cell?.f ? cellText(cell) : undefined, hyperlink: safeLink(cell?.l?.Target), style: { fill: cssColor(style.fgColor?.rgb || style.fill?.fgColor?.rgb), color: cssColor(style.color?.rgb || style.font?.color?.rgb), bold: style.bold || style.font?.bold || undefined, italic: style.italic || style.font?.italic || undefined, align: style.alignment?.horizontal, valign: style.alignment?.vertical, border: style.border ? true : undefined } });
      cellsSeen++;
    }
    rows.push({ number: r + 1, height: rowInfo[r]?.hpx || rowInfo[r]?.hpt, hidden: rowInfo[r]?.hidden || false, cells });
  }
  return { ...workbookMetadata(wb, title, modified), selectedSheet: sheetName, usedRange: ws['!ref'] || 'A1:A1', rowCount: decoded.e.r + 1, colCount: decoded.e.c + 1, columns: Array.from({ length: colMax - decoded.s.c + 1 }, (_, i) => { const idx = decoded.s.c + i; return { index: idx + 1, letter: colName(idx + 1), width: cols[idx]?.wch || cols[idx]?.wpx, hidden: cols[idx]?.hidden || false }; }), hiddenRows: rowInfo.map((r, i) => r?.hidden ? i + 1 : null).filter(Boolean), hiddenColumns: cols.map((c, i) => c?.hidden ? colName(i + 1) : null).filter(Boolean), merges: (ws['!merges'] || []).map((m) => XLSX.utils.encode_range(m)), frozen: null, capped: cellsSeen >= MAX_CELLS || rowMax < decoded.e.r || colMax < decoded.e.c, rows };
}

export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    await requireMember();
    if (!isDriveConfigured()) return jsonError('Resources are not yet available', 503, 'DRIVE_NOT_CONFIGURED');
    const { fileId } = await params;
    if (!(await assertInsideRoot(fileId))) return jsonError('Not found', 404, 'NOT_FOUND');
    const meta = await getDriveMetadata(fileId);
    if (!meta || meta.isFolder) return jsonError('Not found', 404, 'NOT_FOUND');
    const sheet = new URL(req.url).searchParams.get('sheet');
    const key = `${fileId}:${meta.modifiedTime || ''}:${sheet || '__metadata__'}`;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return Response.json(hit.model);
    const wb = await loadWorkbook(fileId);
    const model = sheet ? sheetModel(wb, meta.name, meta.modifiedTime, sheet) : workbookMetadata(wb, meta.name, meta.modifiedTime);
    cache.set(key, { model, expires: Date.now() + TTL });
    while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string);
    return Response.json(model, { headers: { 'cache-control': 'private, max-age=60' } });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Workbook preview failed.');
  }
}
