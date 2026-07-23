-- Review later duplicated saved questions in the product. Preserve every
-- existing review choice as a saved question before retiring that UI.
insert into public.dp_qb_user_saved_questions (
  user_id,
  question_id,
  last_variant_id,
  created_at
)
select
  progress.user_id,
  progress.question_id,
  progress.last_variant_id,
  coalesce(progress.first_viewed_at, progress.updated_at, now())
from public.dp_qb_user_progress progress
where progress.to_revisit
on conflict (user_id, question_id) do update
set last_variant_id = coalesce(
  excluded.last_variant_id,
  dp_qb_user_saved_questions.last_variant_id
);

update public.dp_qb_user_progress
set
  to_revisit = false,
  updated_at = now()
where to_revisit;
