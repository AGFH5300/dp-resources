-- DP Resources read-only database storage audit.
-- Safe to run against production: SELECT statements only.

select
  pg_database_size(current_database()) as database_bytes,
  pg_size_pretty(pg_database_size(current_database())) as database_size,
  current_setting('default_transaction_read_only') as default_transaction_read_only,
  pg_postmaster_start_time() as postmaster_started_at,
  current_timestamp as checked_at;

select
  n.nspname as schema_name,
  sum(pg_relation_size(c.oid))::bigint as heap_bytes,
  sum(pg_indexes_size(c.oid))::bigint as index_bytes,
  sum(pg_total_relation_size(c.oid) - pg_relation_size(c.oid) - pg_indexes_size(c.oid))::bigint as toast_bytes,
  sum(pg_total_relation_size(c.oid))::bigint as total_bytes
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
group by n.nspname
order by total_bytes desc;

select
  n.nspname as schema_name,
  c.relname as table_name,
  pg_total_relation_size(c.oid) as total_bytes,
  pg_relation_size(c.oid) as heap_bytes,
  pg_indexes_size(c.oid) as index_bytes,
  pg_total_relation_size(c.oid) - pg_relation_size(c.oid) - pg_indexes_size(c.oid) as toast_bytes,
  coalesce(s.n_live_tup, 0) as estimated_live_rows,
  coalesce(s.n_dead_tup, 0) as estimated_dead_rows
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_stat_user_tables s on s.relid = c.oid
where c.relkind = 'r'
  and n.nspname in ('public', 'auth', 'storage', 'realtime')
order by total_bytes desc
limit 60;

select
  ui.schemaname,
  ui.relname as table_name,
  ui.indexrelname as index_name,
  pg_relation_size(ui.indexrelid) as index_bytes,
  ui.idx_scan,
  coalesce(pc.contype::text, '') as constraint_type,
  coalesce(pc.conname, '') as constraint_name,
  pg_get_indexdef(ui.indexrelid) as definition
from pg_stat_user_indexes ui
left join pg_constraint pc on pc.conindid = ui.indexrelid
where pg_relation_size(ui.indexrelid) >= 1024 * 1024
order by index_bytes desc;

select
  c.relname as table_name,
  count(*) filter (where pc.oid is null) as non_constraint_indexes,
  sum(pg_relation_size(i.indexrelid)) filter (where pc.oid is null)::bigint
    as non_constraint_index_bytes
from pg_index i
join pg_class c on c.oid = i.indrelid
join pg_namespace n on n.oid = c.relnamespace
left join pg_constraint pc on pc.conindid = i.indexrelid
where n.nspname = 'public'
group by c.relname
order by non_constraint_index_bytes desc nulls last;

-- Empty tables can still retain historical physical index pages.
select
  c.relname as table_name,
  pg_relation_size(c.oid) as heap_bytes,
  pg_indexes_size(c.oid) as index_bytes,
  pg_total_relation_size(c.oid) as total_bytes
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not exists (
    select 1
    from pg_stat_user_tables s
    where s.relid = c.oid
      and coalesce(s.n_live_tup, 0) > 0
  )
  and pg_total_relation_size(c.oid) >= 1024 * 1024
order by total_bytes desc;
