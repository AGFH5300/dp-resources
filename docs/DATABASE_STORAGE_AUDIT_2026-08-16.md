# DP Resources database storage audit — 2026-08-16

## Current production status

The initial audit was read-only. After explicit owner approval on 2026-08-16,
the two guarded storage migrations were applied to the production Supabase
project with protected row-count and policy verification before/after each step.

Production database size changed from a pre-migration snapshot of
**539,192,467 bytes** to **510,127,251 bytes** after both migrations, while the
protected application row counts remained unchanged.

The implementation branch remains `audit/free-plan-db-storage-20260816` / PR
#269 until the backward-compatible PDF/R2 application bridge is merged and
verified.

A reusable SELECT-only snapshot is checked in at
`scripts/database-storage-audit.sql`.

## Protected pre-migration baseline

Captured immediately before production DDL:

- memberships: **49**
- Resource Library index rows: **16,945**
- Resource Library source assignments: **34,571**
- canonical Question Bank questions: **30,846**
- Question Bank variants: **42,695**
- Question Bank assets: **42,532**
- Question Bank question-source rows: **32,263**
- Question Bank variant-source rows: **43,069**
- email-domain rules: **75,597**
- PDF preview documents: **36**
- PDF preview pages: **15,437**
- practice-share items: **0**

These protected counts were unchanged after both storage migrations.

## Phase 1: physical storage reclaim without deleting data — APPLIED

Production migration version:
`20260816165508_free_plan_index_storage_reclaim.sql`.

The migration removed six audited non-constraint indexes whose access paths were
not needed by the current runtime, removed one copy from each of two exact
duplicate-index pairs, and reindexed the empty practice-share table with
historical index bloat.

Major audited indexes removed:

| Index | Baseline bytes | Rationale |
| --- | ---: | --- |
| `dp_qb_placements_browse_idx` | 5,046,272 | 0 scans; runtime placement reads are keyed differently. |
| `dp_qb_asset_sources_file_idx` | 2,285,568 | 0 scans; runtime provenance lookup filters by `asset_id`. |
| `dp_resource_index_normalized_name_idx` | 1,925,120 | 0 scans; Resource Library search uses `search_vector`. |
| `dp_resource_index_path_idx` | 5,054,464 | Raw B-tree does not accelerate the observed `lower(path)` / search-vector shapes. |
| `dp_resource_source_assignments_parent_idx` | 1,318,912 | 0 scans; current effective-source/inheritance runtime does not locate rows through it. |
| `dp_qb_asset_optimizations_hash_idx` | 1,286,144 | 0 scans; optimizer lookup is by `asset_id`. |
| `dp_resource_activity_user_date_idx` | 90,112 | Exact duplicate of retained `dp_activity_user_created_idx`. |
| `dp_resource_memberships_email_idx` | 16,384 | Exact duplicate of retained `dp_memberships_lower_email_idx`. |

`dp_qb_practice_share_items` had **0 rows** but retained approximately **3.4
MB** of historical index allocation. Its indexes were rebuilt rather than the
feature being removed.

The migration was fully transactional with bounded lock/statement timeouts.
Immediately afterward:

- all eight targeted indexes were absent;
- all protected row counts were unchanged;
- database size fell from **539,192,467** to **518,737,043 bytes**;
- physical reclaim was **20,455,424 bytes**.

### Explicitly retained indexes

The migration did not remove the Question Bank or Resource Library GIN search
indexes, uniqueness/content-hash constraints, primary keys, active
source-attribution lookup indexes, user progress/saved/practice indexes, or
`dp_resource_index_modified_at_idx`.

## Phase 2A: compact disposable-email domain storage — APPLIED

Production migration version:
`20260816165554_compact_disposable_email_domains.sql`.

Before migration the single rule table contained **75,597** rows:

- **75,559** creatorless imported bulk blocklist domains;
- **38** protected/manual/migration exception rows.

The pre-migration effective rule fingerprint was:
`a7188a877c4cb0d19d132e4d2b84683c`.

The migration:

1. moved the 75,559 imported bulk blocks into
   `dp_resource_disposable_email_domains(domain primary key)`;
