# DP Resources database storage audit — 2026-08-16

## Safety boundary

The production Supabase database was queried read-only for this audit. No
production DDL, DML, VACUUM/REINDEX, statistics reset, configuration change,
branch merge or production deployment was performed.

The implementation is isolated on `audit/free-plan-db-storage-20260816` and
draft PR #269.

## Live baseline

`pg_database_size(current_database())` returned **539,151,507 bytes**
(**514 MiB**). `default_transaction_read_only` was `off` at the time of the
audit.

The public schema accounted for approximately:

- heap: 283,213,824 bytes
- indexes: 215,572,480 bytes
- TOAST: 20,799,488 bytes
- total relations: 519,585,792 bytes

The original relation-size export must not be summed directly because table
relations reported with `pg_total_relation_size` include their indexes while the
same indexes also appear as separate rows.

A reusable SELECT-only snapshot is now checked in at
`scripts/database-storage-audit.sql`.

## Phase 1: physical storage reclaim without deleting data

The migration `20260816141000_free_plan_index_storage_reclaim.sql` removes six
audited non-constraint indexes whose access paths are not needed by the current
runtime, removes one copy from each of two exact duplicate-index pairs, and
reindexes one empty practice-share table with historical index bloat.

Audited major index sizes at the baseline:

| Index | Bytes | Planner evidence / rationale |
| --- | ---: | --- |
| `dp_qb_placements_browse_idx` | 5,046,272 | 0 scans; runtime placement reads filter by `variant_id`, while canonical subtopic mapping uses the separate `(subtopic_id, variant_id)` index. |
| `dp_qb_asset_sources_file_idx` | 2,285,568 | 0 scans; runtime provenance lookup filters by `asset_id` and merely returns `source_file_id`. |
| `dp_resource_index_normalized_name_idx` | 1,925,120 | 0 scans; `dp_search_resources` filters on `search_vector`, not `normalized_name`. |
| `dp_resource_index_path_idx` | 5,054,464 | 3 incidental scans; current runtime search uses `search_vector`, while observed path predicates use `lower(path)` / `split_part(path, ...)`, which this raw B-tree cannot accelerate. |
| `dp_resource_source_assignments_parent_idx` | 1,318,912 | 0 scans; current effective-source and inheritance logic does not locate rows by `inherited_from_drive_file_id`; the identity unique index remains. |
| `dp_qb_asset_optimizations_hash_idx` | 1,286,144 | 0 scans; optimizer fetches/upserts by `asset_id` and does not filter by optimized hash. |
| `dp_resource_activity_user_date_idx` | 90,112 | Exact duplicate of retained `dp_activity_user_created_idx`; duplicate had 0 scans while retained copy had recorded use. |
| `dp_resource_memberships_email_idx` | 16,384 | Exact duplicate of retained `dp_memberships_lower_email_idx`. |

Those eight indexes total **17,022,976 bytes (~16.24 MiB)** at the audit
baseline. Supabase's performance advisor independently reported the zero-scan
major candidates and both duplicate pairs.

`dp_qb_practice_share_items` contained **0 rows** but retained **3,407,872
bytes** of index files. Its three indexes are rebuilt rather than removed. With
an empty table they should return close to their minimum physical size while
preserving all keys and future sharing behavior.

Using the baseline relation sizes, Phase 1 is expected to reclaim roughly
**20.4 MB**, putting the same database at approximately **494.7 MiB** before
subsequent growth. This is an estimate; the authoritative post-migration check
is always `pg_database_size`.

### Explicitly protected indexes

Phase 1 does **not** remove:

- `dp_qb_questions_search_idx`
- `dp_resource_index_search_idx`
- canonical content-hash/storage uniqueness indexes
- primary keys
- Question Bank variant/question lookup indexes
- active source-attribution lookup indexes
- Resource Library parent-folder lookup
- `dp_resource_index_modified_at_idx`, despite zero observed scans, because
  current Resource Library code still orders source pages by `modified_at`
- user progress/saved/practice lookup indexes

## Phase 2A: compact disposable-email domain storage

The migration `20260816143000_compact_disposable_email_domains.sql` is now
implemented on the audit branch.

At the baseline, `dp_resource_email_domain_rules` contained **75,597 rows** and
occupied about **16 MiB**. The audited split was:

- **75,559** creatorless imported blocklist rows from five bulk sources
- **38** protected/manual/migration exception rows retaining meaningful
  per-domain metadata

