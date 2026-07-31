-- Correct Mathematics syllabus metadata and expose the real number of
-- user-visible question variants per course for the Question Bank landing page.

with course_labels(slug, syllabus_label) as (
  values
    ('analysis-and-approaches-sl', 'Current syllabus'),
    ('applications-and-interpretation-sl', 'Current syllabus'),
    ('analysis-and-approaches-hl', 'Current syllabus'),
    ('applications-and-interpretation-hl', 'Current syllabus'),
    ('further-mathematics-sl', 'Legacy syllabus · final assessment 2013'),
    ('mathematical-studies-sl', 'Legacy syllabus · final assessment 2019'),
    ('mathematics-sl', 'Legacy syllabus · final assessment 2019'),
    ('further-mathematics-hl', 'Legacy syllabus · final assessment 2019'),
    ('mathematics-hl', 'Legacy syllabus · final assessment 2019')
)
update public.dp_qb_courses course
set syllabus_label = course_labels.syllabus_label,
    updated_at = now()
from course_labels
where course.subject_id = 'math'
  and course.slug = course_labels.slug
  and course.syllabus_label is distinct from course_labels.syllabus_label;

create or replace function public.dp_qb_course_question_counts()
returns table(course_id uuid, question_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.dp_qb_has_access() then
    raise exception 'Question bank access denied' using errcode = '42501';
  end if;

  return query
  select
    variant.course_id,
    count(*)::bigint as question_count
  from public.dp_qb_question_variants variant
  where variant.render_status = 'ready'
  group by variant.course_id;
end;
$$;

revoke all on function public.dp_qb_course_question_counts() from public;
grant execute on function public.dp_qb_course_question_counts() to authenticated;

comment on function public.dp_qb_course_question_counts() is
  'Returns the actual count of render-ready Question Bank variants per course for eligible authenticated members.';
