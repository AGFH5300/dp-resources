import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { describe, expect, it } from 'vitest';

import {
  QuestionSourceBadges,
  QuestionSourceInformation,
  ResourceAttributionBadges,
} from '@/components/content-source-badge';

const questionSources = [
  { slug: 'pestle', displayName: 'PESTLE', shortLabel: 'PESTLE', attributionLabel: 'Indexed from', reviewStatus: 'reviewed' as const, isVariantSource: true },
  { slug: 'exam_mate', displayName: 'Exam-Mate', shortLabel: 'Exam-Mate', attributionLabel: 'Indexed from', reviewStatus: 'reviewed' as const, isVariantSource: true },
  { slug: 'revision_village', displayName: 'Revision Village', shortLabel: 'Revision Village', attributionLabel: 'Indexed from', reviewStatus: 'reviewed' as const, isVariantSource: false },
];

describe('unified content source attribution', () => {
  it('renders accessible variant-source badges without leaking technical provenance', () => {
    const output = renderToStaticMarkup(<QuestionSourceBadges sources={questionSources} />);
    expect(output).toContain('Sources: PESTLE · Exam-Mate');
    expect(output).toContain('aria-label');
    expect(output).not.toMatch(/source_url|storage_key|capture|archive|signed/i);
  });

  it('separates indexed collections from also-found core sources', () => {
    const output = renderToStaticMarkup(<QuestionSourceInformation sources={questionSources} />);
    expect(output).toContain('Indexed collections:');
    expect(output).toContain('Also found in:');
    expect(output).toContain('Revision Village');
  });

  it('uses a neutral public label for unresolved Library attribution', () => {
    const output = renderToStaticMarkup(
      <ResourceAttributionBadges
        attribution={{
          sources: [{
            slug: 'unknown', displayName: 'Source attribution under review', shortLabel: 'Under review',
            attributionLabel: 'Source', reviewStatus: 'under_review', relationship: 'primary', isPrimary: true,
          }],
          resourceType: { slug: 'needs_review', displayName: 'Needs review', reviewStatus: 'under_review' },
        }}
      />,
    );
    expect(output).toContain('Source attribution under review');
    expect(output).toContain('Needs review');
  });

  it('keeps migration surfaces additive, RLS-protected, service-scoped and source-aware before practice dedup', () => {
    const migration = readFileSync('supabase/migrations/20260806151159_content_source_attribution.sql', 'utf8');
    for (const table of ['dp_content_sources', 'dp_content_source_aliases', 'dp_resource_source_assignments', 'dp_resource_types', 'dp_resource_type_assignments', 'dp_content_source_audit_log']) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("source.slug = any(p_source_slugs)");
    const sourceFilter = migration.indexOf("eligible.filters -> 'sourceSlugs'");
    const representativeRank = migration.indexOf('representative_rank', sourceFilter);
    expect(sourceFilter).toBeGreaterThan(0);
    expect(representativeRank).toBeGreaterThan(sourceFilter);
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).not.toMatch(/grant\s+select\s+\([^)]*website_url[^)]*\)\s+on public\.dp_content_sources to authenticated/i);
  });

  it('does not make the ambiguous legacy archive a Revision Town assignment', () => {
    const migration = readFileSync('supabase/migrations/20260806151159_content_source_attribution.sql', 'utf8');
    const legacyBackfill = migration.slice(
      migration.indexOf('The first authorised archive'),
      migration.indexOf('Library source assignments'),
    );
    expect(legacyBackfill).toContain("'unknown'");
    expect(legacyBackfill).toContain("'under_review'");
    expect(legacyBackfill).not.toContain("'revision_town'");
  });
});
