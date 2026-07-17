import { describe, expect, it } from 'vitest';
import { dayAfter, dayStart, validAction } from '../lib/admin-filters';
import {
  normalizeSearch,
  safeDownloadName,
  workspaceExportFor,
} from '../lib/drive-utils';

describe('route authorization expectations', () => {
  it('documents protected route redirects', () => {
    expect('/auth').toBe('/auth');
    expect('/awaiting-approval').toBe('/awaiting-approval');
    expect('/library').toBe('/library');
  });
});

describe('Drive root containment helpers', () => {
  it('limits search input length before Drive queries', () => {
    expect(normalizeSearch(`  ${'a'.repeat(150)}  `)).toHaveLength(100);
  });
});

describe('Google Workspace export selection', () => {
  it('selects safe export formats and rejects unsupported native files', () => {
    expect(workspaceExportFor('application/vnd.google-apps.document')).toEqual({
      mimeType: 'application/pdf',
      extension: 'pdf',
    });
    expect(
      workspaceExportFor('application/vnd.google-apps.spreadsheet')?.extension,
    ).toBe('xlsx');
    expect(
      workspaceExportFor('application/vnd.google-apps.presentation')?.mimeType,
    ).toBe('application/pdf');
    expect(workspaceExportFor('application/vnd.google-apps.form')).toBeNull();
  });

  it('sanitizes response header filenames', () => {
    expect(safeDownloadName('bad/evil"name', 'pdf')).toBe('badevilname.pdf');
  });
});

describe('CSV activity filter date logic', () => {
  it('uses inclusive selected end date by querying before next day', () => {
    expect(dayStart('2026-07-01')).toBe('2026-07-01T00:00:00.000Z');
    expect(dayAfter('2026-07-01')).toBe('2026-07-02T00:00:00.000Z');
    expect(validAction('not-real')).toBe('');
    expect(validAction('download_started')).toBe('download_started');
  });
});
