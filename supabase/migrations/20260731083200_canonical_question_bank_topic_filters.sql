do $migration$
declare
  definition text;
  original text;
  old_fragment text;
  new_fragment text;
begin
  definition := pg_get_functiondef(
    'public.dp_qb_list_questions(uuid,text,uuid,uuid,text,uuid,text,boolean,text,boolean,boolean,integer,integer)'::regprocedure
  );
  original := definition;

  old_fragment := 'topic.name as topic_name,';
  new_fragment := 'min(topic.canonical_name) over (partition by topic.course_id, topic.canonical_key) as topic_name,';
  if position(old_fragment in definition) = 0 then
    raise exception 'Unexpected dp_qb_list_questions topic-name definition';
  end if;
  definition := replace(definition, old_fragment, new_fragment);

  old_fragment := $old$coalesce((
        select array_agg(subtopic.name order by placement.placement_order, subtopic.name)
        from public.dp_qb_question_subtopics placement
        join public.dp_qb_subtopics subtopic on subtopic.id = placement.subtopic_id
        where placement.variant_id = variant.id
      ), array[]::text[]) as subtopic_names,$old$;
  new_fragment := 'private.dp_qb_variant_canonical_subtopics(variant.id) as subtopic_names,';
  if position(old_fragment in definition) = 0 then
    raise exception 'Unexpected dp_qb_list_questions subtopic projection';
  end if;
  definition := replace(definition, old_fragment, new_fragment);

  old_fragment := 'and (p_topic_id is null or variant.topic_id = p_topic_id)';
  new_fragment := $new$and (
        p_topic_id is null
        or topic.canonical_key = (
          select selected.canonical_key
          from public.dp_qb_topics selected
          where selected.id = p_topic_id and selected.course_id = p_course_id
        )
      )$new$;
  if position(old_fragment in definition) = 0 then
    raise exception 'Unexpected dp_qb_list_questions topic filter';
  end if;
  definition := replace(definition, old_fragment, new_fragment);

  old_fragment := $old$and (
        p_subtopic_id is null
        or exists (
          select 1 from public.dp_qb_question_subtopics placement
          where placement.variant_id = variant.id and placement.subtopic_id = p_subtopic_id
        )
      )$old$;
  new_fragment := $new$and (
        p_subtopic_id is null
        or (
          (
            p_topic_id is null
            or (
              select parent.canonical_key
              from public.dp_qb_subtopics selected
              join public.dp_qb_topics parent on parent.id = selected.topic_id
              where selected.id = p_subtopic_id and selected.course_id = p_course_id
            ) = topic.canonical_key
          )
          and private.dp_qb_variant_has_canonical_subtopic(
            variant.id,
            (
              select selected.canonical_key
              from public.dp_qb_subtopics selected
              where selected.id = p_subtopic_id and selected.course_id = p_course_id
            ),
            topic.canonical_key
          )
        )
      )$new$;
  if position(old_fragment in definition) = 0 then
    raise exception 'Unexpected dp_qb_list_questions subtopic filter';
  end if;
  definition := replace(definition, old_fragment, new_fragment);

  if definition = original then
    raise exception 'dp_qb_list_questions was not changed';
  end if;
  execute definition;
end
$migration$;

revoke execute on function public.dp_qb_list_questions(
  uuid,text,uuid,uuid,text,uuid,text,boolean,text,boolean,boolean,integer,integer
) from anon;
grant execute on function public.dp_qb_list_questions(
  uuid,text,uuid,uuid,text,uuid,text,boolean,text,boolean,boolean,integer,integer
) to authenticated;
