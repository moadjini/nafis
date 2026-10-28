-- =============================================================================
-- Nafis notifications, safety and moderation
--   notifications (+ triggers), reports, moderation_audit_logs,
--   session/block/report/moderation RPCs
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Notifications. Rows never contain post or message text; the UI renders a
-- generic sentence and links to content that is re-authorised on open.
-- -----------------------------------------------------------------------------

create table public.notifications (
  id                 uuid primary key default gen_random_uuid(),
  recipient_id       uuid not null references public.profiles (id) on delete cascade,
  actor_id           uuid references public.profiles (id) on delete cascade,
  type               text not null,
  related_post_id    uuid references public.posts (id) on delete cascade,
  related_reply_id   uuid references public.replies (id) on delete cascade,
  related_session_id uuid references public.private_sessions (id) on delete cascade,
  data               jsonb not null default '{}'::jsonb,
  read_at            timestamptz,
  created_at         timestamptz not null default now(),
  constraint notifications_type check (type in (
    'post_reply', 'reply_reply', 'reaction_summary',
    'session_request', 'session_accepted', 'session_declined', 'session_cancelled', 'session_ended',
    'session_message', 'moderation_notice'
  ))
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;
create index notifications_post_idx on public.notifications (related_post_id) where related_post_id is not null;

create or replace function private.notify(
  p_recipient uuid,
  p_actor     uuid,
  p_type      text,
  p_post      uuid default null,
  p_reply     uuid default null,
  p_session   uuid default null,
  p_data      jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wants boolean;
begin
  if p_recipient is null or p_recipient = p_actor then
    return;
  end if;

  if p_actor is not null and private.is_blocked_between(p_recipient, p_actor) then
    return;
  end if;

  select case
           when p_type in ('post_reply', 'reply_reply') then coalesce(np.replies, true)
           when p_type = 'reaction_summary' then coalesce(np.reaction_summaries, true)
           when p_type like 'session\_%' then coalesce(np.sessions, true)
           else true
         end
    into v_wants
  from (select 1) as d
  left join public.notification_preferences np on np.user_id = p_recipient;

  if not v_wants then
    return;
  end if;

  if p_post is not null and p_type in ('post_reply', 'reply_reply') and exists (
    select 1 from public.muted_threads m where m.user_id = p_recipient and m.post_id = p_post
  ) then
    return;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, related_post_id, related_reply_id, related_session_id, data)
  values (p_recipient, p_actor, p_type, p_post, p_reply, p_session, coalesce(p_data, '{}'::jsonb));
end;
$$;

-- Reply notifications -------------------------------------------------------------

create or replace function private.replies_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_author   uuid;
  v_parent_author uuid;
begin
  select p.author_id into v_post_author from public.posts p where p.id = new.post_id;
  perform private.notify(v_post_author, new.author_id, 'post_reply', new.post_id, new.id);

  if new.parent_reply_id is not null then
    select r.author_id into v_parent_author from public.replies r where r.id = new.parent_reply_id;
    if v_parent_author is distinct from v_post_author then
      perform private.notify(v_parent_author, new.author_id, 'reply_reply', new.post_id, new.id);
    end if;
  end if;

  return new;
end;
$$;

create trigger replies_after_insert after insert on public.replies
  for each row execute function private.replies_after_insert();

-- Reaction summaries: at most one unread summary per post, and no new summary
-- within 12 hours of the previous one. Reactors are never named.
create or replace function private.reactions_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  select p.author_id into v_author from public.posts p where p.id = new.post_id;
  if v_author is null or v_author = new.user_id then
    return new;
  end if;

  update public.notifications n
     set data = jsonb_set(n.data, '{count}', to_jsonb(coalesce((n.data ->> 'count')::int, 0) + 1))
   where n.recipient_id = v_author
     and n.type = 'reaction_summary'
     and n.related_post_id = new.post_id
     and n.read_at is null;

  if not found and not exists (
    select 1 from public.notifications n
    where n.recipient_id = v_author
      and n.type = 'reaction_summary'
      and n.related_post_id = new.post_id
      and n.created_at > now() - interval '12 hours'
  ) then
    perform private.notify(v_author, null, 'reaction_summary', new.post_id, null, null, jsonb_build_object('count', 1));
  end if;

  return new;
end;
$$;

create trigger reactions_after_insert after insert on public.reactions
  for each row execute function private.reactions_after_insert();

-- Session message notifications (coalesced while unread) and accepted->active.
create or replace function private.private_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session   public.private_sessions%rowtype;
  v_recipient uuid;
begin
  select * into v_session from public.private_sessions s where s.id = new.session_id;

  if v_session.status = 'accepted' then
    update public.private_sessions set status = 'active' where id = new.session_id;
  end if;

  v_recipient := case when new.sender_id = v_session.requester_id then v_session.listener_id else v_session.requester_id end;

  if not exists (
    select 1 from public.notifications n
    where n.recipient_id = v_recipient
      and n.type = 'session_message'
      and n.related_session_id = new.session_id
      and n.read_at is null
  ) then
    perform private.notify(v_recipient, new.sender_id, 'session_message', null, null, new.session_id);
  end if;

  return new;
end;
$$;

create trigger private_messages_after_insert after insert on public.private_messages
  for each row execute function private.private_messages_after_insert();

-- Blocking cancels any open session between the two people.
create or replace function private.blocks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.private_sessions s
     set status = 'cancelled', end_reason = 'blocked', ended_by = new.blocker_id
   where s.status in ('requested', 'accepted', 'active')
     and (
       (s.requester_id = new.blocker_id and (s.listener_id = new.blocked_id or s.requested_listener_id = new.blocked_id))
       or (s.requester_id = new.blocked_id and (s.listener_id = new.blocker_id or s.requested_listener_id = new.blocker_id))
     );
  return new;
end;
$$;

create trigger blocks_after_insert after insert on public.blocks
  for each row execute function private.blocks_after_insert();

-- -----------------------------------------------------------------------------
-- Reports (no direct client access; created via public.create_report)
-- -----------------------------------------------------------------------------

create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references public.profiles (id) on delete set null,
  target_type     text not null,
  target_id       uuid not null,
  target_user_id  uuid references public.profiles (id) on delete set null,
  reason          text not null,
  details         text,
  status          text not null default 'open',
  resolution_note text,
  resolved_by     uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  constraint reports_target_type check (target_type in ('post', 'reply', 'user', 'session', 'message')),
  constraint reports_reason check (reason in (
    'harassment', 'hate', 'threat', 'self_harm_concern', 'spam', 'sexual_content', 'privacy', 'impersonation', 'other'
  )),
  constraint reports_details_length check (details is null or char_length(details) <= 1000),
  constraint reports_status check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  constraint reports_note_length check (resolution_note is null or char_length(resolution_note) <= 1000)
);

