-- Keep a single active unread notification for each user's support ticket.
-- Admins can update a status and add a public reply within seconds; those actions
-- should appear as one pending ticket update rather than two or three badge items.

with ranked as (
  select
    id,
    row_number() over (
      partition by recipient_id, support_ticket_id
      order by created_at desc, id desc
    ) as unread_rank
  from public.dp_notifications
  where audience = 'user'
    and support_ticket_id is not null
    and read_at is null
    and kind in ('ticket_reply', 'ticket_status')
)
update public.dp_notifications as notification
set read_at = now()
from ranked
where notification.id = ranked.id
  and ranked.unread_rank > 1;

create unique index if not exists dp_notifications_one_unread_ticket_idx
  on public.dp_notifications (recipient_id, support_ticket_id)
  where audience = 'user'
    and support_ticket_id is not null
    and read_at is null
    and kind in ('ticket_reply', 'ticket_status');

create or replace function private.dp_upsert_user_ticket_notification(
  p_recipient_id uuid,
  p_kind text,
  p_title text,
  p_message text,
  p_href text,
  p_support_ticket_id uuid
)
returns void
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
    support_ticket_id,
    created_at,
    read_at
  )
  values (
    p_recipient_id,
    'user',
    p_kind,
    left(p_title, 120),
    left(p_message, 500),
    p_href,
    p_support_ticket_id,
    now(),
    null
  )
  on conflict (recipient_id, support_ticket_id)
  where audience = 'user'
    and support_ticket_id is not null
    and read_at is null
    and kind in ('ticket_reply', 'ticket_status')
  do update set
    kind = excluded.kind,
    title = excluded.title,
    message = excluded.message,
    href = excluded.href,
    created_at = excluded.created_at,
    read_at = null;
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

  perform private.dp_upsert_user_ticket_notification(
    ticket.reporter_id,
    'ticket_reply',
    'Admin replied to your ticket',
    coalesce(
      nullif(btrim(ticket.subject), ''),
      'Your support ticket has a new reply.'
    ),
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

  -- A public reply can automatically move a new ticket to in-review. When the
  -- reply already exists, its notification explains the same activity better.
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

  perform private.dp_upsert_user_ticket_notification(
    new.reporter_id,
    'ticket_status',
    'Ticket status updated',
    old_label || ' → ' || new_label || ': ' || coalesce(
      nullif(btrim(new.subject), ''),
      'Support ticket'
    ),
    '/support?ticket=' || new.id::text,
    new.id
  );

  return new;
end;
$$;

revoke all on function private.dp_upsert_user_ticket_notification(
  uuid,
  text,
  text,
  text,
  text,
  uuid
) from public, anon, authenticated;
revoke all on function private.dp_notify_ticket_reply() from public, anon, authenticated;
revoke all on function private.dp_notify_ticket_status_change() from public, anon, authenticated;
