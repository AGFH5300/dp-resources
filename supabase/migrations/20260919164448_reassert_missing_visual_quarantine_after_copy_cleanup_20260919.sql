update public.dp_qb_question_variants v
set render_status = 'quarantined',
    render_issue_codes = (
      select array_agg(distinct code order by code)
      from unnest(
        coalesce(v.render_issue_codes, '{}'::text[])
        || case
             when q.content like '%This supporting image is currently unavailable.%'
             then array['missing_question_image']::text[]
             else '{}'::text[]
           end
        || case
             when q.mark_scheme like '%This supporting image is currently unavailable.%'
             then array['missing_markscheme_image']::text[]
             else '{}'::text[]
           end
      ) as code
    )
from public.dp_qb_questions q
where v.question_id = q.id
  and (
    q.content like '%This supporting image is currently unavailable.%'
    or q.mark_scheme like '%This supporting image is currently unavailable.%'
  );
