from pathlib import Path

# 1) What's New: retain existing 16 Sep highlights, add missing live-data changes.
p = Path('lib/whats-new.ts')
text = p.read_text()
text = text.replace(
    "        'The Question Bank now includes 11,763 distinct RevisionDojo questions across 15,571 course/question variants, with RevisionDojo available as a source throughout the Question Bank and Practice Builder.',",
    "        'A full production import audited 12,306 visible RevisionDojo questions and accepted 11,832 source IDs. After deduplication, RevisionDojo now spans 11,763 distinct canonical questions and 15,571 distinct variants, with 15,645 source links and source filtering throughout Question Bank and Practice Builder.',",
)
anchor = "    {\n      title: 'Take a guided tour of DP Resources',"
insert = """    {
      title: 'CBS Physics A.1–A.5 added',
      description:
        'CBS has now been fully imported from 341 source occurrences into 217 distinct questions and 302 live, ready variants across Physics A.1–A.5: 137 HL and 165 SL. All CBS variants passed final render QA with zero remaining quarantined variants.',
    },
    {
      title: '606 redundant question rows cleaned up safely',
      description:
        'Two live Question Bank deduplication passes consolidated 415 redundant canonical rows on 15 September and another 191 on 16 September, while preserving source provenance, variants, assets, saved questions, practice references and user progress. Ambiguous collisions were kept separate instead of being force-merged.',
    },
"""
if "title: 'CBS Physics A.1–A.5 added'" not in text:
    text = text.replace(anchor, insert + anchor, 1)
p.write_text(text)

# Shared release-note text.
revisiondojo = (
    'Completed the full RevisionDojo production import after auditing 12,306 visible questions: 11,832 source IDs were accepted and 474 withheld, with 28 canonical merges and 3 empty placeholders removed; after global deduplication, RevisionDojo now spans 11,763 distinct canonical questions, 15,571 distinct variants and 15,645 source links, with source filtering available in Question Bank and Practice Builder.'
)
cbs = (
    'Added CBS Physics A.1–A.5 to the live Question Bank from 341 source occurrences, consolidated into 232 CBS source groups and 217 distinct canonical questions; 302 variants are live and ready (137 HL and 165 SL) with 310 CBS variant-source provenance links and zero remaining quarantined CBS variants.'
)
dedupe_191 = (
    'Completed a second global Question Bank deduplication pass, consolidating 191 redundant canonical rows (42,189 to 41,998 before the CBS addition) while preserving 44,095 question-source and 58,714 variant-source provenance rows plus saved, progress and practice references; final audited duplicate and orphan checks were zero.'
)
dedupe_415 = (
    'Consolidated 415 redundant canonical Question Bank rows in live Supabase: 384 confirmed Revision Village/cross-source duplicates and 31 exact Pestle duplicates, while preserving provenance, variants, topic placements, assets, papers and videos, saved questions and user progress; 16 ambiguous Revision Village reference collisions were deliberately left separate.'
)

# 2) Public changelog page.
p = Path('app/changelog/page.tsx')
text = p.read_text()
old_rev = 'Expanded the Question Bank with 11,763 distinct RevisionDojo questions across 15,571 course/question variants and 15,645 source assignments, with RevisionDojo available as a source in Question Bank and Practice Builder filtering.'
text = text.replace(old_rev, revisiondojo)
anchor = "const latestReleaseNotes: ChangelogEntry[] = [\n"
entries = """  {
    id: 'release-2026-09-16-cbs-question-bank-import',
    summary:
      %r,
    date: '2026-09-16T18:21:18.000Z',
  },
  {
    id: 'release-2026-09-16-global-question-bank-dedupe',
    summary:
      %r,
    date: '2026-09-16T15:57:28.000Z',
  },
  {
    id: 'release-2026-09-15-question-bank-dedupe',
    summary:
      %r,
    date: '2026-09-15T18:36:37.000Z',
  },
""" % (cbs, dedupe_191, dedupe_415)
if "release-2026-09-16-cbs-question-bank-import" not in text:
    text = text.replace(anchor, anchor + entries, 1)
p.write_text(text)

# 3) Fallback changelog mirrors the public page for 15/16 Sep.
p = Path('lib/changelog.ts')
text = p.read_text().replace(old_rev, revisiondojo)
anchor16 = "  '2026-09-16': [\n"
if cbs not in text:
    text = text.replace(anchor16, anchor16 + f"    {cbs!r},\n    {dedupe_191!r},\n", 1)
anchor15 = "const historicalSummaries: Record<string, string[]> = {\n"
if "'2026-09-15': [" not in text:
    text = text.replace(anchor15, anchor15 + f"  '2026-09-15': [\n    {dedupe_415!r},\n  ],\n", 1)
p.write_text(text)