create unique index reports_one_open_per_reporter
  on public.reports (reporter_id, target_type, target_id)
  where status in ('open', 'reviewing');
create index reports_queue_idx on public.reports (status, created_at);
create index reports_target_idx on public.reports (target_type, target_id);

-- -----------------------------------------------------------------------------
-- Moderation audit log (append-only)
-- -----------------------------------------------------------------------------

create table public.moderation_audit_logs (
  id           uuid primary key default gen_random_uuid(),
  moderator_id uuid references public.profiles (id) on delete set null,
  action       text not null,
  target_type  text not null,
  target_id    uuid not null,
  reason       text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  constraint audit_action check (action in (
    'set_post_status', 'set_reply_status', 'update_report', 'suspend_user', 'lift_suspension'
  )),
  constraint audit_reason_length check (reason is null or char_length(reason) <= 1000)
);

create index moderation_audit_logs_created_idx on public.moderation_audit_logs (created_at desc);

create or replace function private.audit_logs_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The only permitted change is the FK action that nulls a deleted moderator.
  if tg_op = 'UPDATE'
     and new.moderator_id is null
     and old.moderator_id is not null
     and (to_jsonb(new) - 'moderator_id') = (to_jsonb(old) - 'moderator_id') then
    return new;
  end if;
  raise exception 'audit_log_immutable' using errcode = 'P0001';
end;
$$;

create trigger moderation_audit_logs_immutable
  before update or delete on public.moderation_audit_logs
  for each row execute function private.audit_logs_immutable();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_audit_logs enable row level security;

create policy "notifications: recipient can read"
  on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));

create policy "notifications: recipient can mark read"
  on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create policy "notifications: recipient can delete"
  on public.notifications for delete to authenticated
  using (recipient_id = (select auth.uid()));

-- reports: intentionally no policies for authenticated users.

create policy "moderation_audit_logs: moderators can read"
  on public.moderation_audit_logs for select to authenticated
  using (private.is_moderator());

-- =============================================================================
-- RPCs: listening sessions
-- =============================================================================

