with recoverable as (
  select
    s.id as stage_id,
    s.question_id,
    s.role,
    s.source_url,
    s.alt_text,
    a.id as asset_id,
    coalesce(
      src_exact.source_file_id,
      (
        select src2.source_file_id
        from public.dp_qb_asset_sources src2
        where src2.asset_id = a.id
          and src2.source_file_id is not null
        order by (src2.original_source_url = s.source_url) desc, src2.created_at asc
        limit 1
      )
    ) as source_file_id
  from public.dp_qb_remote_asset_backfill_stage_20260919 s
  join public.dp_qb_asset_sources src_exact on src_exact.original_source_url = s.source_url
  join public.dp_qb_assets a
    on a.id = src_exact.asset_id
   and a.verification_status = 'verified'
  where s.status = 'failed'
),
usable as (
  select distinct on (stage_id)
    stage_id, question_id, role, source_url, alt_text, asset_id, source_file_id
  from recoverable
  where source_file_id is not null
  order by stage_id, asset_id
),
linked as (
  insert into public.dp_qb_variant_assets (
    variant_id, asset_id, source_file_id, role, sort_order, alt_text
  )
  select v.id, u.asset_id, u.source_file_id, u.role, 1999, nullif(u.alt_text, '')
  from usable u
  join public.dp_qb_question_variants v on v.question_id = u.question_id
  on conflict (variant_id, asset_id, role) do update
    set source_file_id = excluded.source_file_id,
        alt_text = coalesce(public.dp_qb_variant_assets.alt_text, excluded.alt_text)
  returning variant_id
),
updated_questions as (
  update public.dp_qb_questions q
  set content = case
        when u.role = 'question'
          then replace(q.content, '![' || u.alt_text || '](' || u.source_url || ')',
            '![' || u.alt_text || '](question:' || u.source_file_id::text || ')')
        else q.content
      end,
      mark_scheme = case
        when u.role = 'markscheme'
          then replace(q.mark_scheme, '![' || u.alt_text || '](' || u.source_url || ')',
            '![' || u.alt_text || '](question:' || u.source_file_id::text || ')')
        else q.mark_scheme
      end
  from usable u
  where q.id = u.question_id
  returning q.id
)
update public.dp_qb_remote_asset_backfill_stage_20260919 s
set status = 'complete',
    asset_id = u.asset_id,
    source_file_id = u.source_file_id,
    last_error = null,
    updated_at = now()
from usable u
where s.id = u.stage_id;

update public.dp_qb_question_variants v
set render_status = 'quarantined',
    render_issue_codes = case
      when 'missing_question_image' = any(coalesce(v.render_issue_codes, '{}'::text[]))
        then coalesce(v.render_issue_codes, '{}'::text[])
      else array_append(coalesce(v.render_issue_codes, '{}'::text[]), 'missing_question_image')
    end
where exists (
  select 1
  from public.dp_qb_remote_asset_backfill_stage_20260919 s
  where s.status = 'failed'
    and s.role = 'question'
    and s.question_id = v.question_id
);

update public.dp_qb_question_variants v
set render_status = 'quarantined',
    render_issue_codes = case
      when 'missing_markscheme_image' = any(coalesce(v.render_issue_codes, '{}'::text[]))
        then coalesce(v.render_issue_codes, '{}'::text[])
      else array_append(coalesce(v.render_issue_codes, '{}'::text[]), 'missing_markscheme_image')
    end
where exists (
  select 1
  from public.dp_qb_remote_asset_backfill_stage_20260919 s
  where s.status = 'failed'
    and s.role = 'markscheme'
    and s.question_id = v.question_id
);
