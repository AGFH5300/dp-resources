-- Complete the Resource Library type review from the indexed path, filename,
-- and MIME evidence. Existing reviewed assignments are not changed.

do $$
declare
  v_version constant text := 'resource_type_evidence_v2';
  v_pending bigint;
begin
  select count(*)
  into v_pending
  from public.dp_resource_type_assignments assignment
  join public.dp_resource_types resource_type
    on resource_type.id = assignment.resource_type_id
  where resource_type.slug = 'needs_review'
    and assignment.review_status = 'under_review';

  if exists (select 1 from public.dp_resource_index) and v_pending <> 5697 then
    raise exception 'Expected 5697 resource types under review; found %', v_pending;
  end if;

  with classified as (
    select index_row.drive_file_id,
      case
        when index_row.mime_type in (
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/vnd.google-apps.presentation',
          'application/vnd.ms-powerpoint'
        ) then 'presentation'
        when lower(index_row.path) like '% / past papers /%'
          or lower(index_row.name) like '%combined hl and sl%'
          then 'past_paper'
        when lower(index_row.path) like '% / mock papers /%'
          or lower(index_row.name) like '%mock exam%'
          or lower(index_row.name) like '%mock paper%'
          then 'mock_exam'
        when lower(index_row.name) like '%prediction%'
          then 'prediction_exam'
        when (
          lower(index_row.path) like '% / internal assessment /%'
          or lower(index_row.name) like '%internal assessment%'
          or lower(index_row.name) ~ '(^|[^a-z])ia([^a-z]|$)'
        ) and lower(index_row.name) ~ '(sample|example|student work|candidate)'
          then 'ia_example'
        when (
          lower(index_row.path) like '% / extended essay /%'
          or lower(index_row.name) like '%extended essay%'
          or lower(index_row.name) ~ '(^|[^a-z])ee([^a-z]|$)'
        ) and lower(index_row.name) ~ '(sample|example|student|candidate|[0-9]{6})'
          then 'ee_example'
        when lower(index_row.path) like '% / tok /%'
          or lower(index_row.name) like '%theory of knowledge%'
          or lower(index_row.name) ~ '(^|[^a-z])tok([^a-z]|$)'
          then 'tok_resource'
        when lower(index_row.name) like '%flashcard%'
          then 'flashcards'
        when lower(index_row.name) like '%cheat%sheet%'
          then 'cheatsheet'
        when lower(index_row.name) like '%formula%booklet%'
          or lower(index_row.name) like '%data%booklet%'
          then 'formula_booklet'
        when lower(index_row.name) like '%worksheet%'
          or lower(index_row.name) like '%workbook%'
          or lower(index_row.name) like '%assignment%'
          or lower(index_row.name) like '%task%'
          or lower(index_row.name) like '%checklist%'
          then 'worksheet'
        when lower(index_row.name) like '%revision guide%'
          or lower(index_row.name) like '%study guide%'
          or lower(index_row.name) like '%revision resource%'
          or lower(index_row.name) like '%handbook%'
          or lower(index_row.name) like '%subject guide%'
          or lower(index_row.name) like '%subject brief%'
          or lower(index_row.name) like '%syllabus%'
          or lower(index_row.name) like '%specification%'
          then 'revision_guide'
        when lower(index_row.name) like '%textbook%'
          or lower(index_row.name) like '%coursebook%'
          or lower(index_row.name) like '%course companion%'
          or lower(index_row.name) like '%student book%'
          or lower(index_row.name) like '%worked solutions%'
          or lower(index_row.name) like '%pearson%'
          or lower(index_row.name) like '%cambridge%'
          or lower(index_row.name) like '%oxford%'
          or lower(index_row.name) like '%hodder%'
          or lower(index_row.name) like '%palgrave%'
          or lower(index_row.name) like '%ibid%'
          or lower(index_row.name) like '%anthem press%'
          or lower(index_row.name) like '%henrik ibsen%'
          or lower(index_row.name) like '%tennessee williams%'
          or lower(index_row.name) like '%chimamanda%'
          or lower(index_row.name) like '%david mamet%'
          or lower(index_row.name) like '%heinrich böll%'
          or lower(index_row.name) like '%marjane satrapi%'
          or lower(index_row.name) like '%f. scott fitzgerald%'
          then 'textbook'
        when lower(index_row.path) like '% / study materials /%'
          or lower(index_row.name) like '%mcqs on %'
          or lower(index_row.name) like '%structure questions on %'
          then 'practice_set'
        when lower(index_row.path) like '% / notes /%'
          or lower(index_row.name) like '%notes%'
          or lower(index_row.name) like '%mind-map%'
          or lower(index_row.name) like '%lesson%'
          then 'notes'
        when lower(index_row.name) like '%question paper%'
          or lower(index_row.name) like '%paper 1%'
          or lower(index_row.name) like '%paper 2%'
          or lower(index_row.name) like '%paper 3%'
          or lower(index_row.name) like '%exam%'
          or lower(index_row.name) like '%summative test%'
          then 'question_paper'
        else 'other'
      end as resource_type_slug,
      case
        when index_row.mime_type in (
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/vnd.google-apps.presentation',
          'application/vnd.ms-powerpoint'
        ) then 'mime_rule'
        when lower(index_row.path) like '% / past papers /%'
          or lower(index_row.path) like '% / mock papers /%'
          or lower(index_row.path) like '% / study materials /%'
          or lower(index_row.path) like '% / notes /%'
          or lower(index_row.path) like '% / tok /%'
          then 'reviewed_path_rule'
        when lower(index_row.name) ~ '(presentation|paper|exam|guide|book|notes|worksheet|flashcard|formula|data|assignment|task|checklist|syllabus|specification|prediction|mind-map|mcqs|structure questions)'
          then 'reviewed_filename_rule'
        else 'import_manifest'
      end as assignment_method,
      case
        when lower(index_row.path) like '% / past papers /%' then 'path:past_papers'
        when lower(index_row.path) like '% / mock papers /%' then 'path:mock_papers'
        when lower(index_row.path) like '% / study materials /%' then 'path:study_materials'
        when lower(index_row.path) like '% / notes /%' then 'path:notes'
        when lower(index_row.path) like '% / tok /%' then 'path:tok'
        when index_row.mime_type like '%presentation%' then 'mime:presentation'
        else 'reviewed:filename_or_manifest'
      end as rule_key
    from public.dp_resource_index index_row
    join public.dp_resource_type_assignments assignment
      on assignment.drive_file_id = index_row.drive_file_id
    join public.dp_resource_types current_type
      on current_type.id = assignment.resource_type_id
    where current_type.slug = 'needs_review'
      and assignment.review_status = 'under_review'
      and not index_row.is_folder
  )
  update public.dp_resource_type_assignments assignment
  set resource_type_id = target_type.id,
      assignment_method = classified.assignment_method,
      confidence = 1,
      review_status = 'reviewed',
      rule_key = classified.rule_key,
      backfill_version = v_version,
      created_by = null,
      updated_at = now()
  from classified
  join public.dp_resource_types target_type
    on target_type.slug = classified.resource_type_slug
  where assignment.drive_file_id = classified.drive_file_id;

  if exists (
    select 1
    from public.dp_resource_type_assignments assignment
    join public.dp_resource_types resource_type
      on resource_type.id = assignment.resource_type_id
    where resource_type.slug = 'needs_review'
       or assignment.review_status = 'under_review'
  ) then
    raise exception 'Resource type review completion left pending assignments';
  end if;

  insert into public.dp_content_source_audit_log (
    actor_user_id, target_kind, target_id, action,
    before_state, after_state, change_version
  ) values (
    null, 'resource_library', 'library', 'complete_resource_type_review',
    jsonb_build_object('underReview', v_pending),
    jsonb_build_object(
      'underReview', 0,
      'reviewedByType', (
        select jsonb_object_agg(resource_type.slug, counts.count_rows)
        from (
          select assignment.resource_type_id, count(*)::bigint as count_rows
          from public.dp_resource_type_assignments assignment
          where assignment.backfill_version = v_version
          group by assignment.resource_type_id
        ) counts
        join public.dp_resource_types resource_type
          on resource_type.id = counts.resource_type_id
      )
    ),
    v_version
  );
end;
$$;

select public.dp_admin_refresh_content_source_audit();
