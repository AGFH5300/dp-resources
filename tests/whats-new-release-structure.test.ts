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

  it('records the visual What’s New redesign in both public changelog sources', () => {
    const page = read('app/changelog/page.tsx');
    const changelog = read('lib/changelog.ts');
    const summary =
      'Redesigned What’s New into a release-aware, feature-by-feature product presentation';

    expect(page).toContain('release-2026-09-17-whats-new-experience');
    expect(page).toContain(summary);
    expect(changelog).toContain("'2026-09-17': [");
    expect(changelog).toContain(summary);
  });
});
