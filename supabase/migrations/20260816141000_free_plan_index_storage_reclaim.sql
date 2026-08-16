-- Reclaim PostgreSQL relation storage without deleting application data.
--
-- Production audit on 2026-08-16 found the database at 539,151,507 bytes.
-- These indexes are not constraints and had either zero planner scans since the
-- current PostgreSQL postmaster start, were exact duplicates of a retained
-- index, or only served non-runtime/audit ordering shapes.
-- Critical Question Bank/Library search, uniqueness, primary-key and active
-- filter indexes are intentionally retained.
--
-- The practice share item table was empty during the audit but retained about
-- 3.25 MiB of historical B-tree pages. REINDEX preserves the sharing schema and
-- constraints while rebuilding those indexes compactly.

set lock_timeout = '5s';
set statement_timeout = '120s';

-- Obsolete Question Bank browse shape. Runtime placement reads are keyed by
-- variant_id; canonical subtopic mapping uses the separate subtopic/variant
-- index. This index starts with subtopic_id and has recorded no planner scans.
drop index if exists public.dp_qb_placements_browse_idx;

-- Runtime asset provenance reads select source_file_id after locating rows by
-- asset_id. No live query filters by source_file_id and this index recorded no
-- planner scans.
drop index if exists public.dp_qb_asset_sources_file_idx;

-- Resource search is served by dp_resource_index_search_idx/search_vector.
-- normalized_name remains a stored/displayed field but is not a runtime filter.
drop index if exists public.dp_resource_index_normalized_name_idx;

-- Resource path predicates in the application/audit history use lower(path),
-- split_part(path, ...) or search_vector. The raw path B-tree does not support
-- those expressions and recorded only incidental planner scans.
drop index if exists public.dp_resource_index_path_idx;

-- inherited_from_drive_file_id remains part of provenance and identity, but the
-- current effective-source view and inheritance resolver do not look rows up by
-- this column. The identity unique index remains in place.
drop index if exists public.dp_resource_source_assignments_parent_idx;

-- The asset optimizer reads optimization rows by asset_id and never filters by
-- optimized_content_hash. The canonical optimization primary key is retained.
drop index if exists public.dp_qb_asset_optimizations_hash_idx;

-- Exact duplicate of dp_activity_user_created_idx. Keep the copy with recorded
-- planner use and remove the zero-scan duplicate.
drop index if exists public.dp_resource_activity_user_date_idx;

-- Exact duplicate of dp_memberships_lower_email_idx. Keep one lower(email)
-- lookup path while removing the redundant physical B-tree.
drop index if exists public.dp_resource_memberships_email_idx;

-- Pure bloat reclaim: rebuild all indexes on this table without changing rows,
-- keys, constraints, RLS or the practice-sharing API.
reindex table public.dp_qb_practice_share_items;
