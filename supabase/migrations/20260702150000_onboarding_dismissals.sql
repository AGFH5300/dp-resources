create table if not exists public.dp_resource_onboarding_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.dp_resource_onboarding_dismissals enable row level security;

drop policy if exists "onboarding users read own dismissals" on public.dp_resource_onboarding_dismissals;
create policy "onboarding users read own dismissals" on public.dp_resource_onboarding_dismissals
  for select to authenticated using (auth.uid() = user_id or public.dp_resources_is_admin());

drop policy if exists "onboarding users insert own dismissals" on public.dp_resource_onboarding_dismissals;
create policy "onboarding users insert own dismissals" on public.dp_resource_onboarding_dismissals
  for insert to authenticated with check (auth.uid() = user_id);
