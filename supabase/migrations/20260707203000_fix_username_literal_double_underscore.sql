create or replace function public.dp_identity_validate_username(p_username text)
returns text language plpgsql immutable as $$
begin
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,24}$' or p_username ~ '^_' or p_username ~ '_$' or position('__' in p_username) > 0 then return 'invalid_format'; end if;
  if public.dp_identity_is_reserved_username(p_username) then return 'reserved_name'; end if;
  if public.dp_identity_has_disallowed_text(p_username) then return 'identity_not_allowed'; end if;
  return null;
end;
$$;
