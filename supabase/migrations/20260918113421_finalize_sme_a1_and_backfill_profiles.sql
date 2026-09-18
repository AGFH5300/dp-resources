-- Finalize the audited Save My Exams Physics A.1 import and repair legacy
-- member profiles that can be recovered unambiguously from Supabase Auth.

insert into public.dp_resource_profiles (
  id,
  username,
  full_name,
  email,
  created_at,
  updated_at
)
select
  u.id,
  btrim(u.raw_user_meta_data->>'username'),
  btrim(u.raw_user_meta_data->>'full_name'),
  m.email,
  coalesce(u.created_at, m.created_at, now()),
  now()
from auth.users u
join public.dp_resource_memberships m on m.id = u.id
left join public.dp_resource_profiles existing on existing.id = u.id
where existing.id is null
  and nullif(btrim(coalesce(u.raw_user_meta_data->>'username', '')), '') is not null
  and nullif(btrim(coalesce(u.raw_user_meta_data->>'full_name', '')), '') is not null
  and not exists (
    select 1
    from public.dp_resource_profiles conflict
    where lower(conflict.username) = lower(btrim(u.raw_user_meta_data->>'username'))
  )
  and not exists (
    select 1
    from public.dp_resource_profiles conflict
    where lower(conflict.email) = lower(m.email)
  )
on conflict do nothing;

update public.dp_qb_questions
set maximum_mark = 1,
    updated_at = now()
where reference = '17N.1.SL.TZ0.5'
  and maximum_mark = 0;

drop table if exists public.dp_qb_sme_a1_asset_stage_20260918;
drop table if exists public.dp_qb_sme_a1_stage_20260917;
