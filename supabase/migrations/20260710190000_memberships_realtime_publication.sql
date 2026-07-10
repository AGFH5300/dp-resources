-- Publish only membership updates to Supabase Realtime so authenticated clients can
-- react when their own access is suspended. Disposable-domain and moderation-event
-- tables intentionally stay private to avoid exposing administrative policy/audit data.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dp_resource_memberships'
  ) then
    alter publication supabase_realtime add table public.dp_resource_memberships;
  end if;
end $$;
