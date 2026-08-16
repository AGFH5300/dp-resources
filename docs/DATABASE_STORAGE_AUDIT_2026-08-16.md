# DP Resources database storage audit — 2026-08-16

## Safety boundary

The production Supabase database was queried read-only for this audit. No
production DDL, DML, VACUUM/REINDEX, statistics reset, configuration change,
branch merge or production deployment was performed.

The implementation is isolated on `audit/free-plan-db-storage-20260816`.

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

## Phase 1: physical storage reclaim without deleting data

The migration `20260816141000_free_plan_index_storage_reclaim.sql` removes six
non-constraint indexes whose access paths are not used by the current runtime
shape, and reindexes one empty practice-share table with historical index bloat.

Audited index sizes at the baseline:

| Index | Bytes | Planner evidence / rationale |
| --- | ---: | --- |
| `dp_qb_placements_browse_idx` | 5,046,272 | 0 scans; runtime placement reads filter by `variant_id`, while canonical subtopic mapping uses the separate `(subtopic_id, variant_id)` index. |
| `dp_qb_asset_sources_file_idx` | 2,285,568 | 0 scans; runtime provenance lookup filters by `asset_id` and merely returns `source_file_id`. |
| `dp_resource_index_normalized_name_idx` | 1,925,120 | 0 scans; `dp_search_resources` filters on `search_vector`, not `normalized_name`. |
| `dp_resource_index_path_idx` | 5,054,464 | 3 incidental scans; current runtime search uses `search_vector`, while observed path predicates use `lower(path)` / `split_part(path, ...)`, which this raw B-tree cannot accelerate. |
| `dp_resource_source_assignments_parent_idx` | 1,318,912 | 0 scans; current effective-source and inheritance logic does not locate rows by `inherited_from_drive_file_id`; the identity unique index remains. |
| `dp_qb_asset_optimizations_hash_idx` | 1,286,144 | 0 scans; optimizer fetches/upserts by `asset_id` and does not filter by optimized hash. |

Those six indexes total **16,916,480 bytes (16.13 MiB)** at the audit baseline.

`dp_qb_practice_share_items` contained **0 rows** but retained **3,407,872
bytes** of index files. Its three indexes are rebuilt rather than removed. With
an empty table they should return close to their minimum physical size while
preserving all keys and future sharing behavior.

Using the baseline relation sizes, Phase 1 is expected to reclaim roughly
**19.3 MiB**, putting the same database at approximately **494.8 MiB** before
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
- user progress/saved/practice lookup indexes

## Phase 2: prevent the database from growing back

### PDF preview search payload

`dp_pdf_preview_pages` was about **26 MiB** for 15,437 rows. Approximately
**16.6 MB of logical column payload** was `search_text`.

The PDF system already stores per-page exact search geometry beside private
preview derivatives. The desired end state is:

1. write a compact per-document text-search manifest to the same private object
   storage target as the preview derivatives;
2. make the document-search API read that manifest, with the current database
   RPC retained temporarily as a fallback;
3. backfill and verify every current preview document;
4. only after coverage is complete, stop writing `search_text` to PostgreSQL;
5. remove/rebuild the old database payload during a separately controlled
   maintenance step.

Dropping the column alone is not treated as quota reclaim because PostgreSQL may
retain the physical relation pages until a rewrite/repack operation.

### Disposable-email domain rules

`dp_resource_email_domain_rules` contained **75,597 rows** and occupied about
**16 MiB**. Most rows repeat a handful of identical `reason` and `source`
strings. The active authentication policy only needs the domain match and allow
/ block decision; detailed provenance can be normalized into a tiny source
catalog instead of repeated tens of thousands of times.

This should be implemented as a backward-compatible schema/application rollout
before physically rebuilding the table. A direct in-place text cleanup is not
counted as immediate quota reclaim because it does not guarantee the underlying
relation file shrinks.

### Question Bank importer/provenance metadata

Logical JSON payload measured during the audit included approximately:

- `dp_qb_questions.source_metadata`: 11.6 MB
- `dp_qb_question_variants.source_metadata`: 6.8 MB
- `dp_qb_variant_sources.source_metadata`: 9.0 MB
- `dp_qb_question_sources.source_metadata`: 8.1 MB

The runtime database functions do not read those `source_metadata` columns.
However, they remain important import/audit provenance, so no production data is
deleted in Phase 1. The next safe step is to prove source-row coverage per
canonical question/variant and then move repeated import evidence into compact
batch/source-level records or an immutable archive while retaining the canonical
source IDs and review state needed at runtime.

## Deployment gate

Before this branch can be considered for production:

1. CI must pass typecheck, tests, lint, build, client-bundle security scan and
   dependency audit.
2. The migration must be reviewed against a fresh read-only size/index snapshot.
3. Production row counts for Question Bank, Resource Library, users, progress,
   saved questions and source attribution must be captured before deployment.
4. Apply the migration only in a controlled deployment window.
5. Immediately verify those protected row counts and the key user flows.
6. Measure `pg_database_size` again; do not infer success from relation sums.

No production migration is executed by this audit branch itself.
