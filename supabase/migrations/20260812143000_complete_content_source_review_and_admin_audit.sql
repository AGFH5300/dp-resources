-- Complete the reviewed Library source attribution and keep the admin audit
-- below the API statement timeout.

do $$
declare
  v_version constant text := 'resource_source_evidence_v4';
  v_unknown_files bigint;
  v_unknown_folders bigint;
  v_has_index boolean;
begin
  insert into public.dp_content_sources (
    slug, display_name, short_label, description, source_category,
    attribution_label, website_url, display_order, is_active
  ) values
    ('pearson', 'Pearson', 'Pearson', 'Resources published by Pearson.', 'institution', 'Publisher', null, 100, true),
    ('cambridge_university_press', 'Cambridge University Press', 'Cambridge', 'Resources published by Cambridge University Press.', 'institution', 'Publisher', null, 101, true),
    ('oxford_university_press', 'Oxford University Press', 'Oxford', 'Resources published by Oxford University Press.', 'institution', 'Publisher', null, 102, true),
    ('hodder_education', 'Hodder Education', 'Hodder', 'Resources published by Hodder Education.', 'institution', 'Publisher', null, 103, true),
    ('palgrave_macmillan', 'Palgrave Macmillan', 'Palgrave Macmillan', 'Resources published by Palgrave Macmillan.', 'institution', 'Publisher', null, 104, true),
    ('ibid_press', 'IBID Press', 'IBID Press', 'Resources published by IBID Press.', 'institution', 'Publisher', null, 105, true),
    ('express_publishing', 'Express Publishing', 'Express Publishing', 'Resources published by Express Publishing.', 'institution', 'Publisher', null, 106, true),
    ('anthem_press', 'Anthem Press', 'Anthem Press', 'Resources published by Anthem Press.', 'institution', 'Publisher', null, 107, true),
    ('ib_math_tok', 'IB Math TOK', 'IB Math TOK', 'Resources created by IB Math TOK.', 'creator', 'Creator', null, 110, true),
    ('yphysics', 'YPhysics', 'YPhysics', 'Physics resources annotated by YPhysics.', 'creator', 'Annotated by', null, 111, true),
    ('henrik_ibsen', 'Henrik Ibsen', 'Henrik Ibsen', 'Works by Henrik Ibsen.', 'creator', 'Author', null, 120, true),
    ('tennessee_williams', 'Tennessee Williams', 'Tennessee Williams', 'Works by Tennessee Williams.', 'creator', 'Author', null, 121, true),
    ('chimamanda_ngozi_adichie', 'Chimamanda Ngozi Adichie', 'Chimamanda Ngozi Adichie', 'Works by Chimamanda Ngozi Adichie.', 'creator', 'Author', null, 122, true),
    ('david_mamet', 'David Mamet', 'David Mamet', 'Works by David Mamet.', 'creator', 'Author', null, 123, true),
    ('heinrich_boll', 'Heinrich Böll', 'Heinrich Böll', 'Works by Heinrich Böll.', 'creator', 'Author', null, 124, true),
    ('marjane_satrapi', 'Marjane Satrapi', 'Marjane Satrapi', 'Works by Marjane Satrapi.', 'creator', 'Author', null, 125, true),
    ('f_scott_fitzgerald', 'F. Scott Fitzgerald', 'F. Scott Fitzgerald', 'Works by F. Scott Fitzgerald.', 'creator', 'Author', null, 126, true),
    ('library_structure', 'Library structure', 'Library structure', 'Internal Library navigation folders.', 'internal', 'Organized by', null, 9980, false)
  on conflict (slug) do update set
    display_name = excluded.display_name,
    short_label = excluded.short_label,
    description = excluded.description,
    source_category = excluded.source_category,
    attribution_label = excluded.attribution_label,
    website_url = excluded.website_url,
    display_order = excluded.display_order,
    is_active = excluded.is_active,
    updated_at = now();

  update public.dp_content_sources
  set description = case slug
      when 'save_my_exams' then 'Resources attributed to Save My Exams.'
      when 'revisiondojo' then 'Resources attributed to RevisionDojo.'
      when 'christos_nikolaidis' then 'Resources attributed to Christos Nikolaidis.'
      when 'brilliant_learning' then 'Resources attributed to Brilliant Learning.'
      when 'padlet' then 'Resources hosted on Padlet.'
      when 'school' then 'Resources supplied by a school.'
      when 'teacher_created' then 'Teacher-created resources.'
      when 'ib_official' then 'Official International Baccalaureate materials.'
      when 'dp_resources' then 'Original resources created by DP Resources.'
      when 'unknown' then 'Source not yet verified.'
      else description
    end,
    updated_at = now()
  where slug in (
    'save_my_exams', 'revisiondojo', 'christos_nikolaidis',
    'brilliant_learning', 'padlet', 'school', 'teacher_created',
    'ib_official', 'dp_resources', 'unknown'
  );

  insert into public.dp_content_source_aliases (source_id, alias, alias_key)
  select source.id, alias.alias, alias.alias_key
  from (values
    ('pearson', 'Pearson', 'pearson'),
    ('cambridge_university_press', 'Cambridge', 'cambridge'),
    ('cambridge_university_press', 'Cambridge University Press', 'cambridgeuniversitypress'),
    ('oxford_university_press', 'Oxford', 'oxford'),
    ('oxford_university_press', 'Oxford University Press', 'oxforduniversitypress'),
    ('hodder_education', 'Hodder', 'hodder'),
    ('hodder_education', 'Hodder Education', 'hoddereducation'),
    ('palgrave_macmillan', 'Palgrave Macmillan', 'palgravemacmillan'),
    ('ibid_press', 'IBID Press', 'ibidpress'),
    ('express_publishing', 'Express Publishing', 'expresspublishing'),
    ('anthem_press', 'Anthem Press', 'anthempress'),
    ('ib_math_tok', 'IB Math TOK', 'ibmathtok'),
    ('yphysics', 'YPhysics', 'yphysics'),
    ('henrik_ibsen', 'Henrik Ibsen', 'henrikibsen'),
    ('tennessee_williams', 'Tennessee Williams', 'tennesseewilliams'),
    ('chimamanda_ngozi_adichie', 'Chimamanda Ngozi Adichie', 'chimamandangoziadichie'),
    ('david_mamet', 'David Mamet', 'davidmamet'),
    ('heinrich_boll', 'Heinrich Böll', 'heinrichboll'),
    ('marjane_satrapi', 'Marjane Satrapi', 'marjanesatrapi'),
    ('f_scott_fitzgerald', 'F. Scott Fitzgerald', 'fscottfitzgerald')
  ) alias(source_slug, alias, alias_key)
  join public.dp_content_sources source on source.slug = alias.source_slug
  on conflict (alias_key) do update set
    source_id = excluded.source_id,
    alias = excluded.alias;

  update public.dp_resource_source_assignments
  set review_status = 'rejected',
      applies_to_descendants = false,
      updated_at = now(),
      last_resolved_at = now()
  where backfill_version = v_version
    and review_status <> 'rejected';

  select exists(select 1 from public.dp_resource_index) into v_has_index;

  select
    count(distinct index_row.drive_file_id) filter (where not index_row.is_folder),
    count(distinct index_row.drive_file_id) filter (where index_row.is_folder)
  into v_unknown_files, v_unknown_folders
  from public.dp_resource_index index_row
  join public.dp_resource_effective_source_assignments assignment
    on assignment.drive_file_id = index_row.drive_file_id
  join public.dp_content_sources source on source.id = assignment.source_id
  where source.slug = 'unknown';

  if v_has_index and (v_unknown_files <> 62 or v_unknown_folders <> 112) then
    raise exception
      'Expected 62 unresolved files and 112 structural folders; found % files and % folders',
      v_unknown_files, v_unknown_folders;
  end if;

  with evidence(drive_file_id, source_slug, is_primary, relationship) as (
    values
      ('1WM5ZJ8QvWTeXxfCCHUC6YFQYgFBXnOye', 'pearson', true, 'primary'),
      ('1jYx8rh15sfIfu4UMGRZBKht4Hy4DNr22', 'school', true, 'primary'),
      ('1GaQUC3seEL4IUBBc_NOfqk831dfkZDvG', 'school', true, 'primary'),
      ('1UMBChiNRugGiGLGqikluDhBNGItxqY0E', 'henrik_ibsen', true, 'primary'),
      ('1YEfKxC8lSIWpmDPh02O8xmfWeHyN9XZ9', 'tennessee_williams', true, 'primary'),
      ('1DGrNNneqB_aICDM7HzLJcAMvzbaD-lMm', 'tennessee_williams', true, 'primary'),
      ('1w6hOH-y6ilMNc23Iwgl1duqa7sko9ss5', 'chimamanda_ngozi_adichie', true, 'primary'),
      ('1bNOGDpHVdJmxpsPoqdTmkjKrk37XBc9o', 'david_mamet', true, 'primary'),
      ('1CvAdrewzoFXbU_xKZMlY_Dzr0PKE0SY6', 'chimamanda_ngozi_adichie', true, 'primary'),
      ('1KFrZTlwprMh1_Jqs01WrlHBwUm37FDLZ', 'heinrich_boll', true, 'primary'),
      ('1K2gsauWQJs151uN3fNOTgO6TojWKfXsP', 'marjane_satrapi', true, 'primary'),
      ('1mFS8mS0eggMwURUUDLZI0NhbqCPFaiZx', 'f_scott_fitzgerald', true, 'primary'),
      ('1A3vjMV9iehnP47CZlVjNFUz-c8pbKFK_', 'cambridge_university_press', true, 'primary'),
      ('1ZyQcBU1hEuCWN6MJb3xroyZ805wIb4H1', 'cambridge_university_press', true, 'primary'),
      ('1HorkEuB2SOn59vQuXfbQf-QYgizPevpt', 'cambridge_university_press', true, 'primary'),
      ('1CCUpPcURGL7uwGbb9fijMBhosq5mKr5y', 'cambridge_university_press', true, 'primary'),
      ('1o1Rp8A8w5x_EMsWQl5YnqogTzXAwPadh', 'ib_official', true, 'primary'),
      ('1F19mBbVZSfyCym43ECeusRaWWAWlcsky', 'ibid_press', true, 'primary'),
      ('1Im1ygNYT63hfChdjO_kTfhQ_Cr2COcQN', 'hodder_education', true, 'primary'),
      ('1I6IrD9hMk3P2nVUCertioitIwn_C8ApS', 'cambridge_university_press', true, 'primary'),
      ('1GpptOGvmKXyXv6xXzKqTUA9GbajBOmnz', 'pearson', true, 'primary'),
      ('1aKX4BXU8uPmw9smbAIuLiJuTi2tZ5-JZ', 'palgrave_macmillan', true, 'primary'),
      ('1s8o0JCtz_2aghYsySY_UUyApoUN-7g00', 'hodder_education', true, 'primary'),
      ('1vUBt8K5e2-j_kaBSI6wtMN0niAUqRI10', 'cambridge_university_press', true, 'primary'),
      ('1AnMyNlQNbXExTUJvZSxVWgqhjw41sKIO', 'cambridge_university_press', true, 'primary'),
      ('1dhfy5JwykVhSjvWpjB9EPiJiO9MyUNBJ', 'cambridge_university_press', true, 'primary'),
      ('1exEAfdye-a7dLbq6YzK8d-7YvzVQU3xA', 'hodder_education', true, 'primary'),
      ('1KARm1Y7dIRcz_dAecljJKcjtaR-iDEm2', 'hodder_education', true, 'primary'),
      ('1JvsoTMgd0A4amuIE_Ht2swS6WzypBjto', 'hodder_education', true, 'primary'),
      ('1f8EObvE5ngHxBd3lG888f5iQjpQfwGHR', 'oxford_university_press', true, 'primary'),
      ('1zKBVT_bpY3e8TSF5SexpjdhzSIUMMgWn', 'pearson', true, 'primary'),
      ('1TfFxpuL5M0GY3BtDvrvn_YYMJWJeWc2x', 'ib_official', true, 'primary'),
      ('1dni6zyJjHJtZw4VXIW2yYVa_xWPEGrHc', 'oxford_university_press', true, 'primary'),
      ('1N2nzeVGxptk2XT-y5REd77XK7Da5qHCK', 'pearson', true, 'primary'),
      ('1TPu-eYRfVCETTaaprXUhT1Pk2Wr3xf5N', 'pearson', true, 'primary'),
      ('14PS6q9AJaoiaJOuc5zvwV4LuDuHeWBR3', 'ib_official', true, 'primary'),
      ('1tMGjL4C-zhXmpZ6YvlMwCIVwQxv1TSkD', 'express_publishing', true, 'primary'),
      ('1gdI30F1OyqbEPWkTFpn-7mpehzevwSfi', 'express_publishing', true, 'primary'),
      ('12HoHdIwOqbrjfVRHUZrQWE36kvSufNsg', 'ib_official', true, 'primary'),
      ('1IPzXSMSJSape5GGzMbsC8XmlOwazfL4Y', 'oxford_university_press', true, 'primary'),
      ('10y-PvvCFkEAUNJHnhqNmxtNUFJzBTkHn', 'ib_official', true, 'primary'),
      ('1MlT-YQFTw4P_PPsppCNWNjptjx2RW53D', 'yphysics', true, 'primary'),
      ('1MlT-YQFTw4P_PPsppCNWNjptjx2RW53D', 'ib_official', false, 'adapted_from'),
      ('17FhiiE2HIr9-3MD3LHzzxIjBlQHvoOqi', 'teacher_created', true, 'primary'),
      ('186fLLmo52t3hof6kMJnDIpYUXFawJNNn', 'teacher_created', true, 'primary'),
      ('1GRfNeUS-hNV7CiBF_Gm1vN40eWaJvQem', 'hodder_education', true, 'primary'),
      ('13mPctJR96CfHFGSo5x7DlVUQsJ26co5c', 'oxford_university_press', true, 'primary'),
      ('1E284pXDkQmsGRup4WFPJ7oTlTQEMMJXr', 'teacher_created', true, 'primary'),
      ('11NyoTU_hVzLZEu6x-Q4KvucKcirJgxpn', 'pearson', true, 'primary'),
      ('1yLNQBMknCLsstitRH5wDjE4VWIUIWd7F', 'pearson', true, 'primary'),
      ('1ccTm0PMwct4JhVnXSfjAVLN16Dq6zMJU', 'ib_official', true, 'primary'),
      ('1N9hPrW8Gre7oj_lYMRbsrOqweYgocg9v', 'pearson', true, 'primary'),
      ('14wr01rvpt_fTEFhIcspCpCXlvC37Ceoo', 'ib_official', true, 'primary'),
      ('10MA8BA8-MrMygcXh9BS-oYVkt_Rvn4eh', 'oxford_university_press', true, 'primary'),
      ('1Iulsvha5PbPuqzQIymdw6c3mDSJelTh0', 'ib_official', true, 'primary'),
      ('1JsFX_Ni8wbY5NvJqOMHsULUQxpACNUKc', 'oxford_university_press', true, 'primary'),
      ('1TH_SbIViDSMNcJD3laXFPzvIIUYGEXEo', 'ib_official', true, 'primary'),
      ('1My2_m6M0vCcJMs-b2o4I6aLSWWtd9X9n', 'ib_math_tok', true, 'primary'),
      ('1h-ix0Gy2VZIB-TcxTuSMg_CeTwoGCmOC', 'ib_official', true, 'primary'),
      ('1NzHOTbR4Xd9R2NOSWFUvdG6jP2ZHm7c1', 'ib_official', true, 'primary'),
      ('1UWmCH44cAmYLUS_RrS6W6n9hXHfo2u1l', 'ib_official', true, 'primary'),
      ('1EioxDXMz93FcnKYrgPm0e-17gV9xIAgE', 'anthem_press', true, 'primary'),
      ('1kC4gpgbxm9j9wBWYgSl1lxJSuVim5CSU', 'oxford_university_press', true, 'primary')
  )
  insert into public.dp_resource_source_assignments (
    drive_file_id, source_id, is_primary, relationship, assignment_method,
    confidence, inherited_from_drive_file_id, review_status,
    applies_to_descendants, resolution_version, backfill_version,
    last_resolved_at, created_by, updated_at
  )
  select evidence.drive_file_id, source.id, evidence.is_primary,
         evidence.relationship, 'import_manifest', 1, null, 'reviewed',
         false, v_version, v_version, now(), null, now()
  from evidence
  join public.dp_content_sources source on source.slug = evidence.source_slug
  join public.dp_resource_index index_row
    on index_row.drive_file_id = evidence.drive_file_id and not index_row.is_folder
  on conflict (
    drive_file_id, source_id, assignment_method,
    (coalesce(inherited_from_drive_file_id, ''::text)), relationship
  ) do update set
    is_primary = excluded.is_primary,
    confidence = 1,
    review_status = 'reviewed',
    applies_to_descendants = false,
    resolution_version = excluded.resolution_version,
    backfill_version = excluded.backfill_version,
    last_resolved_at = now(),
    updated_at = now();

  insert into public.dp_resource_source_assignments (
    drive_file_id, source_id, is_primary, relationship, assignment_method,
    confidence, inherited_from_drive_file_id, review_status,
    applies_to_descendants, resolution_version, backfill_version,
    last_resolved_at, created_by, updated_at
  )
  select index_row.drive_file_id, structure.id, true, 'primary',
         'import_manifest', 1, null, 'reviewed', false,
         v_version, v_version, now(), null, now()
  from public.dp_resource_index index_row
  join public.dp_resource_effective_source_assignments assignment
    on assignment.drive_file_id = index_row.drive_file_id
  join public.dp_content_sources current_source
    on current_source.id = assignment.source_id and current_source.slug = 'unknown'
  cross join public.dp_content_sources structure
  where index_row.is_folder and structure.slug = 'library_structure'
  on conflict (
    drive_file_id, source_id, assignment_method,
    (coalesce(inherited_from_drive_file_id, ''::text)), relationship
  ) do update set
    is_primary = true,
    confidence = 1,
    review_status = 'reviewed',
    applies_to_descendants = false,
    resolution_version = excluded.resolution_version,
    backfill_version = excluded.backfill_version,
    last_resolved_at = now(),
    updated_at = now();

  if v_has_index and exists (
    select 1
    from public.dp_resource_effective_source_assignments assignment
    join public.dp_content_sources source on source.id = assignment.source_id
    where source.slug = 'unknown'
  ) then
    raise exception 'Source review completion left unresolved effective assignments';
  end if;

  insert into public.dp_content_source_audit_log (
    actor_user_id, target_kind, target_id, action,
    before_state, after_state, change_version
  ) values (
    null, 'resource_library', 'library', 'complete_source_review',
    jsonb_build_object('filesUnderReview', v_unknown_files, 'foldersUnderReview', v_unknown_folders),
    jsonb_build_object('filesUnderReview', 0, 'foldersUnderReview', 0),
    v_version
  );
