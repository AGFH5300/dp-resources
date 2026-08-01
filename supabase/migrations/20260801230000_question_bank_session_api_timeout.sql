-- PostgREST connections inherit the authenticator role's 8-second statement timeout.
-- Large, fully validated fixed queues can legitimately take longer than that even
-- after the write path is optimized, so keep the mutation's own bounded timeout.

alter function public.dp_qb_create_practice_session(
  uuid, jsonb, text, text, text, jsonb
) set statement_timeout = '2min';

comment on function public.dp_qb_create_practice_session(
  uuid, jsonb, text, text, text, jsonb
) is
  'Atomically validates and creates a fixed practice queue. The function uses a two-minute local statement timeout so large service-role RPC calls are not canceled by PostgREST authenticator defaults.';
