-- Admin-only aliases live in a separate, service-role-only table so they can
-- never leak through member/profile APIs. Also extend the existing admin
-- activity stream to include Question Bank question opens.

create table if not exists public.dp_admin_user_aliases (
  user_id uuid primary key references auth.users(id) on delete cascade,
  alias text not null check (char_length(btrim(alias)) between 1 and 80),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.dp_admin_user_aliases enable row level security;
revoke all on table public.dp_admin_user_aliases from public, anon, authenticated;
grant select, insert, update, delete on table public.dp_admin_user_aliases to service_role;

alter table public.dp_resource_activity_logs
  drop constraint if exists dp_resource_activity_logs_action_check;

alter table public.dp_resource_activity_logs
  add constraint dp_resource_activity_logs_action_check
  check (action in (
    'folder_opened',
    'file_opened',
    'download_started',
    'question_opened'
  ));

-- Seed one useful historical activity event for each Question Bank question a
-- member has already viewed. The progress table only stores first/last view,
-- not every historical open, so this intentionally backfills the latest view.
insert into public.dp_resource_activity_logs (
  user_id,
  user_email,
  file_id,
  file_name,
  action,
  created_at,
  ip_address,
  user_agent
)
select
  progress.user_id,
  membership.email,
  progress.last_variant_id::text,
  concat_ws(' · ', course.name, question.reference),
  'question_opened',
  progress.last_viewed_at,
  null,
  'dp-question-bank-backfill'
from public.dp_qb_user_progress progress
join public.dp_resource_memberships membership
  on membership.id = progress.user_id
join public.dp_qb_question_variants variant
  on variant.id = progress.last_variant_id
join public.dp_qb_questions question
  on question.id = variant.question_id
join public.dp_qb_courses course
  on course.id = variant.course_id
where progress.last_viewed_at is not null
  and progress.last_variant_id is not null
  and not exists (
    select 1
    from public.dp_resource_activity_logs existing
    where existing.user_id = progress.user_id
      and existing.action = 'question_opened'
      and existing.file_id = progress.last_variant_id::text
      and existing.created_at = progress.last_viewed_at
  );