end;
$$;

create or replace view public.dp_resource_effective_source_assignments
with (security_invoker = true)
as
with scored as (
  select assignment.id,
         assignment.drive_file_id,
         assignment.source_id,
         assignment.is_primary,
         assignment.relationship,
         assignment.review_status,
         assignment.assignment_method,
         assignment.inherited_from_drive_file_id,
         case assignment.assignment_method
           when 'admin_override' then 1
           when 'manual' then 1
           when 'import_manifest' then 2
           when 'folder_inheritance' then 3
           when 'reviewed_path_rule' then 4
           when 'reviewed_filename_rule' then 5
           else 99
         end as precedence
  from public.dp_resource_source_assignments assignment
  where assignment.review_status <> 'rejected'
), ranked as (
  select scored.*,
         min(scored.precedence) over (partition by scored.drive_file_id) as best_precedence
  from scored
)
select id, drive_file_id, source_id, is_primary, relationship, review_status,
       assignment_method, inherited_from_drive_file_id, precedence
from ranked
where precedence = best_precedence;

create index if not exists dp_qb_variant_sources_reviewed_variant_idx
  on public.dp_qb_variant_sources (variant_id)
  include (source_id)
  where review_status = 'reviewed';

create index if not exists dp_qb_question_sources_active_question_source_idx
  on public.dp_qb_question_sources (question_id, source_id)
  where review_status <> 'rejected';