Logical repeated payload in the original relation included about 4.74 MB of
`reason` strings and 2.20 MB of `source` strings, before tuple/index overhead.
All 75,597 existing rows had `created_by IS NULL`; the bulk import timestamps
were concentrated in a short import window rather than representing moderation
history.

The compact design:

1. stores bulk disposable domains in
   `dp_resource_disposable_email_domains(domain primary key)`;
2. rebuilds the existing application-facing
   `dp_resource_email_domain_rules` table with only exceptional/full-provenance
   rules;
3. keeps the existing admin route and auth RPC names unchanged;
4. refuses to release the old relation unless old count equals compact count,
   the two partitions do not overlap, and a full outer join proves identical
   domain/action policy in both directions;
5. replaces wildcard suffix scanning with exact candidate-domain primary-key
   probes while preserving most-specific parent-domain semantics.

A deterministic read-only comparison against 500 exact/subdomain probes from
production returned **0 policy mismatches**. An attempted exhaustive old-policy
comparison hit the database statement timeout because the historical wildcard
matching shape is expensive; it was stopped rather than increasing production
load.

The exact final physical size cannot be known until the migration is applied,
but the domain-only corpus should materially reduce the roughly 16 MiB original
relation. This is additional headroom beyond Phase 1.

## Phase 2B: move PDF document search payload toward R2

`dp_pdf_preview_pages` was about **26 MiB** for 15,437 rows. Approximately
**16.6 MB of logical column payload** was `search_text`.

The branch now implements a backward-compatible bridge:

1. R2 preview workers best-effort mirror the normalized page text into a private
   per-document object at `pdf-preview-search/<document-id>.json`;
2. the existing PostgreSQL `dp_store_pdf_preview_text` write still happens, so a
   failed mirror cannot make an otherwise successful preview job fail;
3. document search prefers a validated private R2 manifest when present;
4. missing, malformed or unavailable manifests fall back to the existing
   `dp_search_pdf_preview` PostgreSQL RPC;
5. page-specific exact-highlight geometry remains on its existing private
   object-storage path;
6. `scripts/backfill-pdf-search-manifests.mjs` is dry-run by default and requires
   explicit `--write --confirm-production` before it can write R2 objects; write
   mode verifies the uploaded bytes by SHA.

No existing `search_text` rows are removed in this PR. The final database
payload should only be physically removed after every existing searchable R2
preview has a verified manifest and the new read path has been observed in
production. Dropping the column alone is not counted as quota reclaim because
PostgreSQL may retain old physical pages until a controlled table rewrite.

## Phase 3: Question Bank provenance/metadata normalization

Logical JSON payload measured during the audit included approximately:

- `dp_qb_questions.source_metadata`: 11.6 MB
- `dp_qb_question_variants.source_metadata`: 6.8 MB
- `dp_qb_variant_sources.source_metadata`: 9.0 MB
- `dp_qb_question_sources.source_metadata`: 8.1 MB

Every current canonical question has at least one `dp_qb_question_sources` row,
and every current variant has at least one `dp_qb_variant_sources` row. Runtime
database functions do not read the canonical/source `source_metadata` columns.
However, import and audit provenance remains valuable, so this branch does not
strip those fields from production. Future compaction should archive or
normalize repeated importer evidence first, update importers, verify complete
source-row coverage, and only then consider a controlled physical rewrite.

## Advisor review

Supabase performance and security advisors were reviewed read-only. Storage
changes deliberately do not add the many suggested foreign-key indexes because
the immediate constraint is database size and those indexes need query-specific
justification. Security warnings such as server-only RLS tables with no client
policy and intentionally authenticated SECURITY DEFINER RPCs were not blindly
changed. Pre-existing mutable function `search_path` warnings and Auth leaked-
password protection are separate hardening items to verify rather than mix into
this storage migration.

## Deployment gate

Before any part of this branch can be considered for production:

1. CI must pass typecheck, tests, lint, build, client-bundle security scan,
   dependency audit and CodeQL.
2. Run `scripts/database-storage-audit.sql` again and compare against this
   baseline.
3. Capture protected production row counts for Question Bank, Resource Library,
   users, progress, saved questions and source attribution.
4. Apply only the intended migration(s) in a controlled deployment window; do
   not run the PDF backfill write mode as part of the index/email migration.
5. Immediately re-run protected row counts, email-domain policy checks and key
   user flows.
6. Measure `pg_database_size` again; do not infer success from relation sums.
7. Keep PR #269 draft/unmerged until those gates are intentionally satisfied.

No production migration is executed by this audit branch itself.
