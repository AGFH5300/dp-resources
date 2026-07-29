-- Store verified, delivery-optimized variants without changing canonical source
-- asset identities or importer provenance. The authenticated asset proxy may serve
-- a verified optimization while the original R2 object remains available for
-- rollback until an explicit cleanup operation removes it.

create table if not exists public.dp_qb_asset_optimizations (
  asset_id uuid primary key references public.dp_qb_assets(id) on delete cascade,
  source_content_hash text not null,
  optimized_content_hash text not null,
  content_type text not null check (content_type like 'image/%'),
  file_extension text not null,
  byte_size bigint not null check (byte_size >= 0),
  storage_provider text not null default 'r2' check (storage_provider = 'r2'),
  storage_bucket text not null,
  storage_key text not null,
  optimization_version text not null,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'failed')),
  verified_at timestamptz,
  source_object_deleted_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dp_qb_asset_optimizations_hash_idx
  on public.dp_qb_asset_optimizations (optimized_content_hash);

create index if not exists dp_qb_asset_optimizations_cleanup_idx
  on public.dp_qb_asset_optimizations (verification_status, source_object_deleted_at);

alter table public.dp_qb_asset_optimizations enable row level security;

revoke all on table public.dp_qb_asset_optimizations from anon, authenticated;
grant all on table public.dp_qb_asset_optimizations to service_role;

comment on table public.dp_qb_asset_optimizations is
  'Verified delivery-optimized R2 variants for canonical question-bank assets. Canonical dp_qb_assets rows and source checksums remain unchanged.';

comment on column public.dp_qb_asset_optimizations.source_object_deleted_at is
  'Set only by the explicit post-rollout cleanup mode after the optimized object is verified and serving successfully.';