create or replace function public.dp_admin_content_source_qb_coverage()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'questionSources', coalesce(jsonb_agg(row_to_json(stats) order by stats.display_order), '[]'::jsonb)
  )
  from (
    select source.slug, source.display_name, source.display_order,
           coalesce(question_counts.question_cores, 0)::bigint as question_cores,
           coalesce(variant_counts.variants, 0)::bigint as variants
    from public.dp_content_sources source
    left join (
      select source_id, count(distinct question_id)::bigint as question_cores
      from public.dp_qb_question_sources
      where review_status <> 'rejected'
      group by source_id
    ) question_counts on question_counts.source_id = source.id
    left join (
      select source_id, count(distinct variant_id)::bigint as variants
      from public.dp_qb_variant_sources
      where review_status <> 'rejected'
      group by source_id
    ) variant_counts on variant_counts.source_id = source.id
    where coalesce(question_counts.question_cores, 0) > 0
       or coalesce(variant_counts.variants, 0) > 0
  ) stats;
$$;

create or replace function public.dp_admin_content_source_qb_summary()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'multiSourceQuestions', (
      select count(*) from (
        select question_id
        from public.dp_qb_question_sources
        where review_status <> 'rejected'
        group by question_id
        having count(distinct source_id) > 1
      ) multi
    ),
    'variantSourcesUnderReview', (
      select count(*) from public.dp_qb_variant_sources where review_status = 'under_review'
    ),
    'questionSourcesUnderReview', (
      select count(*) from public.dp_qb_question_sources where review_status = 'under_review'
    )
  );
