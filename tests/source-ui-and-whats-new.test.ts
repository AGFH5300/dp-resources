import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('source UI and release notes', () => {
  it('uses the app dropdown instead of native selects', () => {
    const files = [
      'components/question-bank/practice-set-builder.tsx',
      'app/admin/content-sources/source-admin-workspace.tsx',
      'app/library/sources/[sourceSlug]/page.tsx',
    ];

    for (const file of files) {
      const source = read(file);
      expect(source).toContain('AppSelect');
      expect(source).not.toContain('<select');
    }
  });

  it('shows Question Bank sources on the landing page', () => {
    const page = read('app/question-bank/page.tsx');
    expect(page).toContain("client.rpc('dp_content_source_options')");
    expect(page).toContain('Question sources');
    expect(page).toContain('question_variant_count');
  });

  it('shows What’s new once per release and keeps it reopenable', () => {
    const dialog = read('components/whats-new-dialog.tsx');
    const accountMenu = read('components/account-menu.tsx');
    expect(dialog).toContain('WHATS_NEW_RELEASE.id');
    expect(dialog).toContain('localStorage.getItem');
    expect(dialog).toContain('localStorage.setItem');
    expect(dialog).toContain('View full changelog');
    expect(dialog).not.toContain('Sparkles');
    expect(accountMenu).toContain('dp:open-whats-new');
    expect(accountMenu).toContain('WHATS_NEW_RELEASE.dateLabel');
    expect(accountMenu).not.toContain('Sparkles');
  });
});
