import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const detailSource = readFileSync(
  'lib/question-bank/revision-village-detail.ts',
  'utf8',
);
const routeSource = readFileSync(
  'app/api/question-bank/questions/[variantId]/route.ts',
  'utf8',
);
const migrationSource = readFileSync(
  'supabase/migrations/20260728131500_revision_village_render_repairs.sql',
  'utf8',
);

describe('Question Bank deduplicated asset alias delivery', () => {
  it('loads the admin-only provenance table through a narrowly scoped server path', () => {
    expect(detailSource).toContain("import 'server-only'");
    expect(detailSource).toContain('createSupabaseAdminClient');
    expect(detailSource).toContain("adminClient\n            .from('dp_qb_asset_sources')");
    expect(detailSource).toContain(".in('asset_id', assetIds)");
  });

  it('emits verified non-audio assets through every supported renderer role', () => {
    expect(routeSource).toContain('const ASSET_RENDER_ROLES');
    expect(routeSource).toContain("'question'");
    expect(routeSource).toContain("'markscheme'");
    expect(routeSource).toContain("'examiner_report'");
    expect(routeSource).toContain("'content_reference'");
    expect(routeSource).toContain('return ASSET_RENDER_ROLES.map');
  });

  it('keeps the render audit aligned with role-tolerant API delivery', () => {
    expect(migrationSource).toContain('join public.dp_qb_variant_assets variant_asset');
    expect(migrationSource).toContain(
      'variant_asset.asset_id = asset_source.asset_id',
    );
    expect(migrationSource).not.toContain(
      'variant_asset.role = referenced_images.role',
    );
  });
});
