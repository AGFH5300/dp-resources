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
  with course_variants as (
    select
      nullif(btrim(variant.difficulty_label), '') as difficulty,
      nullif(btrim(variant.section_normalized), '') as section,
      variant.calculator_allowed
    from public.dp_qb_question_variants variant
    where variant.course_id = p_course_id
  ),
  difficulty_values as (
    select distinct
      course_variants.difficulty,
      case lower(course_variants.difficulty)
        when 'easy' then 1
        when 'medium' then 2
        when 'hard' then 3
        else 99
      end as sort_order
    from course_variants
    where course_variants.difficulty is not null
  ),
  section_values as (
    select distinct course_variants.section
    from course_variants
    where course_variants.section is not null
  ),
  calculator_value_options as (
    select distinct course_variants.calculator_allowed
    from course_variants
    where course_variants.calculator_allowed is not null
  )
  select
    coalesce(
      (
        select array_agg(
          difficulty_values.difficulty
          order by difficulty_values.sort_order, difficulty_values.difficulty
        )
        from difficulty_values
      ),
      array[]::text[]
    ) as difficulties,
    coalesce(
      (
        select array_agg(section_values.section order by section_values.section)
        from section_values
      ),
      array[]::text[]
    ) as sections,
    coalesce(
      (
        select array_agg(
          calculator_value_options.calculator_allowed
          order by calculator_value_options.calculator_allowed
        )
        from calculator_value_options
      ),
      array[]::boolean[]
    ) as calculator_values;
end;
$$;

revoke all on function public.dp_qb_course_filter_options(uuid) from public;
revoke all on function public.dp_qb_course_filter_options(uuid) from anon;
grant execute on function public.dp_qb_course_filter_options(uuid)
  to authenticated, service_role;
