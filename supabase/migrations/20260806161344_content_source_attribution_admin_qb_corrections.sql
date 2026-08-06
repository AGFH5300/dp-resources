-- Admin-only Question Bank provenance inspection and correction.
-- This migration changes attribution metadata only; it never changes questions,
-- variants, assets, solution associations, or user state.

create or replace function public.dp_admin_qb_source_inspector(p_variant_id uuid)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'variantId', variant.id,
    'questionId', variant.question_id,
    'reference', question.reference,
    'variantSources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rowId', provenance.id,
        'provider', provenance.provider,
        'sourceSlug', source.slug,
        'displayName', source.display_name,
        'sourceQuestionId', provenance.source_question_id,
        'sourceCourse', provenance.source_course,
        'sourceTopic', provenance.source_topic,
        'sourceIndex', provenance.source_index,
        'reviewStatus', provenance.review_status,
        'assignmentMethod', provenance.assignment_method,
        'importBatchId', provenance.created_by_batch_id
      ) order by source.display_order, provenance.id)
      from public.dp_qb_variant_sources provenance
      join public.dp_content_sources source on source.id = provenance.source_id
      where provenance.variant_id = variant.id
    ), '[]'::jsonb),
    'questionSources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rowId', provenance.id,
        'provider', provenance.provider,
        'sourceSlug', source.slug,
        'displayName', source.display_name,
        'sourceQuestionId', provenance.source_question_id,
        'sourceReference', provenance.source_reference,
        'reviewStatus', provenance.review_status,
        'assignmentMethod', provenance.assignment_method,
        'importBatchId', provenance.created_by_batch_id
      ) order by source.display_order, provenance.id)
      from public.dp_qb_question_sources provenance
      join public.dp_content_sources source on source.id = provenance.source_id
      where provenance.question_id = variant.question_id
    ), '[]'::jsonb)
  )
  from public.dp_qb_question_variants variant
  join public.dp_qb_questions question on question.id = variant.question_id
  where variant.id = p_variant_id;
$$;

create or replace function public.dp_admin_set_qb_source_review(
  p_actor_user_id uuid,
  p_target_kind text,
  p_source_row_id uuid,
  p_source_slug text,
  p_review_status text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  target_source_id uuid;
  before_state jsonb;
  target_id text;
begin
  if not exists (
    select 1 from public.dp_resource_memberships membership
    where membership.id = p_actor_user_id and membership.role = 'admin'
      and membership.is_suspended is false
  ) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_target_kind not in ('question_source', 'variant_source') then
    raise exception 'Invalid Question Bank source target' using errcode = '22023';
  end if;
  if p_review_status not in ('reviewed', 'under_review', 'rejected') then
    raise exception 'Invalid review status' using errcode = '22023';
  end if;
  select id into target_source_id from public.dp_content_sources
  where slug = p_source_slug and is_active;
  if target_source_id is null then
    raise exception 'Unknown or inactive source' using errcode = '22023';
  end if;

  if p_target_kind = 'question_source' then
    select jsonb_build_object(
      'sourceId', source_id, 'provider', provider,
      'reviewStatus', review_status, 'assignmentMethod', assignment_method
    ), question_id::text into before_state, target_id
    from public.dp_qb_question_sources where id = p_source_row_id;
    if target_id is null then raise exception 'Question source not found' using errcode = '22023'; end if;
    update public.dp_qb_question_sources
    set source_id = target_source_id, review_status = p_review_status,
        assignment_method = 'admin_override', reviewed_by = p_actor_user_id,
        reviewed_at = now(), updated_at = now()
    where id = p_source_row_id;
  else
    select jsonb_build_object(
      'sourceId', source_id, 'provider', provider,
      'reviewStatus', review_status, 'assignmentMethod', assignment_method
    ), variant_id::text into before_state, target_id
    from public.dp_qb_variant_sources where id = p_source_row_id;
    if target_id is null then raise exception 'Variant source not found' using errcode = '22023'; end if;
    update public.dp_qb_variant_sources
    set source_id = target_source_id, review_status = p_review_status,
        assignment_method = 'admin_override', reviewed_by = p_actor_user_id,
        reviewed_at = now(), updated_at = now()
    where id = p_source_row_id;
  end if;

  insert into public.dp_content_source_audit_log (
    actor_user_id, target_kind, target_id, action, before_state, after_state, change_version
  ) values (
    p_actor_user_id, p_target_kind, target_id, 'review_qb_source', before_state,
    jsonb_build_object('sourceSlug', p_source_slug, 'reviewStatus', p_review_status),
    'admin_qb_v1'
  );
  return jsonb_build_object('updated', true, 'targetId', target_id);
end;
$$;

revoke execute on function public.dp_admin_qb_source_inspector(uuid) from public, anon, authenticated;
grant execute on function public.dp_admin_qb_source_inspector(uuid) to service_role;
revoke execute on function public.dp_admin_set_qb_source_review(uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.dp_admin_set_qb_source_review(uuid, text, uuid, text, text) to service_role;