# 4) Replace the audit doc with a cross-source production-to-now audit.
p = Path('docs/POST_PRODUCTION_RELEASE_AUDIT_2026-09-16.md')
p.write_text("""# Post-production release audit — 16 September 2026

Production baseline: `400999180c4f89f6aaa4f9178af9a465b022dded` (13 September attachment release, currently live on Render during this audit).

Audit scope: every completed user-facing change after that production SHA through 16 September 2026, cross-checked against GitHub history, live Supabase state, applied Supabase migrations, and DP Resources ChatGPT work history. Staging-only, abandoned, or unfinished experiments are excluded from public release notes.

## Live data/content changes that GitHub history alone does not capture

- **15 Sep — first Question Bank deduplication:** 415 redundant canonical rows consolidated in live Supabase: 384 confirmed Revision Village/cross-source duplicates and 31 exact Pestle duplicates. Provenance, variants/topic placements, assets, papers/videos, saved questions and user progress were preserved. Sixteen ambiguous Revision Village reference collisions were intentionally left separate. Post-audit: zero high-confidence duplicate candidates, zero exact same-reference/content duplicate groups, and zero orphaned source/variant/progress/saved-question rows.
- **16 Sep — RevisionDojo production import:** 12,306 visible questions audited; 11,832 source IDs accepted; 474 excluded; 28 canonical merges; 3 empty placeholders removed. Current live attribution is 11,763 distinct canonical questions, 15,571 distinct variants and 15,645 RevisionDojo variant-source links. The import also produced 19,898 placements and passed duplicate, empty-question, placement, provenance and search-integrity checks.
- **16 Sep — second global Question Bank cleanup:** another 191 redundant canonical rows were consolidated, reducing 42,189 to 41,998 canonical questions before CBS was added. The cleanup preserved 44,095 question-source and 58,714 variant-source provenance rows plus saved questions, progress, practice and shared-practice references. Final exact, normalized/markup-only, same-placement, duplicate-variant and orphan checks were zero.
- **16 Sep — CBS Physics import and final QA:** 341 exact PDF/source occurrences were reconciled into 232 CBS source groups and 217 distinct canonical questions. Of those, 91 reused existing canonical questions and 126 were genuinely new. CBS now has 302 live variants across Physics A.1–A.5 (137 HL and 165 SL) and 310 CBS variant-source provenance links. Final QA reports 302 ready / 0 quarantined, zero import flags, zero blank questions/markschemes, zero invalid marks, zero missing source IDs, zero duplicate links and no temporary import tables left behind.
- **Current post-CBS Question Bank state:** 42,124 canonical questions, 57,776 variants, 44,327 question-source rows and 59,024 variant-source rows.

## GitHub/application changes since production

- New 12-step guided onboarding across Library, IB Resource Library, Question Bank, Search, Practice Builder, Sources, Recent, Saved and Settings.
- Replayable tutorial from Settings, required-click cues, background lock, stable target tracking, loading-shell targets and faster cross-route transitions.
- Practice Builder light-mode selection/completed-state polish and clearer eligible-question feedback.
- Question Bank/Practice Builder timeout resilience, fail-soft optional counts, reduced speculative prefetching and source-count query/index improvements.
- CH0007 duplicate repair with Revision Town/Revision Village provenance preserved.
- Imported answer-macro/rendering compatibility repair.
- Dark-mode readability improvements for Support/resource-report attachment controls.

## Public release-note policy

The Changelog is exhaustive for completed user-facing changes in this production-to-now window. What’s New is shorter, but must headline the large RevisionDojo and CBS additions, the live deduplication work, and the major product/UI improvements. Internal-only CI mechanics, temporary import helpers, staging tables and abandoned experiments remain excluded.
""")

# 5) Add regression coverage for the Supabase/chat-history-only release items.
p = Path('tests/post-production-live-data-release-audit.test.ts')
p.write_text("""import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('post-production live-data release audit', () => {
  it('keeps Supabase-only Question Bank changes in public release surfaces', () => {
    const whatsNew = read('lib/whats-new.ts');
    const page = read('app/changelog/page.tsx');
    const fallback = read('lib/changelog.ts');
    const audit = read('docs/POST_PRODUCTION_RELEASE_AUDIT_2026-09-16.md');

    for (const text of [
      'CBS Physics A.1–A.5 added',
      '606 redundant question rows cleaned up safely',
    ]) expect(whatsNew).toContain(text);

    for (const text of [
      '341 source occurrences',
      '217 distinct canonical questions',
      '302 variants are live and ready',
      '415 redundant canonical Question Bank rows',
      '191 redundant canonical rows',
      '12,306 visible questions',
      '11,832 source IDs',
      '11,763 distinct canonical questions',
      '15,571 distinct variants',
      '15,645 source links',
    ]) {
      expect(page).toContain(text);
      expect(fallback).toContain(text);
    }

    for (const text of ['42,124 canonical questions', '57,776 variants', '302 ready / 0 quarantined']) {
      expect(audit).toContain(text);
    }
  });
});
""")
