import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export type ContentSourceAudit = {
  questionSources: Array<Record<string, unknown>>;
  multiSourceQuestions: number;
  readyVariantsWithoutReviewedSource: number;
  variantSourcesUnderReview: number;
  questionSourcesUnderReview: number;
  coreVariantSourceConflicts: number;
  librarySources: Array<Record<string, unknown>>;
  libraryAssignmentsByMethod: Record<string, number>;
  libraryFilesWithMultipleSources: number;
  resourceTypes: Array<Record<string, unknown>>;
  recentChanges: Array<Record<string, unknown>>;
  auditRefreshedAt?: string;
  auditDirty?: boolean;
};

export async function loadContentSourceAudit(): Promise<ContentSourceAudit> {
  const sb = createSupabaseAdminClient();
  let snapshot = await sb.rpc('dp_admin_content_source_audit_snapshot');
  if (snapshot.error) {
    throw new Error(`Content source audit failed: ${snapshot.error.message}`);
  }

  if ((snapshot.data as ContentSourceAudit | null)?.auditDirty === true) {
    const refresh = await sb.rpc('dp_admin_refresh_content_source_audit');
    if (refresh.error) {
      throw new Error(`Content source audit refresh failed: ${refresh.error.message}`);
    }
    snapshot = await sb.rpc('dp_admin_content_source_audit_snapshot');
    if (snapshot.error) {
      throw new Error(`Content source audit reload failed: ${snapshot.error.message}`);
    }
  }

  return (snapshot.data || {}) as ContentSourceAudit;
}
