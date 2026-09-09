alter table public.dp_resource_profiles
  add column if not exists avatar_path text,
  add column if not exists academic_subjects jsonb not null default '[]'::jsonb,
  add column if not exists exam_year smallint,
  add column if not exists exam_session text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dp_resource_profiles_exam_year_check'
      and conrelid = 'public.dp_resource_profiles'::regclass
  ) then
    alter table public.dp_resource_profiles
      add constraint dp_resource_profiles_exam_year_check
      check (exam_year is null or exam_year between 2000 and 2100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'dp_resource_profiles_exam_session_check'
      and conrelid = 'public.dp_resource_profiles'::regclass
  ) then
    alter table public.dp_resource_profiles
      add constraint dp_resource_profiles_exam_session_check
      check (exam_session is null or exam_session in ('May', 'November'));
  end if;
end;
$$;

create table if not exists public.dp_resource_user_settings (
  id uuid primary key references auth.users(id) on delete cascade,
  show_library_source_tags boolean not null default true,
  show_library_resource_type_labels boolean not null default true,
  show_question_bank_source_tags boolean not null default true,
  show_expanded_source_attribution boolean not null default true,
  support_notifications boolean not null default true,
  show_whats_new boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.dp_resource_user_settings_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'dp_resource_user_settings_set_updated_at'
      and tgrelid = 'public.dp_resource_user_settings'::regclass
  ) then
    create trigger dp_resource_user_settings_set_updated_at
      before update on public.dp_resource_user_settings
      for each row execute function public.dp_resource_user_settings_set_updated_at();
  end if;
end;
$$;

revoke execute on function public.dp_resource_user_settings_set_updated_at()
  from public, anon, authenticated;

alter table public.dp_resource_user_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'dp_resource_user_settings'
      and policyname = 'dp resources users read own settings'
  ) then
    create policy "dp resources users read own settings"
      on public.dp_resource_user_settings
      for select to authenticated
      using (auth.uid() = id or public.dp_resources_is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'dp_resource_user_settings'
      and policyname = 'dp resources users insert own settings'
  ) then
    create policy "dp resources users insert own settings"
      on public.dp_resource_user_settings
      for insert to authenticated
      with check (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'dp_resource_user_settings'
      and policyname = 'dp resources users update own settings'
  ) then
    create policy "dp resources users update own settings"
      on public.dp_resource_user_settings
      for update to authenticated
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;
end;
$$;

create or replace function public.dp_resources_sync_auth_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.dp_resource_profiles
      set email = new.email
      where id = new.id;
    update public.dp_resource_memberships
      set email = new.email
      where id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.dp_resources_sync_auth_email()
  from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'dp_resources_sync_auth_email'
      and tgrelid = 'auth.users'::regclass
  ) then
    create trigger dp_resources_sync_auth_email
      after update of email on auth.users
      for each row execute function public.dp_resources_sync_auth_email();
  end if;
end;
$$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'dp-resource-avatars',
  'dp-resource-avatars',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
