-- Repair one malformed source choice whose markscheme identifies B and derives
-- L^2(M + 4m) / 9, while the imported B choice omitted the 4 coefficient.
-- The update is deliberately narrow and idempotent.

update public.dp_qb_questions
set
  content = replace(
    content,
    'L^2 (M+m)}{9}',
    'L^2 (M+4m)}{9}'
  ),
  updated_at = now()
where reference = 'PH0702'
  and content like '%L^2 (M+m)}{9}%'
  and mark_scheme like '%L^2(M+4m)%';

update public.dp_qb_question_search as search_document
set
  search_text = replace(
    search_document.search_text,
    'L^2 (M+m)}{9}',
    'L^2 (M+4m)}{9}'
  ),
  updated_at = now()
from public.dp_qb_question_variants as variant
join public.dp_qb_questions as question
  on question.id = variant.question_id
where search_document.variant_id = variant.id
  and question.reference = 'PH0702'
  and search_document.search_text like '%L^2 (M+m)}{9}%';
