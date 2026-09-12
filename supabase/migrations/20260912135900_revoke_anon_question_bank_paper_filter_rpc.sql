-- Supabase function defaults may grant EXECUTE to anon when a function is recreated.
-- Keep the Question Bank RPC behind membership authentication at the privilege layer.
revoke execute on function public.dp_qb_list_questions(
  uuid, text, uuid, uuid, text, uuid, text, boolean, text, boolean, boolean,
  integer, integer, text[], integer, text
) from anon;

revoke execute on function public.dp_qb_list_questions(
  uuid, text, uuid, uuid, text, uuid, text, boolean, text, boolean, boolean,
  integer, integer, text[], integer, text
) from public;
