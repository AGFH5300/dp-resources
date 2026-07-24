-- Repair imported list-item formulae whose opening `$` was placed on the
-- bullet line and whose formula plus closing `$` was placed on the next line.
-- This malformed source rendered as a stray bullet and raw LaTeX.
update public.dp_qb_questions
set
  mark_scheme = regexp_replace(
    mark_scheme,
    E'(?m)^([ \\t]*[-*][ \\t]+)\\$[ \\t]*\\n[ \\t]*([^\\n]+)\\$[ \\t]*$',
    E'\\1$\\2$',
    'g'
  ),
  updated_at = now()
where mark_scheme ~ E'(?m)^[ \\t]*[-*][ \\t]+\\$[ \\t]*$';

-- Keep the migration self-checking: every affected formula must now be a
-- complete inline-math list item.
do $$
begin
  if exists (
    select 1
    from public.dp_qb_questions
    where mark_scheme ~ E'(?m)^[ \\t]*[-*][ \\t]+\\$[ \\t]*$'
  ) then
    raise exception 'Split list-item maths remains after repair';
  end if;
end
$$;
