-- =============================================================================
-- Nafis read API
-- SECURITY DEFINER read functions that apply visibility, moderation and block
-- rules in one place and never return internal account ids of other people.
-- Counts are always computed from persisted rows.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Posts (feed, explore, single post, bookmarks, author page, own drafts)
-- -----------------------------------------------------------------------------

create or replace function public.get_posts(
  p_limit         integer default 20,
  p_cursor_at     timestamptz default null,
  p_cursor_id     uuid default null,
  p_post_type     text default null,
  p_topic         text default null,
  p_language      text default null,
  p_seeking       boolean default false,
  p_author_handle text default null,
  p_bookmarked    boolean default false,
  p_post_id       uuid default null,
  p_drafts        boolean default false
)
returns table (
  id                     uuid,
  post_type              text,
  content                text,
  caption                text,
  audio_duration_seconds integer,
  language               text,
  topic                  text,
  response_preference    text,
  visibility             text,
  status                 text,
  created_at             timestamptz,
  published_at           timestamptz,
  edited_at              timestamptz,
  sort_at                timestamptz,
  author_handle          text,
  author_display_name    text,
  author_avatar_key      text,
  is_mine                boolean,
  reply_count            integer,
  reactions              jsonb,
  my_reaction            text,
  is_bookmarked          boolean,
  is_muted               boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select auth.uid() as uid,
           coalesce((select pr.hidden_topics from public.profiles pr where pr.id = auth.uid()), '{}'::text[]) as hidden
  )
  select
    p.id, p.post_type, p.content, p.caption, p.audio_duration_seconds, p.language, p.topic,
    p.response_preference, p.visibility, p.status, p.created_at, p.published_at, p.edited_at,
    case when p_drafts then p.updated_at else coalesce(p.published_at, p.created_at) end as sort_at,
    a.handle, a.display_name, a.avatar_key,
    p.author_id = v.uid,
    (select count(*)::int from public.replies r
      where r.post_id = p.id and r.status = 'active'
        and not exists (select 1 from public.blocks b
                        where (b.blocker_id = v.uid and b.blocked_id = r.author_id)
                           or (b.blocker_id = r.author_id and b.blocked_id = v.uid))),
    coalesce((select jsonb_object_agg(s.reaction_type, s.n)
              from (select x.reaction_type, count(*)::int as n
                    from public.reactions x where x.post_id = p.id
                    group by x.reaction_type) s), '{}'::jsonb),
    (select x.reaction_type from public.reactions x where x.post_id = p.id and x.user_id = v.uid),
    exists (select 1 from public.bookmarks bm where bm.post_id = p.id and bm.user_id = v.uid),
    exists (select 1 from public.muted_threads mt where mt.post_id = p.id and mt.user_id = v.uid)
  from public.posts p
  join public.profiles a on a.id = p.author_id
  cross join viewer v
  where v.uid is not null
    and (
      -- own drafts
      (p_drafts and p.author_id = v.uid and p.visibility = 'draft')
      -- a single post
      or (not p_drafts and p_post_id is not null and p.id = p_post_id and (
            p.author_id = v.uid
            or private.is_moderator(v.uid)
            or (p.visibility = 'community' and p.status = 'active'
                and not private.is_blocked_between(v.uid, p.author_id))))
      -- lists
      or (not p_drafts and p_post_id is null
          and p.visibility = 'community'
          and p.status = 'active'
          and not exists (select 1 from public.blocks b
                          where (b.blocker_id = v.uid and b.blocked_id = p.author_id)
                             or (b.blocker_id = p.author_id and b.blocked_id = v.uid))
          and (p_post_type is null or p.post_type = p_post_type)
          and (p_language is null or p.language = p_language)
          and (p_topic is null or p.topic = p_topic)
          -- hidden topics are skipped unless the viewer explicitly filters by that topic
          and (p_topic is not null or p.author_id = v.uid or p.topic is null or not (p.topic = any (v.hidden)))
          and (p_author_handle is null or a.handle = lower(p_author_handle))
          and (not p_bookmarked or exists (select 1 from public.bookmarks bm where bm.post_id = p.id and bm.user_id = v.uid))
          and (not p_seeking or (
                p.response_preference <> 'express'
                and p.author_id <> v.uid
                and p.published_at > now() - interval '30 days'
                and not exists (select 1 from public.replies r where r.post_id = p.id and r.status = 'active')))
          and (p_cursor_at is null or (p.published_at, p.id) < (p_cursor_at, p_cursor_id)))
    )
  order by sort_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- -----------------------------------------------------------------------------
-- Replies (chronological; parents always precede their children)
-- -----------------------------------------------------------------------------

