# Content source attribution rollout and rollback

This feature adds one canonical source registry used by the Question Bank and Resource Library. It preserves the existing Question Bank core/variant deduplication model and treats Google Drive as immutable content storage: Library source/type organization is metadata and virtual browsing only.

## Production rollout

Apply the additive migrations in timestamp order, verify the pre-change protected counts, run the idempotent provenance/resource backfills, then deploy the application. After deployment, compare the protected counts in `audits/content-source-attribution-baseline-20260806.json` and `audits/content-source-attribution-post-20260806.json` and run the source/RLS smoke tests.

The current production evidence does not establish the legacy authorized Question Bank archive as Revision Town. Those legacy relations deliberately use the `unknown` registry source and render as “Source attribution under review”. Revision Town is present in the reusable registry but has no production assignment.

The current `dp_resource_index` contains no reviewed provider-bearing path evidence for Save My Exams, Revision Village, RevisionDojo, Kognity, Exam-Mate, PESTLE, or Revision Town. Library items therefore start in explicit review-needed source state. Only high-confidence filename/MIME resource-type rules are applied automatically.

## Rollback

Rollback never operates on Drive or Question Bank content.

1. Revert the application commit to disable source badges, filters, admin surfaces and `/library/sources` routes. Existing Drive IDs, links, favorites, history, previews and Question Bank queues continue to work.
2. Leave the additive registry, assignment and type tables dormant. This is the safest database rollback because old application versions ignore them.
3. If the metadata backfill itself must be reversed, delete only `dp_resource_source_assignments` and `dp_resource_type_assignments` rows carrying `backfill_version = 'content_sources_v1'`. Do not delete `dp_resource_index` rows.
4. For Question Bank provenance rollback, delete only backfill-created PESTLE/legacy rows whose `source_metadata->>'backfillVersion' = 'content_sources_v1'` and whose assignment method is the feature backfill method. Existing Exam-Mate and Revision Village provenance rows predate the feature and must not be deleted. Their nullable canonical `source_id` values may simply remain unused by the old app.
5. The post-verification cleanup migration is already idempotent and removes only feature-created unknown variant-source rows that incorrectly overlapped later explicit providers. Do not attempt to recreate those rows during rollback.
6. Do not drop Question Bank questions, variants, assets, asset associations, solution-video associations, practice/session state, progress, saved-question state, or any storage object.
7. Do not move, rename, copy, replace or delete any Google Drive file or folder.

If schema removal is required after the application has been rolled back, it can be handled in a separate reviewed migration. Prefer leaving the additive registry/assignment tables dormant so audit evidence and manual corrections are preserved.

## Security model

All new public tables have RLS. Safe authenticated reads go through column-restricted grants/RLS or safe RPCs. The browser never receives source website URLs, assignment creators, internal batch/source paths, R2 keys, signed URLs, or archive paths. Admin mutations run through same-origin server routes, existing admin authorization, service-role RPC access, pinned empty `search_path`, and an attribution audit log.

## Known performance observations

Production `EXPLAIN ANALYZE` measurements are recorded in the post-change audit JSON. Source-aware course listing and Practice Builder candidate selection are around 0.4 seconds in the shared production database. The pre-existing global Question Bank search path is slow even without source filtering (about 9.4 seconds for the measured query); the source-filtered equivalent is about 11.6 seconds after reducing repeated provenance probes. The full admin attribution audit is also about 9.7 seconds. These are disclosed performance risks and should be optimized independently without changing source semantics.
