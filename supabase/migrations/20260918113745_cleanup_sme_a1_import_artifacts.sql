-- The SME A.1 import is complete. Remove import-only RPCs and private
-- matching tables so no temporary ingestion surface remains in production.

drop function if exists public.dp_sme_a1_stage_upsert(jsonb);

drop table if exists private.sme_a1_import_stage_20260917;
drop table if exists private.sme_a1_match_index_20260917;
drop table if exists private.sme_a1_physics_match_index_20260917;
