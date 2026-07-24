-- PL/pgSQL trigger records should be returned explicitly for DELETE operations.
create or replace function private.dp_qb_audit_variant_asset_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_variant_id uuid;
begin
  if tg_op = 'DELETE' then
    target_variant_id := old.variant_id;
  else
    target_variant_id := new.variant_id;
  end if;

  perform private.dp_qb_audit_variant(target_variant_id);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.dp_qb_audit_variant_asset_change() from public;
