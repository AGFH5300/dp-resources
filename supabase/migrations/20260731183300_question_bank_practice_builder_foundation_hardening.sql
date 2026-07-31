-- Follow-up hardening for the Question Bank practice-builder foundation.
-- Add the two foreign-key indexes identified by the production advisor and
-- prevent member-owned blocks from referencing hidden draft concepts.

set lock_timeout = '10s';
set statement_timeout = '180s';

create index if not exists dp_qb_practice_session_items_primary_block_idx
  on public.dp_qb_practice_session_items(primary_block_id, session_id)
  where primary_block_id is not null;

create index if not exists dp_qb_practice_session_items_question_idx
  on public.dp_qb_practice_session_items(question_id, session_id);

create or replace function private.dp_qb_validate_practice_set_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  block_count integer;
begin
  select count(*)
  into block_count
  from public.dp_qb_practice_set_blocks block
  where block.practice_set_id = new.practice_set_id
    and (tg_op = 'INSERT' or block.id <> new.id);

  if block_count >= 20 then
    raise exception 'A practice set can contain at most 20 blocks'
      using errcode = '23514';
  end if;

  if new.selection_type = 'concept' and not exists (
    select 1
    from public.dp_qb_concepts concept
    where concept.id = new.concept_id
      and concept.status = 'approved'
  ) then
    raise exception 'Concept block must reference an approved concept'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.dp_qb_validate_practice_set_block()
  from public;
