import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '../lib/content-security-policy';
import { shouldPreserveRawRequestBody } from '../middleware';

const read = (path: string) => readFileSync(path, 'utf8');
const input = read('components/case-attachment-input.tsx');
const viewer = read('components/case-attachment-viewer.tsx');
const supportForm = read('app/support/support-form.tsx');
const supportRoute = read('app/api/support/route.ts');
const reportUi = read('components/resource-actions.tsx');
const reportRoute = read('app/api/reports/route.ts');
const attachmentRoute = read('app/api/case-attachments/[kind]/[id]/route.ts');
const processing = read('lib/case-attachments.ts');
const scanner = read('lib/attachment-malware-scan.ts');
const migration = read('supabase/migrations/20260913122907_case_attachments.sql');
const admin = read('app/admin/admin-console.tsx');

describe('support and resource-report attachments', () => {
  it('supports multiple pick, drag/drop, pasted screenshots, preview and removal before submission', () => {
    expect(input).toContain('multiple');
    expect(input).toContain('onDrop=');
    expect(input).toContain("window.addEventListener('paste'");
    expect(input).toContain('URL.createObjectURL(file)');
    expect(input).toContain('Remove attachment');
    expect(input).toContain('Add attachments');
  });

  it('submits attachments through both support and resource report forms', () => {
    expect(supportForm).toContain('<CaseAttachmentInput');
    expect(supportForm).toContain("body.append('attachments', file, file.name)");
    expect(supportForm).toContain("fetch('/api/support'");
    expect(reportUi).toContain('<CaseAttachmentInput');
    expect(reportUi).toContain("body.append('attachments', file, file.name)");
    expect(reportUi).toContain("fetch('/api/reports'");
    expect(supportRoute).toContain("contentType.startsWith('multipart/form-data')");
    expect(reportRoute).toContain("contentType.startsWith('multipart/form-data')");
  });

  it('keeps legacy JSON request support while adding strict multipart limits', () => {
    expect(supportRoute).toContain('MAX_SUPPORT_BODY_BYTES = 16 * 1024');
    expect(supportRoute).toContain("Buffer.byteLength(rawBody, 'utf8')");
    expect(reportRoute).toContain('MAX_REPORT_BODY_BYTES = 16 * 1024');
    expect(reportRoute).toContain("Buffer.byteLength(rawBody, 'utf8')");
    expect(supportRoute).toContain('CASE_ATTACHMENT_MAX_REQUEST_BYTES');
    expect(reportRoute).toContain('CASE_ATTACHMENT_MAX_REQUEST_BYTES');
  });

  it('validates actual file signatures, hashes files and rejects unsupported content', () => {
    expect(processing).toContain("ascii(bytes, 0, 5) === '%PDF-'");
    expect(processing).toContain("ascii(bytes, 8, 12) === 'WEBP'");
    expect(processing).toContain("ascii(bytes, 4, 8) === 'ftyp'");
    expect(processing).toContain("zip.file('word/document.xml')");
    expect(processing).toContain("zip.file('xl/workbook.xml')");
    expect(processing).toContain("zip.file('ppt/presentation.xml')");
    expect(processing).toContain("createHash('sha256')");
    expect(processing).not.toContain("extension === 'exe'");
  });

  it('stores only clean attachments in a private bucket with owner/admin metadata access', () => {
    expect(migration).toContain("'dp-case-attachments'");
    expect(migration).toContain('false,');
    expect(migration).toContain('alter table public.dp_case_attachments enable row level security');
    expect(migration).toContain('case attachments owner or admin read');
    expect(migration).toContain('public.dp_resources_is_admin()');
    expect(processing).toContain("scan_status: 'clean'");
    expect(processing).toContain('persistCaseAttachments');
  });

  it('fails closed in production unless the malware scanner is configured', () => {
    expect(scanner).toContain("process.env.NODE_ENV === 'production'");
    expect(scanner).toContain("mode === 'cloudmersive'");
    expect(scanner).toContain('CLOUDMERSIVE_API_KEY');
    expect(scanner).toContain('EICAR-STANDARD-ANTIVIRUS-TEST-FILE');
    expect(scanner).toContain("'scanner_not_configured'");
  });

  it('authorizes attachment reads and uses expiring signed URLs', () => {
    expect(attachmentRoute).toContain("membership.role !== 'admin'");
    expect(attachmentRoute).toContain(".eq('reporter_id', user.id)");
    expect(attachmentRoute).toContain('.createSignedUrls(paths, 10 * 60)');
    expect(attachmentRoute).toContain(".eq('scan_status', 'clean')");
  });

  it('shows attachments to users and in the admin case inspector', () => {
    expect(supportForm).toContain('<CaseAttachmentViewer kind="support"');
    expect(admin).toContain("import { CaseAttachmentViewer }");
    expect(admin).toContain('title="Submitted attachments"');
    expect(viewer).toContain('Security scanned');
    expect(viewer).toContain('<video');
    expect(viewer).toContain('<img');
  });

  it('preserves multipart bodies and allows signed Supabase media in the CSP', () => {
    expect(shouldPreserveRawRequestBody('/api/account/avatar')).toBe(true);
    expect(shouldPreserveRawRequestBody('/api/support')).toBe(true);
    expect(shouldPreserveRawRequestBody('/api/reports')).toBe(true);
    const csp = contentSecurityPolicy('attachmentNonce123');
    const media = csp.split('; ').find((part) => part.startsWith('media-src '));
    expect(media).toContain('https://*.supabase.co');
  });
});
