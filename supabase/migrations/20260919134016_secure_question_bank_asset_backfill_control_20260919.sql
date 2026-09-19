create table public.dp_qb_remote_asset_backfill_control_20260919 (
  id boolean primary key default true check (id),
  control_key text not null default encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now()
);
alter table public.dp_qb_remote_asset_backfill_control_20260919 enable row level security;
revoke all on table public.dp_qb_remote_asset_backfill_control_20260919 from anon, authenticated;
insert into public.dp_qb_remote_asset_backfill_control_20260919 (id) values (true);
