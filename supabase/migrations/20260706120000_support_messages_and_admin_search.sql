create table if not exists public.dp_support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.dp_support_tickets(id) on delete cascade,
  author_id uuid null references auth.users(id) on delete set null,
  author_role text not null check (author_role in ('admin','system')),
  body text not null,
  created_at timestamptz not null default now(),
  visibility text not null default 'user' check (visibility in ('user','internal'))
);
alter table public.dp_support_ticket_messages enable row level security;
drop policy if exists "support ticket messages owner visible read" on public.dp_support_ticket_messages;
create policy "support ticket messages owner visible read" on public.dp_support_ticket_messages for select to authenticated using (visibility = 'user' and exists (select 1 from public.dp_support_tickets t where t.id = ticket_id and t.reporter_id = auth.uid()));
drop policy if exists "support ticket messages admin read" on public.dp_support_ticket_messages;
create policy "support ticket messages admin read" on public.dp_support_ticket_messages for select to authenticated using (exists (select 1 from public.dp_resource_memberships m where m.id = auth.uid() and m.role = 'admin'));
drop policy if exists "support ticket messages admin insert" on public.dp_support_ticket_messages;
create policy "support ticket messages admin insert" on public.dp_support_ticket_messages for insert to authenticated with check (exists (select 1 from public.dp_resource_memberships m where m.id = auth.uid() and m.role = 'admin'));
create index if not exists dp_support_ticket_messages_ticket_created_idx on public.dp_support_ticket_messages(ticket_id, created_at);
create index if not exists dp_support_ticket_messages_user_visible_idx on public.dp_support_ticket_messages(ticket_id, visibility, created_at);
create index if not exists dp_memberships_lower_email_idx on public.dp_resource_memberships(lower(email));
create index if not exists dp_activity_user_created_idx on public.dp_resource_activity_logs(user_id, created_at desc);
create index if not exists dp_reports_search_idx on public.dp_resource_reports(reporter_email, created_at desc);
create index if not exists dp_tickets_search_idx on public.dp_support_tickets(reporter_email, created_at desc);