$$;

create or replace function public.dp_admin_content_source_qb_ready_gap()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'readyVariantsWithoutReviewedSource', count(*)
  )
  from public.dp_qb_question_variants variant
  where variant.render_status = 'ready'
    and not exists (
      select 1
      from public.dp_qb_variant_sources provenance
      where provenance.variant_id = variant.id
        and provenance.review_status = 'reviewed'
    );
$$;

create or replace function public.dp_admin_content_source_qb_conflicts()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'coreVariantSourceConflicts', count(*)
  )
  from public.dp_qb_variant_sources variant_source
  join public.dp_qb_question_variants variant on variant.id = variant_source.variant_id
  where variant_source.review_status <> 'rejected'
    and not exists (
      select 1
      from public.dp_qb_question_sources question_source
      where question_source.question_id = variant.question_id
        and question_source.source_id = variant_source.source_id
        and question_source.review_status <> 'rejected'
    );
$$;

create or replace function public.dp_admin_content_source_library_coverage()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'librarySources', coalesce((
      select jsonb_agg(row_to_json(stats) order by stats.display_order)
      from (
        select source.slug, source.display_name, source.display_order,
               counts.files::bigint as files,
               counts.folders::bigint as folders
        from public.dp_content_sources source
        join (
          select assignment.source_id,
                 count(distinct assignment.drive_file_id)
                   filter (where not index_row.is_folder)::bigint as files,
                 count(distinct assignment.drive_file_id)
                   filter (where index_row.is_folder)::bigint as folders
          from public.dp_resource_effective_source_assignments assignment
          join public.dp_resource_index index_row
            on index_row.drive_file_id = assignment.drive_file_id
          group by assignment.source_id
        ) counts on counts.source_id = source.id
        where counts.files > 0 or counts.folders > 0
      ) stats
    ), '[]'::jsonb),
    'libraryAssignmentsByMethod', coalesce((
      select jsonb_object_agg(assignment_method, count_rows)
      from (
        select assignment_method, count(*)::bigint as count_rows
        from public.dp_resource_effective_source_assignments
        group by assignment_method
      ) methods
    ), '{}'::jsonb),
    'libraryFilesWithMultipleSources', (
      select count(*)
      from (
        select assignment.drive_file_id
        from public.dp_resource_effective_source_assignments assignment
        join public.dp_resource_index index_row
          on index_row.drive_file_id = assignment.drive_file_id
         and not index_row.is_folder
        group by assignment.drive_file_id
        having count(distinct assignment.source_id) > 1
      ) multi
    )
  );
