create table if not exists public.dp_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  audience text not null check (audience in ('user', 'admin')),
  kind text not null check (
    kind in (
      'support_ticket_created',
      'resource_report_created',
      'ticket_reply',
      'ticket_status'
    )
  ),
  title text not null check (char_length(title) between 1 and 120),
  message text not null check (char_length(message) between 1 and 500),
  href text not null check (href like '/%' and href not like '//%'),
  support_ticket_id uuid null references public.dp_support_tickets(id) on delete cascade,
  resource_report_id uuid null references public.dp_resource_reports(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz null
);

alter table public.dp_notifications enable row level security;

drop policy if exists "notifications owner read" on public.dp_notifications;
create policy "notifications owner read"
on public.dp_notifications
for select
to authenticated
using ((select auth.uid()) = recipient_id);

drop policy if exists "notifications owner mark read" on public.dp_notifications;
create policy "notifications owner mark read"
on public.dp_notifications
for update
to authenticated
using ((select auth.uid()) = recipient_id)
with check ((select auth.uid()) = recipient_id);

revoke all on table public.dp_notifications from anon, authenticated;
grant select on table public.dp_notifications to authenticated;
grant update (read_at) on table public.dp_notifications to authenticated;

create index if not exists dp_notifications_recipient_created_idx
  on public.dp_notifications (recipient_id, created_at desc);
create index if not exists dp_notifications_recipient_unread_idx
  on public.dp_notifications (recipient_id, created_at desc)
  where read_at is null;

create schema if not exists private;

create or replace function private.dp_notify_admins_of_support_ticket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.dp_notifications (
    recipient_id,
    audience,
    kind,
    title,
    message,
    href,
    support_ticket_id
  )
  select
    membership.id,
    'admin',
    'support_ticket_created',
    'New support ticket',
    left(coalesce(nullif(btrim(new.subject), ''), 'A user submitted a support request.'), 500),
    '/admin?section=tickets&ticketId=' || new.id::text,
    new.id
  from public.dp_resource_memberships as membership
  where membership.role = 'admin'
    and membership.is_approved = true
    and membership.is_suspended = false;

  return new;
end;
$$;

create or replace function private.dp_notify_admins_of_resource_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.dp_notifications (
    recipient_id,
    audience,
    kind,
    title,
    message,
    href,
    resource_report_id
  )
  select
    membership.id,
    'admin',
    'resource_report_created',
    'New resource report',
    left(
      coalesce(
        nullif(btrim(new.resource_name), ''),
        nullif(btrim(new.category), ''),
        'A user reported a resource.'
      ),
      500
    ),
    '/admin?section=reports&reportId=' || new.id::text,
    new.id
  from public.dp_resource_memberships as membership
  where membership.role = 'admin'
    and membership.is_approved = true
    and membership.is_suspended = false;

  return new;
end;
$$;

create or replace function private.dp_notify_ticket_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ticket public.dp_support_tickets%rowtype;
begin
  if new.visibility <> 'user' then
    return new;
  end if;

  select * into ticket
  from public.dp_support_tickets
  where id = new.ticket_id;

  if ticket.id is null then
    return new;
  end if;

  insert into public.dp_notifications (
    recipient_id,
    audience,
    kind,
    title,
    message,
    href,
    support_ticket_id
  )
  values (
    ticket.reporter_id,
    'user',
    'ticket_reply',
    'Admin replied to your ticket',
    left(coalesce(nullif(btrim(ticket.subject), ''), 'Your support ticket has a new reply.'), 500),
    '/support?ticket=' || ticket.id::text,
    ticket.id
  );

  return new;
end;
$$;

create or replace function private.dp_notify_ticket_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_label text;
  new_label text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- A public reply automatically moves a new ticket to in-review. The reply
  -- notification already explains that event, so avoid sending two alerts.
  if old.status = 'open'
    and new.status = 'in_review'
    and exists (
      select 1
      from public.dp_support_ticket_messages as message
      where message.ticket_id = new.id
        and message.visibility = 'user'
        and message.created_at >= statement_timestamp() - interval '10 seconds'
    )
  then
    return new;
  end if;

  old_label := case old.status
    when 'open' then 'Received'
    when 'in_review' then 'Being reviewed'
    when 'resolved' then 'Resolved'
    when 'closed' then 'Closed'
    else initcap(replace(old.status, '_', ' '))
  end;
  new_label := case new.status
    when 'open' then 'Received'
    when 'in_review' then 'Being reviewed'
    when 'resolved' then 'Resolved'
    when 'closed' then 'Closed'
    else initcap(replace(new.status, '_', ' '))
  end;

  insert into public.dp_notifications (
    recipient_id,
    audience,
    kind,
    title,
    message,
    href,
    support_ticket_id
  )
  values (
    new.reporter_id,
    'user',
    'ticket_status',
    'Ticket status updated',
    left(old_label || ' → ' || new_label || ': ' || coalesce(nullif(btrim(new.subject), ''), 'Support ticket'), 500),
    '/support?ticket=' || new.id::text,
    new.id
  );

  return new;
end;
$$;

revoke all on function private.dp_notify_admins_of_support_ticket() from public, anon, authenticated;
revoke all on function private.dp_notify_admins_of_resource_report() from public, anon, authenticated;
revoke all on function private.dp_notify_ticket_reply() from public, anon, authenticated;
revoke all on function private.dp_notify_ticket_status_change() from public, anon, authenticated;

drop trigger if exists dp_notify_admins_of_support_ticket on public.dp_support_tickets;
create trigger dp_notify_admins_of_support_ticket
after insert on public.dp_support_tickets
for each row execute function private.dp_notify_admins_of_support_ticket();

drop trigger if exists dp_notify_admins_of_resource_report on public.dp_resource_reports;
create trigger dp_notify_admins_of_resource_report
after insert on public.dp_resource_reports
for each row execute function private.dp_notify_admins_of_resource_report();

drop trigger if exists dp_notify_ticket_reply on public.dp_support_ticket_messages;
create trigger dp_notify_ticket_reply
after insert on public.dp_support_ticket_messages
for each row execute function private.dp_notify_ticket_reply();

drop trigger if exists dp_notify_ticket_status_change on public.dp_support_tickets;
create trigger dp_notify_ticket_status_change
after update of status on public.dp_support_tickets
for each row execute function private.dp_notify_ticket_status_change();
