update public.dp_qb_questions
set content = replace(
      content,
      'Supporting image unavailable in the authorized archive.',
      'This supporting image is currently unavailable.'
    )
where content like '%Supporting image unavailable in the authorized archive.%';

update public.dp_qb_questions
set mark_scheme = replace(
      mark_scheme,
      'Supporting image unavailable in the authorized archive.',
      'This supporting image is currently unavailable.'
    )
where mark_scheme like '%Supporting image unavailable in the authorized archive.%';