create or replace function public.request_listening_session(
  p_language        text,
  p_topic           text default null,
  p_intro           text default null,
  p_listener_handle text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_listener uuid;
  v_open     integer;
  v_id       uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if not private.can_participate(v_uid) then
    raise exception 'suspended' using errcode = 'P0001';
  end if;

  perform private.enforce_rate_limit('session_request', 6, interval '1 hour');

  select count(*) into v_open
  from public.private_sessions s
  where s.requester_id = v_uid and s.status = 'requested' and s.created_at > now() - interval '7 days';
  if v_open >= 3 then
    raise exception 'too_many_open_requests' using errcode = 'P0001';
  end if;

  if nullif(btrim(p_listener_handle), '') is not null then
    select p.id into v_listener
    from public.profiles p
    join public.listening_preferences lp on lp.user_id = p.id
    where p.handle = lower(btrim(p_listener_handle))
      and lp.available
      and p.id <> v_uid;

    if v_listener is null
       or private.is_blocked_between(v_uid, v_listener)
       or not private.can_participate(v_listener) then
      raise exception 'listener_unavailable' using errcode = 'P0001';
    end if;

    if exists (
      select 1 from public.private_sessions s
      where s.requester_id = v_uid
        and (s.requested_listener_id = v_listener or s.listener_id = v_listener)
        and s.status in ('requested', 'accepted', 'active')
    ) then
      raise exception 'duplicate_request' using errcode = 'P0001';
    end if;
  end if;

  insert into public.private_sessions (requester_id, requested_listener_id, language, topic, intro)
  values (v_uid, v_listener, p_language, nullif(btrim(p_topic), ''), nullif(btrim(p_intro), ''))
  returning id into v_id;

  if v_listener is not null then
    perform private.notify(v_listener, v_uid, 'session_request', null, null, v_id);
  end if;

  return v_id;
end;
$$;

-- Returns 'accepted', 'declined' or 'expired'.
create or replace function public.respond_to_session(p_session_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_s   public.private_sessions%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_s from public.private_sessions s where s.id = p_session_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_s.status <> 'requested' then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if v_s.requester_id = v_uid then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if v_s.requested_listener_id is not null then
    if v_s.requested_listener_id <> v_uid then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
  else
    if not p_accept then
      raise exception 'not_allowed' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from public.listening_preferences lp
      where lp.user_id = v_uid and lp.available and v_s.language = any (lp.languages)
    ) then
      raise exception 'not_allowed' using errcode = 'P0001';
    end if;
  end if;

  if private.is_blocked_between(v_uid, v_s.requester_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not private.can_participate(v_uid) then
    raise exception 'suspended' using errcode = 'P0001';
  end if;

  if v_s.created_at < now() - interval '7 days' then
    update public.private_sessions set status = 'cancelled', end_reason = 'expired' where id = v_s.id;
    return 'expired';
  end if;

  if p_accept then
    update public.private_sessions set status = 'accepted', listener_id = v_uid where id = v_s.id;
    perform private.notify(v_s.requester_id, v_uid, 'session_accepted', null, null, v_s.id);
    return 'accepted';
  end if;

  update public.private_sessions
     set status = 'cancelled', end_reason = 'declined', ended_by = v_uid
   where id = v_s.id;
  perform private.notify(v_s.requester_id, null, 'session_declined', null, null, v_s.id);
  return 'declined';
end;
$$;

-- Requester withdraws a pending request.
create or replace function public.cancel_session_request(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_s   public.private_sessions%rowtype;
begin
  select * into v_s from public.private_sessions s where s.id = p_session_id for update;
  if not found or v_s.requester_id is distinct from v_uid then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_s.status <> 'requested' then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  update public.private_sessions
     set status = 'cancelled', end_reason = 'withdrawn', ended_by = v_uid
   where id = v_s.id;

  if v_s.requested_listener_id is not null then
    perform private.notify(v_s.requested_listener_id, null, 'session_cancelled', null, null, v_s.id);
  end if;
end;
$$;

-- Either participant ends an accepted/active session.
create or replace function public.end_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_s     public.private_sessions%rowtype;
  v_other uuid;
begin
  select * into v_s from public.private_sessions s where s.id = p_session_id for update;
  if not found or v_uid is null or v_uid not in (v_s.requester_id, coalesce(v_s.listener_id, v_s.requester_id)) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_s.status not in ('accepted', 'active') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  update public.private_sessions
     set status = 'completed', end_reason = 'ended', ended_by = v_uid
   where id = v_s.id;

  v_other := case when v_uid = v_s.requester_id then v_s.listener_id else v_s.requester_id end;
  perform private.notify(v_other, null, 'session_ended', null, null, v_s.id);
end;
$$;

-- =============================================================================
-- RPCs: blocking
-- =============================================================================

create or replace function public.block_user(p_handle text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_target uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  perform private.enforce_rate_limit('block', 30, interval '1 hour');

  select p.id into v_target from public.profiles p where p.handle = lower(btrim(p_handle));
  if v_target is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_target = v_uid then
    raise exception 'cannot_block_self' using errcode = 'P0001';
  end if;

  insert into public.blocks (blocker_id, blocked_id) values (v_uid, v_target)
  on conflict do nothing;

  -- Stop the blocked person's thread notifications from reaching the blocker.
  delete from public.notifications n where n.recipient_id = v_uid and n.actor_id = v_target;
end;
$$;

create or replace function public.unblock_user(p_handle text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  delete from public.blocks b
  using public.profiles p
  where b.blocker_id = auth.uid()
    and b.blocked_id = p.id
    and p.handle = lower(btrim(p_handle));
end;
$$;

-- =============================================================================
-- RPCs: reporting
-- =============================================================================

create or replace function public.create_report(
  p_target_type   text,
  p_reason        text,
  p_target_id     uuid default null,
  p_target_handle text default null,
  p_details       text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_tid   uuid := p_target_id;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  perform private.enforce_rate_limit('report', 20, interval '1 hour');

  if p_target_type = 'post' then
    select p.author_id into v_owner from public.posts p
    where p.id = v_tid and private.can_view_post(p.id);
  elsif p_target_type = 'reply' then
    select r.author_id into v_owner from public.replies r
    where r.id = v_tid and private.can_view_reply(r.id);
  elsif p_target_type = 'user' then
    select p.id into v_owner from public.profiles p where p.handle = lower(btrim(p_target_handle));
    v_tid := v_owner;
  elsif p_target_type = 'session' then
    select case when s.requester_id = v_uid then coalesce(s.listener_id, s.requested_listener_id) else s.requester_id end
      into v_owner
    from public.private_sessions s
    where s.id = v_tid and v_uid in (s.requester_id, s.listener_id, s.requested_listener_id);
  elsif p_target_type = 'message' then
    select m.sender_id into v_owner
    from public.private_messages m
    join public.private_sessions s on s.id = m.session_id
    where m.id = v_tid and (s.requester_id = v_uid or s.listener_id = v_uid);
  else
    raise exception 'invalid_target' using errcode = 'P0001';
  end if;

  if v_owner is null or v_tid is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_owner = v_uid then
    raise exception 'cannot_report_self' using errcode = 'P0001';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, target_user_id, reason, details)
  values (v_uid, p_target_type, v_tid, v_owner, p_reason, nullif(btrim(p_details), ''))
  on conflict (reporter_id, target_type, target_id) where status in ('open', 'reviewing') do nothing;
end;
$$;

-- =============================================================================
-- RPCs: moderation (every function re-checks the caller's role)
-- =============================================================================

create or replace function public.mod_list_reports(p_status text default 'open', p_limit integer default 50)
returns table (
  id                     uuid,
  target_type            text,
  target_id              uuid,
  reason                 text,
  details                text,
  status                 text,
  created_at             timestamptz,
  resolved_at            timestamptz,
  resolution_note        text,
  open_reports_on_target integer,
  target_excerpt         text,
  target_status          text,
  target_author_handle   text,
  target_post_id         uuid,
  target_is_voice        boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.is_moderator() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  return query
  select
    r.id, r.target_type, r.target_id, r.reason, r.details, r.status, r.created_at, r.resolved_at, r.resolution_note,
    (select count(*)::int from public.reports r2
      where r2.target_type = r.target_type and r2.target_id = r.target_id and r2.status in ('open', 'reviewing')),
    case r.target_type
      when 'post'    then (select left(coalesce(p.content, p.caption, ''), 600) from public.posts p where p.id = r.target_id)
      when 'reply'   then (select left(x.content, 600) from public.replies x where x.id = r.target_id)
      when 'message' then (select left(m.content, 600) from public.private_messages m where m.id = r.target_id)
      when 'user'    then (select pr.display_name || coalesce(' — ' || pr.bio, '') from public.profiles pr where pr.id = r.target_id)
      else null
    end,
    case r.target_type
      when 'post'  then (select p.status from public.posts p where p.id = r.target_id)
      when 'reply' then (select x.status from public.replies x where x.id = r.target_id)
      else null
    end,
    (select pr.handle from public.profiles pr where pr.id = r.target_user_id),
    case r.target_type
      when 'post'  then r.target_id
      when 'reply' then (select x.post_id from public.replies x where x.id = r.target_id)
      else null
    end,
    case when r.target_type = 'post'
      then coalesce((select p.post_type = 'voice' from public.posts p where p.id = r.target_id), false)
      else false
    end
  from public.reports r
  where case
          when p_status = 'open' then r.status in ('open', 'reviewing')
          when p_status = 'all' then true
          else r.status = p_status
        end
  order by (r.reason in ('self_harm_concern', 'threat')) desc, r.created_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

create or replace function public.mod_set_content_status(
  p_target_type text,
  p_target_id   uuid,
  p_status      text,
  p_reason      text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
  v_post   uuid;
begin
  if not private.is_moderator() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_status not in ('active', 'hidden', 'removed') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;

  if p_target_type = 'post' then
    update public.posts set status = p_status where id = p_target_id
    returning author_id, id into v_author, v_post;
  elsif p_target_type = 'reply' then
    update public.replies set status = p_status where id = p_target_id
    returning author_id, post_id into v_author, v_post;
  else
    raise exception 'invalid_target' using errcode = 'P0001';
  end if;

  if v_author is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  insert into public.moderation_audit_logs (moderator_id, action, target_type, target_id, reason, metadata)
  values (auth.uid(), 'set_' || p_target_type || '_status', p_target_type, p_target_id,
          nullif(btrim(p_reason), ''), jsonb_build_object('status', p_status));

  perform private.notify(
    v_author, null, 'moderation_notice', v_post,
    case when p_target_type = 'reply' then p_target_id end, null,
    jsonb_build_object('target_type', p_target_type, 'status', p_status)
  );
end;
$$;

create or replace function public.mod_update_report(p_report_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_moderator() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_status not in ('reviewing', 'resolved', 'dismissed') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;

  update public.reports
     set status = p_status,
         resolution_note = coalesce(nullif(btrim(p_note), ''), resolution_note),
         resolved_by = case when p_status in ('resolved', 'dismissed') then auth.uid() else resolved_by end,
         resolved_at = case when p_status in ('resolved', 'dismissed') then now() else null end
   where id = p_report_id;

  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  insert into public.moderation_audit_logs (moderator_id, action, target_type, target_id, reason, metadata)
  values (auth.uid(), 'update_report', 'report', p_report_id, nullif(btrim(p_note), ''), jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.mod_suspend_user(p_handle text, p_days integer, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
begin
  if not private.is_moderator() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select p.id into v_target from public.profiles p where p.handle = lower(btrim(p_handle));
  if v_target is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_target = auth.uid() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if coalesce(p_days, 0) <= 0 then
    delete from public.account_restrictions where user_id = v_target;
    insert into public.moderation_audit_logs (moderator_id, action, target_type, target_id, reason)
    values (auth.uid(), 'lift_suspension', 'user', v_target, nullif(btrim(p_reason), ''));
    return;
  end if;

  insert into public.account_restrictions (user_id, suspended_until, reason, created_by)
  values (v_target, now() + make_interval(days => least(p_days, 3650)), nullif(btrim(p_reason), ''), auth.uid())
  on conflict (user_id) do update
    set suspended_until = excluded.suspended_until,
        reason = excluded.reason,
        created_by = excluded.created_by,
        created_at = now();

  insert into public.moderation_audit_logs (moderator_id, action, target_type, target_id, reason, metadata)
  values (auth.uid(), 'suspend_user', 'user', v_target, nullif(btrim(p_reason), ''), jsonb_build_object('days', p_days));

  perform private.notify(v_target, null, 'moderation_notice', null, null, null,
                         jsonb_build_object('target_type', 'account', 'status', 'suspended', 'days', p_days));
end;
$$;

create or replace function public.mod_list_audit_logs(p_limit integer default 100)
returns table (
  id              uuid,
  moderator_handle text,
  action          text,
  target_type     text,
  target_id       uuid,
  reason          text,
  metadata        jsonb,
  created_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.is_moderator() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  return query
  select l.id, p.handle, l.action, l.target_type, l.target_id, l.reason, l.metadata, l.created_at
  from public.moderation_audit_logs l
  left join public.profiles p on p.id = l.moderator_id
  order by l.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;
