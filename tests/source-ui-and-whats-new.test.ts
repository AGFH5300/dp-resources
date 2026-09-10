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
    expect(dialog).toContain('max-h-[min(52vh,28rem)]');
    expect(dialog).toContain('overflow-y-auto');
    expect(dialog).toContain('overscroll-contain');
    expect(dialog).not.toContain('Sparkles');
    expect(accountMenu).toContain('dp:open-whats-new');
    expect(accountMenu).toContain('WHATS_NEW_RELEASE.dateLabel');
    expect(accountMenu).not.toContain('Sparkles');
  });

  it('keeps What’s new as a short hand-written 10 September release summary', () => {
    const whatsNew = read('lib/whats-new.ts');
    expect(whatsNew).toContain("id: '2026-09-10-settings-account-centre'");
    expect(whatsNew).toContain("dateLabel: '10 September 2026'");
    expect(whatsNew).not.toContain("dateLabel: 'September 2026'");
    expect(whatsNew).not.toContain('Save your IB academic profile');
    for (const highlight of [
      'A new Settings & Account Centre',
      'Choose how source information appears',
      'More control over notifications',
      'Profile pictures now appear in your account menu',
      'Username availability is checked automatically',
      'Account security has been strengthened',
    ]) {
      expect(whatsNew).toContain(highlight);
    }
  });

  it('keeps the August 6-16 release window curated and filters public notes to user-facing changes', () => {
    const changelog = read('app/changelog/page.tsx');
    const changelogList = read('app/changelog/changelog-list.tsx');
    const publicFilter = read('lib/public-changelog.ts');

    for (const date of [
      '2026-08-16',
      '2026-08-15',
      '2026-08-14',
      '2026-08-13',
      '2026-08-12',
      '2026-08-11',
      '2026-08-08',
      '2026-08-07',
      '2026-08-06',
    ]) {
      expect(changelog).toContain(date);
    }
    expect(changelog).toContain('curatedDates');
    expect(changelog).toContain("!curatedDates.has(entry.date.slice(0, 10))");
    expect(changelog).toContain('Made Library folder headers more compact');
    expect(changelog).toContain('Strengthened sign-in sessions and HTTPS transport');
    expect(changelog).toContain('Added unified content-source attribution');
    expect(changelogList).toContain('publicChangelogEntries(entries)');
    expect(publicFilter).toContain('INTERNAL_ONLY_PATTERNS');
    expect(publicFilter).toContain('production runtime');
    expect(publicFilter).toContain('library[-\\s]+index');
  });
});
