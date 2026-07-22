-- Harden question-bank RPC privileges after production verification.
revoke execute on function public.dp_qb_list_questions(
  uuid, text, uuid, uuid, text, uuid, text, boolean, text, boolean, boolean, integer, integer
) from anon;
revoke execute on function public.dp_qb_search_questions(text, integer, integer) from anon;
revoke execute on function public.dp_qb_question_neighbors(uuid) from anon;
