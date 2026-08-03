set lock_timeout = '10s';
set statement_timeout = '30s';

do $$
begin
  if (select count(*) from public.dp_qb_asset_deletion_queue) <> 1034
     or exists (
       select 1 from public.dp_qb_asset_deletion_queue where deleted_at is null
     ) then
    raise exception 'Retired Question Bank assets are not fully verified';
  end if;
end;
$$;

drop table public.dp_qb_asset_deletion_queue;
