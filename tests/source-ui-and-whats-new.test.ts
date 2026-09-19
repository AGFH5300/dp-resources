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

  it('uses a release-aware immersive What’s New experience', () => {
    const dialog = read('components/whats-new-dialog.tsx');
    const controller = read(
      'components/whats-new/use-whats-new-controller.ts',
    );
    const slide = read('components/whats-new/whats-new-slide.tsx');
    const media = read('components/whats-new/whats-new-media.tsx');
    const navigation = read('components/whats-new/whats-new-navigation.tsx');
    const history = read('components/whats-new/whats-new-history.tsx');
    const client = read('lib/whats-new-client.ts');
    const accountMenu = read('components/account-menu.tsx');
    const previewRoute = read('app/api/account/whats-new/preview/route.ts');

    expect(dialog).toContain('useWhatsNewController');
    expect(dialog).toContain('prefers-reduced-motion');
    expect(dialog).toContain("event.key === 'ArrowLeft'");
    expect(dialog).toContain("event.key === 'ArrowRight'");
    expect(dialog).toContain('onPointerDown');
    expect(dialog).toContain('onPointerUp');
    expect(dialog).toContain('WhatsNewHistory');
    expect(dialog).toContain('WhatsNewNavigation');
    expect(dialog).toContain('WhatsNewSlide');
    expect(dialog).toContain('role="dialog"');
    expect(dialog).toContain('aria-modal="true"');

    expect(controller).toContain('WHATS_NEW_RELEASES');
    expect(controller).toContain('latestAutoOpenRelease');
    expect(controller).toContain('previewWhatsNew');
    expect(controller).not.toContain('process.env');
    expect(controller).toContain('/api/account/whats-new/preview?releaseId=');
    expect(previewRoute).toContain("process.env.NODE_ENV === 'production'");
    expect(previewRoute).toContain('getWhatsNewRelease');
    expect(controller).toContain("router.push(href)");
    expect(controller).toContain('persistAccountViewedRelease');
    expect(controller).toContain("reason: 'history'");

    expect(slide).toContain('WhatsNewMedia');
    expect(slide).toContain('feature.cta');
    expect(slide).toContain('onTryIt');
    expect(media).toContain('playsInline');
    expect(media).toContain("preload={active ? 'metadata' : 'none'}");
    expect(media).toContain('video.pause()');
    expect(media).toContain('requestFullscreen');
    expect(media).toContain('webkitEnterFullscreen');
    expect(media).toContain('Replay video');
    expect(media).toContain('Question variants by source');
    expect(media).toContain('Source coverage can overlap');
    for (const count of [
      '57,675',
      '57,696',
      '15,503',
      '15,571',
      '13,374',
      '13,190',
      '12,172',
      '12,169',
      '4,173',
      '302',
      '44',
    ]) {
      expect(media).toContain(count);
    }
    expect(media).toContain('Save My Exams');
    expect(media).toContain('Kinematics source coverage');
    expect(media).toContain('Clearer, faster diagrams');
    expect(media).toContain('One feature at a time');
    expect(media).toContain('No variant overlap between these two source sets');
    expect(navigation).toContain('Previous feature');
    expect(navigation).toContain('Next feature');
    expect(navigation).toContain('Done');
    expect(history).toContain('Release history');

    expect(client).toContain('WHATS_NEW_VIEWED_RELEASES_STORAGE_KEY');
    expect(client).toContain("fetch('/api/account/whats-new'");
    expect(client).toContain('persistAccountViewedRelease');
    expect(accountMenu).toContain('dp:open-whats-new');
  });

  it('keeps What’s New curated separately from the detailed changelog', () => {
    const whatsNew = read('lib/whats-new.ts');
    expect(whatsNew).toContain('export type WhatsNewRelease');
    expect(whatsNew).toContain('showWhatsNew: boolean');
    expect(whatsNew).toContain('features: readonly WhatsNewFeature[]');
    expect(whatsNew).toContain("id: '2026-09-19-september-deployment'");
    expect(whatsNew).toContain("dateLabel: '19 September 2026'");
    expect(whatsNew).toContain('57,675 unique variants are live and ready');
    expect(whatsNew).toContain("id: '2026-09-18-kinematics-source-expansion'");
    expect(whatsNew).toContain('44 new Save My Exams Kinematics variants');
    expect(whatsNew).toContain("id: '2026-09-16-revisiondojo-guided-onboarding'");
    expect(whatsNew).toContain('Physics coverage goes deeper');
    expect(whatsNew).toContain('Learn DP Resources on the real interface');
    expect(whatsNew).toContain('Clearer, faster question diagrams');
    expect(whatsNew).toContain('A better way to discover every update');
    expect(whatsNew).toContain("href: '/question-bank/build'");
    expect(whatsNew).toContain("href: '/changelog'");
    expect(whatsNew).toContain('Practice feels clearer and steadier');
    expect(whatsNew).toContain(
      "cta: { label: 'Open Question Bank', href: '/question-bank' }",
    );
  });

  it('persists viewed releases at account level with a local fallback', () => {
    const route = read('app/api/account/whats-new/route.ts');
    const migration = read(
      'supabase/migrations/20260916234500_whats_new_release_history.sql',
    );
    const client = read('lib/whats-new-client.ts');

    expect(route).toContain('viewed_whats_new_releases');
    expect(route).toContain('requireApiMember');
    expect(route).toContain('sameOriginOrForbidden');
    expect(route).toContain('getWhatsNewRelease');
    expect(migration).toContain('viewed_whats_new_releases jsonb');
    expect(migration).toContain("jsonb_typeof(viewed_whats_new_releases) = 'array'");
    expect(client).toContain('readLocalViewedReleaseIds');
    expect(client).toContain('writeLocalViewedReleaseIds');
    expect(client).toContain('fetchAccountViewedReleaseIds');
  });

  it('records the 19 September private asset release in both public changelog sources', () => {
    const page = read('app/changelog/page.tsx');
    const history = read('lib/changelog.ts');
    const note = 'Improved Question Bank diagrams and markscheme visuals so they load more reliably and efficiently';

    expect(page).toContain('release-2026-09-19-private-question-bank-assets');
    expect(page).toContain(note);
    expect(history).toContain("'2026-09-19': [");
    expect(history).toContain(note);
    expect(page).toContain('57,675 variants remain live');
    expect(history).toContain('57,675 variants remain live');
  });

  it('records the 18 September Kinematics expansion in both public changelog sources', () => {
    const page = read('app/changelog/page.tsx');
    const history = read('lib/changelog.ts');
    const note = 'Expanded Physics A.1 Kinematics with 44 Save My Exams question variants';

    expect(page).toContain('release-2026-09-18-sme-a1-kinematics');
    expect(page).toContain(note);
    expect(history).toContain("'2026-09-18': [");
    expect(history).toContain(note);
    expect(page).toContain('57,740 ready variants');
    expect(history).toContain('57,740 ready variants');
  });

  it('curates the complete 16 September public release in both changelog sources', () => {
    const page = read('app/changelog/page.tsx');
    const history = read('lib/changelog.ts');
    for (const note of [
      'Added a 12-step interactive onboarding walkthrough',
      'Made tutorial navigation substantially faster and steadier',
      'Polished Practice Builder in light mode',
      'Improved Question Bank reliability when source or course counts are slow',
      'Fixed a duplicate CH0007 practice question',
      'Expanded the Question Bank with 11,763 distinct RevisionDojo questions',
      'Improved Support and resource-report attachment controls in dark mode',
    ]) {
      expect(page).toContain(note);
      expect(history).toContain(note);
    }
    expect(page).toContain('2026-09-16');
    expect(history).toContain("'2026-09-16': [");
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
