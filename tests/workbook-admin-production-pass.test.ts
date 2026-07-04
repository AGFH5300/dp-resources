import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
const read=(p:string)=>readFileSync(p,'utf8');

describe('workbook and admin production pass',()=>{
  it('parses a workbook containing a History sheet with SheetJS',()=>{
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['ok']]),'History');
    const parsed=XLSX.read(XLSX.write(wb,{bookType:'xlsx',type:'buffer'}),{type:'buffer'});
    expect(parsed.SheetNames).toContain('History');
  });
  it('workbook API uses SheetJS, node runtime, sheet-scoped loading, and JSON errors',()=>{
    const route=read('app/api/resource/[fileId]/workbook/route.ts');
    expect(route).toContain("export const runtime = 'nodejs'");
    expect(route).toContain("import * as XLSX from 'xlsx'");
    expect(route).not.toContain('exceljs');
    expect(route).toContain('WORKBOOK_PARSE_FAILED');
    expect(route).toContain('searchParams.get(\'sheet\')');
  });
  it('client safely reads workbook JSON and renders the History tab from metadata',()=>{
    const preview=read('app/resource/[fileId]/resource-preview.tsx');
    expect(preview).toContain('readJsonSafe');
    expect(preview).toContain('encodeURIComponent(active)');
    expect(preview).toContain('meta.sheetNames.map');
    expect(preview).not.toContain('Unexpected end of JSON input');
  });
  it('admin queues use custom selects and PATCH case inspectors',()=>{
    const console=read('app/admin/admin-console.tsx');
    expect(console).toContain('AdminSelect');
    expect(console).toContain("method:'PATCH'");
    expect(console).toContain('Report updated');
    expect(console).toContain('Support ticket updated');
    expect(console).not.toContain('<select');
  });
});
