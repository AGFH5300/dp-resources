import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  WHATS_NEW_RELEASES,
  getWhatsNewRelease,
  latestAutoOpenRelease,
} from '../lib/whats-new';

const read = (path: string) => readFileSync(path, 'utf8');

describe('What’s New release structure', () => {
  it('keeps release and feature identifiers unique and renders meaningful releases', () => {
    expect(WHATS_NEW_RELEASES.length).toBeGreaterThan(0);

    const releaseIds = WHATS_NEW_RELEASES.map((release) => release.id);
    expect(new Set(releaseIds).size).toBe(releaseIds.length);

    for (const release of WHATS_NEW_RELEASES) {
      expect(release.id.length).toBeGreaterThan(0);
      expect(release.features.length).toBeGreaterThan(0);
      expect(getWhatsNewRelease(release.id)?.id).toBe(release.id);

      const featureIds = release.features.map((feature) => feature.id);
      expect(new Set(featureIds).size).toBe(featureIds.length);

      for (const feature of release.features) {
        expect(feature.title.trim().length).toBeGreaterThan(0);
        expect(feature.description.trim().length).toBeGreaterThan(0);
        if (feature.cta) expect(feature.cta.href.startsWith('/')).toBe(true);
        if (feature.media) expect(feature.media.alt.trim().length).toBeGreaterThan(0);
      }
    }

    expect(latestAutoOpenRelease()?.showWhatsNew).toBe(true);
    expect(latestAutoOpenRelease()?.id).toBe(
      '2026-09-18-kinematics-source-expansion',
    );
  });

  it('keeps the completed SME A.1 import reproducible and cleans import-only artifacts', () => {
    const finalize = read(
      'supabase/migrations/20260918113421_finalize_sme_a1_and_backfill_profiles.sql',
    );
    const cleanup = read(
      'supabase/migrations/20260918113745_cleanup_sme_a1_import_artifacts.sql',
    );
    const audit = read('docs/SME_A1_PRODUCTION_AUDIT_2026-09-18.md');

    expect(finalize).toContain("reference = '17N.1.SL.TZ0.5'");
    expect(finalize).toContain('drop table if exists public.dp_qb_sme_a1_stage_20260917');
    expect(finalize).toContain('dp_resource_profiles');
    expect(cleanup).toContain('drop function if exists public.dp_sme_a1_stage_upsert(jsonb)');
    expect(cleanup).toContain('private.sme_a1_match_index_20260917');
    expect(audit).toContain('44 ready variants');
    expect(audit).toContain('57,740** ready variants');
    expect(audit).toContain('42 rows became new canonical questions');
  });

  it('keeps account-level viewed-release persistence in migration and schema snapshots', () => {
    const migration = read(
      'supabase/migrations/20260916234500_whats_new_release_history.sql',
    );
    const schema = read('supabase/schema.sql');

    for (const source of [migration, schema]) {
      expect(source).toContain('viewed_whats_new_releases');
      expect(source).toContain("jsonb_typeof(viewed_whats_new_releases) = 'array'");
    }
  });

  it('records the current Kinematics release in both public changelog sources', () => {
    const page = read('app/changelog/page.tsx');
    const changelog = read('lib/changelog.ts');
    const summary =
      'Expanded Physics A.1 Kinematics with 44 Save My Exams question variants';

    expect(page).toContain('release-2026-09-18-sme-a1-kinematics');
    expect(page).toContain(summary);
    expect(changelog).toContain("'2026-09-18': [");
    expect(changelog).toContain(summary);
  });

  it('records the visual What’s New redesign in both public changelog sources', () => {
    const page = read('app/changelog/page.tsx');
    const changelog = read('lib/changelog.ts');
    const summary =
      'Redesigned What’s New into a polished feature-by-feature update experience';

    expect(page).toContain('release-2026-09-17-whats-new-experience');
    expect(page).toContain(summary);
    expect(changelog).toContain("'2026-09-17': [");
    expect(changelog).toContain(summary);
  });
});
