do $migration$
declare
  definition text;
  old_fragment text;
begin
  definition := pg_get_functiondef(
    'public.dp_qb_search_questions(text,integer,integer)'::regprocedure
  );

  old_fragment := 'topic.name,';
  if position(old_fragment in definition) = 0 then
    raise exception 'Unexpected dp_qb_search_questions topic projection';
  end if;
  definition := replace(
    definition,
    old_fragment,
    '(select min(group_topic.canonical_name) from public.dp_qb_topics group_topic where group_topic.course_id = topic.course_id and group_topic.canonical_key = topic.canonical_key),'
  );

  old_fragment := $old$coalesce((
      select array_agg(subtopic.name order by placement.placement_order, subtopic.name)
      from public.dp_qb_question_subtopics placement
      join public.dp_qb_subtopics subtopic on subtopic.id = placement.subtopic_id
      where placement.variant_id = variant.id
    ), array[]::text[]),$old$;
  if position(old_fragment in definition) = 0 then
    raise exception 'Unexpected dp_qb_search_questions subtopic projection';
  end if;
  definition := replace(
    definition,
    old_fragment,
    'private.dp_qb_variant_canonical_subtopics(variant.id),'
  );

  execute definition;
end
$migration$;

revoke execute on function public.dp_qb_search_questions(text,integer,integer) from anon;
grant execute on function public.dp_qb_search_questions(text,integer,integer) to authenticated;
