-- The admin operations page uses the service role and can still inspect every
-- variant. Authenticated study views, including an admin's own Question Bank and
-- Recent pages, should only ever receive variants that passed the render audit.
drop policy if exists "question bank eligible member read" on public.dp_qb_question_variants;
create policy "question bank eligible member read"
on public.dp_qb_question_variants
for select
to authenticated
using (
  (select private.dp_qb_has_access())
  and render_status = 'ready'
);
