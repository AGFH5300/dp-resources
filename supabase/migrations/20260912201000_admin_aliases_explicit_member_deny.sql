-- Keep Admin-only aliases inaccessible even if future table grants change.
-- service_role bypasses RLS and remains the only application role with table access.

create policy "admin aliases are never member visible"
on public.dp_admin_user_aliases
for all
to anon, authenticated
using (false)
with check (false);
