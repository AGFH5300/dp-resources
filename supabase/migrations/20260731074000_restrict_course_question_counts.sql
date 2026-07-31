-- Supabase grants newly created public functions to its API roles by default.
-- Keep this member-only RPC unavailable to anonymous sessions; the function also
-- performs its own authenticated Question Bank access check.

revoke execute on function public.dp_qb_course_question_counts() from anon;
grant execute on function public.dp_qb_course_question_counts() to authenticated;
