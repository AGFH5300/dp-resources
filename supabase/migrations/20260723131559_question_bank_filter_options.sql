create or replace function public.dp_qb_course_filter_options(p_course_id uuid)
returns table (
  difficulties text[],
  sections text[],
  calculator_values boolean[]
)
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
    coalesce(
      array_agg(distinct variant.difficulty_label order by variant.difficulty_label)
        filter (
          where nullif(btrim(variant.difficulty_label), '') is not null
        ),
      array[]::text[]
    ) as difficulties,
    coalesce(
      array_agg(distinct variant.section_normalized order by variant.section_normalized)
        filter (
          where nullif(btrim(variant.section_normalized), '') is not null
        ),
      array[]::text[]
    ) as sections,
    coalesce(
      array_agg(distinct variant.calculator_allowed order by variant.calculator_allowed)
        filter (where variant.calculator_allowed is not null),
      array[]::boolean[]
    ) as calculator_values
  from public.dp_qb_question_variants variant
  where variant.course_id = p_course_id;
end;
$$;

revoke all on function public.dp_qb_course_filter_options(uuid) from public;
revoke all on function public.dp_qb_course_filter_options(uuid) from anon;
grant execute on function public.dp_qb_course_filter_options(uuid)
  to authenticated, service_role;