create or replace function public.get_post_replies(
  p_post_id   uuid,
  p_limit     integer default 50,
  p_cursor_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id                  uuid,
  parent_reply_id     uuid,
  content             text,
  status              text,
  created_at          timestamptz,
  edited_at           timestamptz,
  author_handle       text,
  author_display_name text,
  author_avatar_key   text,
  is_mine             boolean,
  is_post_author      boolean,
  reactions           jsonb,
  my_reaction         text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id, r.parent_reply_id, r.content, r.status, r.created_at, r.edited_at,
    a.handle, a.display_name, a.avatar_key,
    r.author_id = auth.uid(),
    r.author_id = p.author_id,
    coalesce((select jsonb_object_agg(s.reaction_type, s.n)
              from (select x.reaction_type, count(*)::int as n
                    from public.reply_reactions x where x.reply_id = r.id
                    group by x.reaction_type) s), '{}'::jsonb),
    (select x.reaction_type from public.reply_reactions x where x.reply_id = r.id and x.user_id = auth.uid())
  from public.replies r
  join public.posts p on p.id = r.post_id
  join public.profiles a on a.id = r.author_id
  where r.post_id = p_post_id
    and auth.uid() is not null
    and private.can_view_post(p_post_id)
    and (r.status = 'active' or r.author_id = auth.uid() or private.is_moderator())
    and not private.is_blocked_between(auth.uid(), r.author_id)
    and (p_cursor_at is null or (r.created_at, r.id) > (p_cursor_at, p_cursor_id))
  order by r.created_at, r.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- -----------------------------------------------------------------------------
-- Reactions
-- -----------------------------------------------------------------------------

create or replace function public.get_reaction_state(p_target_type text, p_target_id uuid)
returns table (reactions jsonb, my_reaction text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when p_target_type = 'post' then
      coalesce((select jsonb_object_agg(s.reaction_type, s.n)
                from (select x.reaction_type, count(*)::int as n from public.reactions x
                      where x.post_id = p_target_id group by x.reaction_type) s), '{}'::jsonb)
    else
      coalesce((select jsonb_object_agg(s.reaction_type, s.n)
                from (select x.reaction_type, count(*)::int as n from public.reply_reactions x
                      where x.reply_id = p_target_id group by x.reaction_type) s), '{}'::jsonb)
    end,
    case when p_target_type = 'post' then
      (select x.reaction_type from public.reactions x where x.post_id = p_target_id and x.user_id = auth.uid())
    else
      (select x.reaction_type from public.reply_reactions x where x.reply_id = p_target_id and x.user_id = auth.uid())
    end
  where auth.uid() is not null
    and p_target_type in ('post', 'reply')
    and case when p_target_type = 'post' then private.can_view_post(p_target_id)
             else private.can_view_reply(p_target_id) end;
$$;

-- SECURITY INVOKER: the write is subject to RLS and column privileges; only the
-- final count read is privileged (through get_reaction_state).
create or replace function public.set_reaction(p_target_type text, p_target_id uuid, p_reaction text)
returns table (reactions jsonb, my_reaction text)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if p_target_type = 'post' then
    if p_reaction is null then
      delete from public.reactions where post_id = p_target_id and user_id = auth.uid();
    else
      insert into public.reactions (post_id, user_id, reaction_type)
      values (p_target_id, auth.uid(), p_reaction)
      on conflict on constraint reactions_one_per_user
      do update set reaction_type = excluded.reaction_type;
    end if;
  elsif p_target_type = 'reply' then
    if p_reaction is null then
      delete from public.reply_reactions where reply_id = p_target_id and user_id = auth.uid();
    else
      insert into public.reply_reactions (reply_id, user_id, reaction_type)
      values (p_target_id, auth.uid(), p_reaction)
      on conflict on constraint reply_reactions_one_per_user
      do update set reaction_type = excluded.reaction_type;
    end if;
  else
    raise exception 'invalid_target' using errcode = 'P0001';
  end if;

  return query select * from public.get_reaction_state(p_target_type, p_target_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Profiles
-- -----------------------------------------------------------------------------

create or replace function public.get_public_profile(p_handle text)
returns table (
  handle              text,
  display_name        text,
  avatar_key          text,
  bio                 text,
  member_since        date,
  is_me               boolean,
  is_blocked_by_me    boolean,
  listening_available boolean,
  listening_languages text[],
  listening_topics    text[],
  listening_note      text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.handle, p.display_name, p.avatar_key, p.bio,
    date_trunc('month', p.created_at)::date,
    p.id = auth.uid(),
    exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = p.id),
    coalesce(lp.available, false) and private.can_participate(p.id),
    case when lp.available then lp.languages end,
    case when lp.available then lp.topics end,
    case when lp.available then lp.note end
  from public.profiles p
  left join public.listening_preferences lp on lp.user_id = p.id
  where auth.uid() is not null
    and p.handle = lower(btrim(p_handle))
    and (p.onboarding_completed or p.id = auth.uid())
    -- If they blocked the viewer, behave as if the profile does not exist.
    and not exists (select 1 from public.blocks b where b.blocker_id = p.id and b.blocked_id = auth.uid());
$$;

create or replace function public.list_blocked_users()
returns table (handle text, display_name text, avatar_key text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.handle, p.display_name, p.avatar_key, b.created_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

-- -----------------------------------------------------------------------------
-- Listening
-- -----------------------------------------------------------------------------

create or replace function public.list_available_listeners(p_language text default null, p_topic text default null)
returns table (
  handle       text,
  display_name text,
  avatar_key   text,
  languages    text[],
  topics       text[],
  note         text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.handle, p.display_name, p.avatar_key, lp.languages, lp.topics, lp.note
  from public.listening_preferences lp
  join public.profiles p on p.id = lp.user_id
  where auth.uid() is not null
    and lp.available
    and p.onboarding_completed
    and p.id <> auth.uid()
    and private.can_participate(p.id)
    and not private.is_blocked_between(auth.uid(), p.id)
    and (p_language is null or p_language = any (lp.languages))
    and (p_topic is null or cardinality(lp.topics) = 0 or p_topic = any (lp.topics))
  order by lp.updated_at desc
  limit 50;
$$;

create or replace function public.list_open_requests()
returns table (
  id                     uuid,
  language               text,
  topic                  text,
  intro                  text,
  created_at             timestamptz,
  requester_handle       text,
  requester_display_name text,
  requester_avatar_key   text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.language, s.topic, s.intro, s.created_at, r.handle, r.display_name, r.avatar_key
  from public.private_sessions s
  join public.profiles r on r.id = s.requester_id
  join public.listening_preferences me on me.user_id = auth.uid() and me.available
  where s.status = 'requested'
    and s.requested_listener_id is null
    and s.requester_id <> auth.uid()
    and s.created_at > now() - interval '7 days'
    and s.language = any (me.languages)
    and not private.is_blocked_between(auth.uid(), s.requester_id)
  order by s.created_at asc
  limit 30;
$$;

create or replace function public.list_my_sessions(p_session_id uuid default null)
returns table (
  id                        uuid,
  status                    text,
  end_reason                text,
  my_role                   text,
  is_open_request           boolean,
  counterpart_handle        text,
  counterpart_display_name  text,
  counterpart_avatar_key    text,
  language                  text,
  topic                     text,
  intro                     text,
  created_at                timestamptz,
  accepted_at               timestamptz,
  ended_at                  timestamptz,
  ended_by_me               boolean,
  last_message_at           timestamptz,
  is_expired                boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id, s.status, s.end_reason,
    case when s.requester_id = auth.uid() then 'requester' else 'listener' end,
    s.listener_id is null and s.requested_listener_id is null,
    c.handle, c.display_name, c.avatar_key,
    s.language, s.topic, s.intro, s.created_at, s.accepted_at, s.ended_at,
    s.ended_by = auth.uid(),
    (select max(m.created_at) from public.private_messages m where m.session_id = s.id),
    s.status = 'requested' and s.created_at < now() - interval '7 days'
  from public.private_sessions s
  left join public.profiles c on c.id = case
    when s.requester_id = auth.uid() then coalesce(s.listener_id, s.requested_listener_id)
    else s.requester_id
  end
  where auth.uid() is not null
    and (s.requester_id = auth.uid() or s.listener_id = auth.uid() or s.requested_listener_id = auth.uid())
    and (p_session_id is null or s.id = p_session_id)
  order by coalesce((select max(m.created_at) from public.private_messages m where m.session_id = s.id), s.updated_at) desc
  limit 100;
$$;

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------

create or replace function public.get_notifications(p_limit integer default 30, p_cursor_at timestamptz default null)
returns table (
  id                 uuid,
  type               text,
  read_at            timestamptz,
  created_at         timestamptz,
  actor_display_name text,
  actor_handle       text,
  related_post_id    uuid,
  related_reply_id   uuid,
  related_session_id uuid,
  data               jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.type, n.read_at, n.created_at, a.display_name, a.handle,
         n.related_post_id, n.related_reply_id, n.related_session_id, n.data
  from public.notifications n
  left join public.profiles a on a.id = n.actor_id
  where n.recipient_id = auth.uid()
    and (n.actor_id is null or not private.is_blocked_between(auth.uid(), n.actor_id))
    and (p_cursor_at is null or n.created_at < p_cursor_at)
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

create or replace function public.get_unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.notifications n
  where n.recipient_id = auth.uid()
    and n.read_at is null
    and (n.actor_id is null or not private.is_blocked_between(auth.uid(), n.actor_id));
$$;