2. retained the existing application-facing
   `dp_resource_email_domain_rules` table name for the 38 full-provenance rules;
3. preserved the historical constraint names and admin-write contract;
4. replaced wildcard suffix scanning with indexed equality probes over exact and
   parent-domain candidates;
5. locked source-table mutations during the verified copy/swap while allowing
   normal reads;
6. refused to commit unless the partitions were non-overlapping and the complete
   effective domain/action set matched;
7. notified PostgREST to reload schema only after successful transaction commit.

After migration:

- compact full-provenance rules: **38**
- bulk domain-only rules: **75,559**
- total effective rules: **75,597**
- allows: **37**
- blocks: **75,560**
- post-migration fingerprint:
  `a7188a877c4cb0d19d132e4d2b84683c` — exact match
- protected application row counts remained unchanged
- database size fell from **518,737,043** to **510,127,251 bytes**

## Phase 2B: move PDF document search payload toward R2 — APPLICATION BRIDGE READY

`dp_pdf_preview_pages` contains **15,437** rows and approximately **16.58 MB** of
logical `search_text` payload. The current production split is:

- R2-backed searchable pages: **14,739**
- Supabase-storage searchable pages: **698**
- R2-backed `search_text` logical payload: approximately **15.34 MB**

The branch implements a backward-compatible bridge:

1. R2 preview workers best-effort mirror normalized page text into private
   `pdf-preview-search/<document-id>.json` manifests;
2. the existing PostgreSQL `dp_store_pdf_preview_text` write remains active;
3. document search prefers a validated R2 manifest;
4. missing, malformed or unavailable R2 manifests fall back to the current
   `dp_search_pdf_preview` PostgreSQL RPC;
5. page-specific exact-highlight geometry is unchanged;
6. `scripts/backfill-pdf-search-manifests.mjs` is dry-run by default and write
   mode requires explicit `--write --confirm-production`, with SHA verification
   of uploaded content.

The PostgreSQL `search_text` payload must not be removed until all existing R2
searchable documents have verified manifests and the deployed live API has been
confirmed to serve search through the R2 path with PostgreSQL fallback working.

## Phase 3: Question Bank provenance/metadata normalization — DEFERRED FOR SAFETY

Logical JSON payload measured during the audit included approximately:

- `dp_qb_questions.source_metadata`: 11.6 MB
- `dp_qb_question_variants.source_metadata`: 6.8 MB
- `dp_qb_variant_sources.source_metadata`: 9.0 MB
- `dp_qb_question_sources.source_metadata`: 8.1 MB

Every current canonical question has at least one question-source row and every
current variant has at least one variant-source row. Runtime database functions
do not read the canonical/source `source_metadata` columns, but the metadata is
valuable import/audit provenance. It is therefore not deleted merely to reduce
quota. Any future compaction should first normalize/archive repeated importer
evidence, update importers, verify source-row coverage, then perform a separately
controlled physical rewrite.

## Advisor review

Supabase performance and security advisors were reviewed. Storage work did not
blindly add suggested foreign-key indexes because the immediate constraint is
size and every additional index requires query-specific justification. Likewise,
server-only RLS/no-policy tables and deliberately authenticated SECURITY DEFINER
RPCs were not changed without proving a security bug. Mutable function
`search_path` warnings and Auth leaked-password protection remain separate
hardening items rather than being mixed into this storage migration.

## Remaining production gates

1. Keep the GitHub migration filenames exactly aligned to the live Supabase
   migration versions above.
2. Require CI to pass typecheck, tests, lint, production build, client-bundle
   security scan, dependency audit and CodeQL on the final branch head.
3. Merge/deploy the backward-compatible PDF/R2 bridge.
4. Verify production health and the protected baseline counts after deployment.
5. Backfill R2 search manifests and verify object coverage/checksums.
6. Exercise live PDF document search and confirm both R2-manifest and PostgreSQL
   fallback paths.
7. Only then design/apply the physical PostgreSQL `search_text` reclaim.
8. Re-run the storage audit and Supabase security/performance advisors after the
   final database change.
