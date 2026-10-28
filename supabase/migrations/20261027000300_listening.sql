-- =============================================================================
-- Nafis listening space
--   listening_preferences, private_sessions, private_messages
--
-- Session lifecycle:
--   requested -> accepted  (listener accepts; listener_id is set)
--   requested -> cancelled (requester withdraws / targeted listener declines /
--                           block / expiry)
--   accepted  -> active    (first message is sent)
--   accepted  -> completed | cancelled
--   active    -> completed | cancelled
--   completed and cancelled are terminal.
-- All transitions happen through SECURITY DEFINER RPCs; clients have no direct
-- insert/update access to private_sessions.
-- =============================================================================

create table public.listening_preferences (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  available  boolean not null default false,
  languages  text[] not null default '{en}',
  topics     text[] not null default '{}',
  note       text,
  updated_at timestamptz not null default now(),
  constraint listening_languages check (
    cardinality(languages) between 1 and 3 and languages <@ array['en', 'so', 'other']::text[]
  ),
  constraint listening_topics check (cardinality(topics) <= 20 and private.are_valid_topics(topics)),
  constraint listening_note_length check (note is null or char_length(note) <= 200)
);

create index listening_available_idx on public.listening_preferences (updated_at desc) where available;

create trigger listening_preferences_touch
  before update on public.listening_preferences
  for each row execute function private.touch_updated_at();

create table public.private_sessions (
  id                    uuid primary key default gen_random_uuid(),
  requester_id          uuid not null references public.profiles (id) on delete cascade,
  requested_listener_id uuid references public.profiles (id) on delete cascade,
  listener_id           uuid references public.profiles (id) on delete cascade,
  status                text not null default 'requested',
  end_reason            text,
  ended_by              uuid references public.profiles (id) on delete set null,
  language              text not null,
  topic                 text,
  intro                 text,
  accepted_at           timestamptz,
  ended_at              timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint sessions_status check (status in ('requested', 'accepted', 'active', 'completed', 'cancelled')),
  constraint sessions_end_reason check (
    end_reason is null or end_reason in ('declined', 'withdrawn', 'ended', 'blocked', 'expired', 'moderation')
  ),
  constraint sessions_language check (language in ('en', 'so', 'other')),
  constraint sessions_topic check (topic is null or private.is_valid_topic(topic)),
  constraint sessions_intro_length check (intro is null or char_length(intro) <= 500),
  constraint sessions_not_self check (
    requester_id <> coalesce(listener_id, requested_listener_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ),
  constraint sessions_listener_matches_target check (
    requested_listener_id is null or listener_id is null or listener_id = requested_listener_id
  ),
  constraint sessions_listener_state check (
    (status = 'requested' and listener_id is null)
    or (status in ('accepted', 'active', 'completed') and listener_id is not null)
    or status = 'cancelled'
  )
);

create index sessions_requester_idx on public.private_sessions (requester_id, created_at desc);
create index sessions_listener_idx on public.private_sessions (listener_id, created_at desc);
create index sessions_targeted_idx on public.private_sessions (requested_listener_id, created_at desc)
  where requested_listener_id is not null;
create index sessions_open_pool_idx on public.private_sessions (language, created_at)
  where status = 'requested' and requested_listener_id is null;

create or replace function private.sessions_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.requester_id is distinct from old.requester_id
     or new.requested_listener_id is distinct from old.requested_listener_id
     or (old.listener_id is not null and new.listener_id is distinct from old.listener_id)
     or new.created_at is distinct from old.created_at
     or new.language is distinct from old.language then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status then
    if not (
         (old.status = 'requested' and new.status in ('accepted', 'cancelled'))
      or (old.status = 'accepted'  and new.status in ('active', 'completed', 'cancelled'))
      or (old.status = 'active'    and new.status in ('completed', 'cancelled'))
    ) then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;

    if new.status in ('completed', 'cancelled') then
      new.ended_at := now();
    end if;
    if new.status = 'accepted' then
      new.accepted_at := now();
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger sessions_before_update before update on public.private_sessions
  for each row execute function private.sessions_before_update();

create table public.private_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.private_sessions (id) on delete cascade,
  sender_id  uuid not null references public.profiles (id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now(),
  constraint private_messages_length check (char_length(btrim(content)) between 1 and 2000)
);

create index private_messages_session_idx on public.private_messages (session_id, created_at, id);
create index private_messages_sender_idx on public.private_messages (sender_id);

-- Predicates -----------------------------------------------------------------

create or replace function private.is_session_participant(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.private_sessions s
    where s.id = p_session_id
      and auth.uid() is not null
      and (s.requester_id = auth.uid() or s.listener_id = auth.uid())
  );
$$;

create or replace function private.can_send_session_message(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_participate()
     and exists (
       select 1 from public.private_sessions s
       where s.id = p_session_id
         and s.status in ('accepted', 'active')
         and (s.requester_id = auth.uid() or s.listener_id = auth.uid())
         and not private.is_blocked_between(s.requester_id, s.listener_id)
     );
$$;

create or replace function private.private_messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enforce_rate_limit('session_message', 30, interval '1 minute');
  new.created_at := now();
  return new;
end;
$$;

create trigger private_messages_before_insert before insert on public.private_messages
  for each row execute function private.private_messages_before_insert();

-- Row Level Security --------------------------------------------------------------

alter table public.listening_preferences enable row level security;
alter table public.private_sessions enable row level security;
alter table public.private_messages enable row level security;

create policy "listening_preferences: owner can read"
  on public.listening_preferences for select to authenticated
  using (user_id = (select auth.uid()));

create policy "listening_preferences: owner can insert"
  on public.listening_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "listening_preferences: owner can update"
  on public.listening_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "private_sessions: participants can read"
  on public.private_sessions for select to authenticated
  using (
    requester_id = (select auth.uid())
    or listener_id = (select auth.uid())
    or requested_listener_id = (select auth.uid())
  );

create policy "private_messages: participants can read"
  on public.private_messages for select to authenticated
  using (private.is_session_participant(session_id));

create policy "private_messages: participants can send in open sessions"
  on public.private_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and private.can_send_session_message(session_id));