$$;

create or replace function public.dp_admin_content_source_type_audit()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'resourceTypes', coalesce((
      select jsonb_agg(row_to_json(stats) order by stats.display_order)
      from (
        select resource_type.slug, resource_type.display_name, resource_type.display_order,
               coalesce(counts.resources, 0)::bigint as resources,
               coalesce(counts.under_review, 0)::bigint as under_review
        from public.dp_resource_types resource_type
        left join (
          select resource_type_id, count(*)::bigint as resources,
                 count(*) filter (where review_status = 'under_review')::bigint as under_review
          from public.dp_resource_type_assignments
          group by resource_type_id
        ) counts on counts.resource_type_id = resource_type.id
      ) stats
    ), '[]'::jsonb),
    'recentChanges', coalesce((
      select jsonb_agg(row_to_json(changes))
      from (
        select target_kind, target_id, action, actor_user_id, change_version, created_at
        from public.dp_content_source_audit_log
        order by created_at desc
        limit 50
      ) changes
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.dp_admin_content_source_qb_coverage() from public, anon, authenticated;
revoke all on function public.dp_admin_content_source_qb_summary() from public, anon, authenticated;
revoke all on function public.dp_admin_content_source_qb_ready_gap() from public, anon, authenticated;
revoke all on function public.dp_admin_content_source_qb_conflicts() from public, anon, authenticated;
revoke all on function public.dp_admin_content_source_library_coverage() from public, anon, authenticated;
revoke all on function public.dp_admin_content_source_type_audit() from public, anon, authenticated;

grant execute on function public.dp_admin_content_source_qb_coverage() to service_role;
grant execute on function public.dp_admin_content_source_qb_summary() to service_role;
grant execute on function public.dp_admin_content_source_qb_ready_gap() to service_role;
grant execute on function public.dp_admin_content_source_qb_conflicts() to service_role;
grant execute on function public.dp_admin_content_source_library_coverage() to service_role;
grant execute on function public.dp_admin_content_source_type_audit() to service_role;

alter table public.dp_platform_housekeeping_runs enable row level security;
