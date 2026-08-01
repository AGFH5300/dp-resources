create or replace function public.dp_qb_practice_candidate_payload(
  p_user_id uuid,
  p_configuration jsonb
)
returns table(payload jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(
      jsonb_agg(
        jsonb_build_array(
          candidate.block_key,
          candidate.question_id,
          candidate.variant_id,
          candidate.course_id,
          candidate.course_priority,
          candidate.variant_priority,
          candidate.difficulty_rank,
          candidate.stable_order
        )
        order by
          candidate.block_key,
          candidate.question_id,
          candidate.course_priority,
          candidate.variant_priority,
          candidate.variant_id
      ),
      '[]'::jsonb
    ) as payload
  from public.dp_qb_practice_candidates(p_user_id, p_configuration) candidate;
$$;

revoke all on function public.dp_qb_practice_candidate_payload(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.dp_qb_practice_candidate_payload(uuid, jsonb)
  to service_role;

comment on function public.dp_qb_practice_candidate_payload(uuid, jsonb) is
  'Returns the complete compact practice candidate set as one JSON row so PostgREST row limits cannot truncate large multi-topic configurations.';
