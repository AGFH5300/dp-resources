import 'server-only';
import { createSupabaseAdminClient } from './supabase-admin';
import type { PublicContentSource, ResourceAttribution } from './types';

type SourceRow = {
  slug: string;
  display_name: string;
  short_label: string;
  attribution_label: string;
  display_order: number;
};

type ResourceAssignmentRow = {
  drive_file_id: string;
  source_id: string;
  is_primary: boolean;
  relationship: ResourceAttribution['sources'][number]['relationship'];
  assignment_method: string;
  review_status: 'reviewed' | 'under_review' | 'rejected';
  source: SourceRow | SourceRow[] | null;
};

const sourcePrecedence: Record<string, number> = {
  admin_override: 1,
  manual: 1,
  import_manifest: 2,
  folder_inheritance: 3,
  reviewed_path_rule: 4,
  reviewed_filename_rule: 5,
  unresolved: 99,
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export async function getResourceAttributionMap(
  driveFileIds: string[],
): Promise<Map<string, ResourceAttribution>> {
  const ids = [...new Set(driveFileIds.filter(Boolean))];
  const result = new Map<string, ResourceAttribution>();
  if (!ids.length) return result;

  const sb = createSupabaseAdminClient();
  const [{ data: sourceRows }, { data: typeRows }] = await Promise.all([
    sb
      .from('dp_resource_source_assignments')
      .select(
        'drive_file_id,source_id,is_primary,relationship,assignment_method,review_status,source:dp_content_sources(slug,display_name,short_label,attribution_label,display_order)',
      )
      .in('drive_file_id', ids)
      .neq('review_status', 'rejected'),
    sb
      .from('dp_resource_type_assignments')
      .select(
        'drive_file_id,review_status,resource_type:dp_resource_types(slug,display_name)',
      )
      .in('drive_file_id', ids)
      .neq('review_status', 'rejected'),
  ]);

  const assignments = (sourceRows ?? []) as unknown as ResourceAssignmentRow[];
  const byFile = new Map<string, ResourceAssignmentRow[]>();
  for (const row of assignments) {
    const current = byFile.get(row.drive_file_id) ?? [];
    current.push(row);
    byFile.set(row.drive_file_id, current);
  }

  const types = new Map<string, ResourceAttribution['resourceType']>();
  for (const row of (typeRows ?? []) as any[]) {
    const resourceType = one(row.resource_type);
    if (!resourceType) continue;
    types.set(row.drive_file_id, {
      slug: resourceType.slug,
      displayName: resourceType.display_name,
      reviewStatus: row.review_status,
    });
  }

  for (const id of ids) {
    const rows = byFile.get(id) ?? [];
    const minPrecedence = rows.reduce(
      (min, row) => Math.min(min, sourcePrecedence[row.assignment_method] ?? 99),
      99,
    );
    const sources = rows
      .filter(
        (row) => (sourcePrecedence[row.assignment_method] ?? 99) === minPrecedence,
      )
      .map((row) => {
        const source = one(row.source);
        return source
          ? {
              slug: source.slug,
              displayName: source.display_name,
              shortLabel: source.short_label,
              attributionLabel: source.attribution_label,
              reviewStatus: row.review_status as 'reviewed' | 'under_review',
              relationship: row.relationship,
              isPrimary: row.is_primary,
              displayOrder: source.display_order,
            }
          : null;
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value))
      .sort(
        (a, b) =>
          Number(b.isPrimary) - Number(a.isPrimary) ||
          a.displayOrder - b.displayOrder ||
          a.displayName.localeCompare(b.displayName),
      )
      .map(({ displayOrder: _displayOrder, ...source }) => source);

    result.set(id, {
      sources,
      resourceType: types.get(id) ?? null,
    });
  }
  return result;
}

export type QuestionPublicSource = PublicContentSource & {
  isVariantSource: boolean;
};

export async function getQuestionSourceMap(
  variants: Array<{ variantId: string; questionId: string }>,
): Promise<Map<string, QuestionPublicSource[]>> {
  const variantIds = [...new Set(variants.map((item) => item.variantId))];
  const questionIds = [...new Set(variants.map((item) => item.questionId))];
  const result = new Map<string, QuestionPublicSource[]>();
  if (!variantIds.length) return result;
  const sb = createSupabaseAdminClient();
  const [{ data: variantRows }, { data: questionRows }] = await Promise.all([
    sb
      .from('dp_qb_variant_sources')
      .select(
        'variant_id,source_id,review_status,source:dp_content_sources(slug,display_name,short_label,attribution_label,display_order)',
      )
      .in('variant_id', variantIds)
      .neq('review_status', 'rejected'),
    sb
      .from('dp_qb_question_sources')
      .select(
        'question_id,source_id,review_status,source:dp_content_sources(slug,display_name,short_label,attribution_label,display_order)',
      )
      .in('question_id', questionIds)
      .neq('review_status', 'rejected'),
  ]);
  const questionToVariants = new Map<string, string[]>();
  for (const item of variants) {
    const current = questionToVariants.get(item.questionId) ?? [];
    current.push(item.variantId);
    questionToVariants.set(item.questionId, current);
  }
  const raw = new Map<string, Array<QuestionPublicSource & { order: number }>>();
  const add = (
    variantId: string,
    row: any,
    isVariantSource: boolean,
  ) => {
    const source = one(row.source) as SourceRow | null;
    if (!source) return;
    const current = raw.get(variantId) ?? [];
    current.push({
      slug: source.slug,
      displayName: source.display_name,
      shortLabel: source.short_label,
      attributionLabel: source.attribution_label,
      reviewStatus: row.review_status,
      isVariantSource,
      order: source.display_order,
    });
    raw.set(variantId, current);
  };
  for (const row of (variantRows ?? []) as any[]) add(row.variant_id, row, true);
  for (const row of (questionRows ?? []) as any[]) {
    for (const variantId of questionToVariants.get(row.question_id) ?? []) {
      add(variantId, row, false);
    }
  }
  for (const variantId of variantIds) {
    const seen = new Set<string>();
    const rows = (raw.get(variantId) ?? [])
      .sort(
        (a, b) =>
          Number(b.isVariantSource) - Number(a.isVariantSource) ||
          a.order - b.order,
      )
      .filter((source) => {
        const key = `${source.slug}:${source.isVariantSource}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(({ order: _order, ...source }) => source);
    result.set(variantId, rows);
  }
  return result;
}
