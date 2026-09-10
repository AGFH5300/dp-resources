-- Direct social sign-in for DP Resources.
--
-- OAuth is handled by DP Resources itself so provider callbacks never need to
-- expose the hosted Supabase project URL. Supabase remains the account/session
-- backend. Only server-side service-role code can read or modify these tables.

begin;

create table if not exists public.dp_resource_social_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft', 'github', 'apple')),
  provider_subject text not null,
  provider_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  constraint dp_resource_social_identities_provider_subject_key
    unique (provider, provider_subject),
  constraint dp_resource_social_identities_user_provider_key
    unique (user_id, provider)
);

create index if not exists dp_resource_social_identities_user_idx
  on public.dp_resource_social_identities (user_id, created_at desc);

alter table public.dp_resource_social_identities enable row level security;
revoke all on public.dp_resource_social_identities from public, anon, authenticated;
grant select, insert, update, delete on public.dp_resource_social_identities to service_role;

create table if not exists public.dp_resource_auth_methods (
  user_id uuid primary key references auth.users(id) on delete cascade,
  password_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dp_resource_auth_methods enable row level security;
revoke all on public.dp_resource_auth_methods from public, anon, authenticated;
grant select, insert, update, delete on public.dp_resource_auth_methods to service_role;

-- Every account that predates this migration came through the existing
-- email/password flow. New social-only accounts are inserted after this
-- migration and remain password_enabled=false until they explicitly set one.
insert into public.dp_resource_auth_methods (user_id, password_enabled)
select id, true
from auth.users
on conflict (user_id) do nothing;

commit;
