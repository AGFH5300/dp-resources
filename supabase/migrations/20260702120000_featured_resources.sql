create table if not exists public.dp_resource_featured_resources (
  drive_file_id text primary key references public.dp_resource_index(drive_file_id) on delete cascade,
  label text not null default 'Essential',
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dp_resource_featured_resources enable row level security;

drop policy if exists "authenticated users can read featured resources" on public.dp_resource_featured_resources;
create policy "authenticated users can read featured resources" on public.dp_resource_featured_resources
  for select to authenticated using (true);

drop policy if exists "admins can manage featured resources" on public.dp_resource_featured_resources;
create policy "admins can manage featured resources" on public.dp_resource_featured_resources
  for all to authenticated
  using (exists (select 1 from public.dp_resource_memberships m where m.id = auth.uid() and m.role = 'admin'))
  with check (exists (select 1 from public.dp_resource_memberships m where m.id = auth.uid() and m.role = 'admin'));

create index if not exists dp_resource_featured_resources_priority_idx
  on public.dp_resource_featured_resources (priority desc, label, drive_file_id);

insert into public.dp_resource_featured_resources (drive_file_id, label, priority)
select i.drive_file_id, 'Essential', 1000
from public.dp_resource_index i
where i.name = 'IB Revision Resource Library.xlsx'
  and i.is_folder = false
order by i.indexed_at desc nulls last
limit 1
on conflict (drive_file_id) do update
set label = excluded.label,
    priority = greatest(public.dp_resource_featured_resources.priority, excluded.priority),
    updated_at = now();
