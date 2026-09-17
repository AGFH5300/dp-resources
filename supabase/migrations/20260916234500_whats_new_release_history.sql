alter table public.dp_resource_user_settings
  add column if not exists viewed_whats_new_releases jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dp_resource_user_settings_viewed_whats_new_releases_check'
      and conrelid = 'public.dp_resource_user_settings'::regclass
  ) then
    alter table public.dp_resource_user_settings
      add constraint dp_resource_user_settings_viewed_whats_new_releases_check
      check (jsonb_typeof(viewed_whats_new_releases) = 'array');
  end if;
end;
$$;
