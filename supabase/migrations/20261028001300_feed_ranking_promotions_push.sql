-- Nafis: engagement-ranked feed, Super Admin post promotion (boost and free
-- likes), and web push subscriptions with a delivery queue.
--
-- Decisions (see README "Feed ranking", "Promoted posts" and "Push"):
-- * Ranking is computed at read time from live counts, so there is no stored
--   score to drift or to backfill. Boosted posts come first, then
--   (engagement + 1) / (age_hours + 2)^1.3.
-- * Promotions live in their own table with no client access at all. Only
--   Super Admins change them, through audited functions. Members see the
--   effect (order, heart count) but never whether a post was promoted.
-- * Push subscriptions are written only through functions: a device endpoint
--   belongs to whichever account last registered it on that device.
-- * Notifications for people with a push subscription are queued in a private
--   table; the server (service role) claims and delivers them. Nothing about a
--   post's content is ever put in a push message.
-- Nothing in this migration deletes or rewrites existing data.

-- -----------------------------------------------------------------------------
-- 1. Promotions
-- -----------------------------------------------------------------------------

create table public.post_promotions (
  post_id       uuid primary key references public.posts (id) on delete cascade,
  boosted_at    timestamptz,
  boosted_until timestamptz,
  boosted_by    uuid references public.profiles (id) on delete set null,
  bonus_likes   integer not null default 0,
  bonus_by      uuid references public.profiles (id) on delete set null,
  updated_at    timestamptz not null default now(),
  constraint post_promotions_bonus_range check (bonus_likes between 0 and 100000),
  constraint post_promotions_boost_pair check ((boosted_at is null) = (boosted_until is null))
);

create index post_promotions_boosted_idx on public.post_promotions (boosted_until) where boosted_until is not null;

comment on table public.post_promotions is
  'Super Admin feed promotion. No client access; changed only through admin_boost_post / admin_set_bonus_likes (audited).';

alter table public.post_promotions enable row level security;
revoke all on public.post_promotions from anon, authenticated;

alter table public.moderation_audit_logs drop constraint audit_action;
alter table public.moderation_audit_logs add constraint audit_action check (action in (
  'set_post_status', 'set_reply_status', 'update_report', 'suspend_user', 'lift_suspension', 'remove_avatar',
  'set_role', 'bootstrap_super_admin', 'grant_verification', 'revoke_verification',
  'boost_post', 'unboost_post', 'set_bonus_likes'
));

-- Real reaction counts plus any free likes (shown as hearts).
create or replace function private.post_reaction_counts(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with counted as (
    select coalesce(jsonb_object_agg(s.reaction_type, s.n), '{}'::jsonb) as counts
    from (select x.reaction_type, count(*)::int as n
          from public.reactions x where x.post_id = p_post_id
          group by x.reaction_type) s
  ), bonus as (
    select coalesce((select pp.bonus_likes from public.post_promotions pp where pp.post_id = p_post_id), 0) as n
  )
  select case when b.n > 0
              then c.counts || jsonb_build_object('heart', coalesce((c.counts ->> 'heart')::int, 0) + b.n)
              else c.counts end
  from counted c, bonus b;
$$;

-- Engagement score. Replies count double (they are the heart of peer
-- support); an author's own replies do not count. Older posts sink slowly.
create or replace function private.post_rank_score(
  p_post_id      uuid,
  p_author_id    uuid,
  p_published_at timestamptz,
  p_bonus        integer,
  p_at           timestamptz
)
returns double precision
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (select count(*) from public.reactions x where x.post_id = p_post_id)
    + coalesce(p_bonus, 0)
    + 2 * (select count(*) from public.replies r
           where r.post_id = p_post_id and r.status = 'active' and r.author_id <> p_author_id)
    + 1
  )::double precision
  / power(greatest(extract(epoch from (p_at - coalesce(p_published_at, p_at))) / 3600.0, 0) + 2, 1.3);
$$;

-- -----------------------------------------------------------------------------
-- 2. Read API: ranked feed and promoted counts
-- -----------------------------------------------------------------------------

create or replace function public.get_reaction_state(p_target_type text, p_target_id uuid)
returns table (reactions jsonb, my_reaction text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when p_target_type = 'post' then private.post_reaction_counts(p_target_id)
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

drop function public.get_posts(integer, timestamptz, uuid, text, text, text, boolean, text, boolean, uuid, boolean, boolean);

-- p_sort = 'top': boosted posts first, then by engagement score, paginated by
-- offset against a fixed p_ranked_at so pages stay consistent.
-- p_sort = 'latest' (default): newest first with keyset pagination.
create function public.get_posts(
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
  p_drafts        boolean default false,
  p_inviting      boolean default false,
  p_sort          text default 'latest',
  p_offset        integer default 0,
  p_ranked_at     timestamptz default null
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
  author_avatar_path     text,
  author_verified        boolean,
  is_mine                boolean,
  reply_count            integer,
  reactions              jsonb,
  my_reaction            text,
  is_bookmarked          boolean,
  is_muted               boolean,
  promotion              jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select auth.uid() as uid,
           coalesce((select pr.hidden_topics from public.profiles pr where pr.id = auth.uid()), '{}'::text[]) as hidden,
           private.is_super_admin(auth.uid()) as super,
           least(coalesce(p_ranked_at, now()), now()) as ranked_at,
           (p_sort = 'top' and p_post_id is null and not p_drafts and not p_bookmarked) as top
  )
  select
    p.id, p.post_type, p.content, p.caption, p.audio_duration_seconds, p.language, p.topic,
    p.response_preference, p.visibility, p.status, p.created_at, p.published_at, p.edited_at,
    case when p_drafts then p.updated_at else coalesce(p.published_at, p.created_at) end as sort_at,
    a.handle, a.display_name, a.avatar_key, a.avatar_path,
    exists (select 1 from public.account_verifications av where av.user_id = p.author_id),
    p.author_id = v.uid,
    (select count(*)::int from public.replies r
      where r.post_id = p.id and r.status = 'active'
        and not exists (select 1 from public.blocks b
                        where (b.blocker_id = v.uid and b.blocked_id = r.author_id)
                           or (b.blocker_id = r.author_id and b.blocked_id = v.uid))),
    private.post_reaction_counts(p.id),
    (select x.reaction_type from public.reactions x where x.post_id = p.id and x.user_id = v.uid),
    exists (select 1 from public.bookmarks bm where bm.post_id = p.id and bm.user_id = v.uid),
    exists (select 1 from public.muted_threads mt where mt.post_id = p.id and mt.user_id = v.uid),
    -- Promotion details are for Super Admins only.
    case when v.super then jsonb_build_object(
      'boosted_until', case when pp.boosted_until > now() then pp.boosted_until end,
      'bonus_likes', coalesce(pp.bonus_likes, 0)
    ) end
  from public.posts p
  join public.profiles a on a.id = p.author_id
  cross join viewer v
  left join public.post_promotions pp on pp.post_id = p.id
  where v.uid is not null
    and (
      (p_drafts and p.author_id = v.uid and p.visibility = 'draft')
      or (not p_drafts and p_post_id is not null and p.id = p_post_id and (
            p.author_id = v.uid
            or private.is_moderator(v.uid)
            or (p.visibility = 'community' and p.status = 'active'
                and not private.is_blocked_between(v.uid, p.author_id))))
      or (not p_drafts and p_post_id is null
          and p.visibility = 'community'
          and p.status = 'active'
          and not exists (select 1 from public.blocks b
                          where (b.blocker_id = v.uid and b.blocked_id = p.author_id)
                             or (b.blocker_id = p.author_id and b.blocked_id = v.uid))
          and (p_post_type is null or p.post_type = p_post_type)
          and (p_language is null or p.language = p_language)
          and (p_topic is null or p.topic = p_topic)
          and (p_topic is not null or p.author_id = v.uid or p.topic is null or not (p.topic = any (v.hidden)))
          and (p_author_handle is null or a.handle = lower(p_author_handle))
          and (not p_inviting or p.response_preference <> 'express')
          and (not p_bookmarked or exists (select 1 from public.bookmarks bm where bm.post_id = p.id and bm.user_id = v.uid))
          and (not p_seeking or (
                p.response_preference <> 'express'
                and p.author_id <> v.uid
                and p.published_at > now() - interval '30 days'
                and not exists (select 1 from public.replies r where r.post_id = p.id and r.status = 'active')))
          and (v.top or p_cursor_at is null or (p.published_at, p.id) < (p_cursor_at, p_cursor_id))
          -- Ranked pages never include posts published after the first page loaded.
          and (not v.top or p.published_at <= v.ranked_at))
    )
  order by
    case when v.top then coalesce(pp.boosted_until > v.ranked_at, false) end desc,
    case when v.top and pp.boosted_until > v.ranked_at then pp.boosted_at end desc,
    case when v.top then private.post_rank_score(p.id, p.author_id, p.published_at, coalesce(pp.bonus_likes, 0), v.ranked_at) end desc,
    sort_at desc,
    p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset case when p_sort = 'top' then least(greatest(coalesce(p_offset, 0), 0), 1000) else 0 end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Super Admin promotion functions (audited; moderators cannot use them)
-- -----------------------------------------------------------------------------

-- p_hours = 0 removes the boost. Returns the new end time (or null).
create or replace function public.admin_boost_post(p_post_id uuid, p_hours integer, p_reason text default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := auth.uid();
  v_author uuid;
  v_until  timestamptz;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if not private.is_super_admin(v_actor) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_hours is null or p_hours < 0 or p_hours > 720 then
    raise exception 'validation' using errcode = 'P0001';
  end if;

  select p.author_id into v_author
  from public.posts p
  where p.id = p_post_id and p.visibility = 'community' and p.status = 'active';
  if v_author is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if p_hours = 0 then
    update public.post_promotions
       set boosted_at = null, boosted_until = null, boosted_by = null, updated_at = now()
     where post_id = p_post_id and boosted_until > now();
    if found then
      insert into public.moderation_audit_logs (moderator_id, action, target_type, target_id, affected_user_id, reason)
      values (v_actor, 'unboost_post', 'post', p_post_id, v_author, v_reason);
    end if;
    return null;
  end if;

  v_until := now() + make_interval(hours => p_hours);
  insert into public.post_promotions (post_id, boosted_at, boosted_until, boosted_by)
  values (p_post_id, now(), v_until, v_actor)
  on conflict (post_id) do update
    set boosted_at = now(), boosted_until = excluded.boosted_until, boosted_by = excluded.boosted_by, updated_at = now();

  insert into public.moderation_audit_logs (moderator_id, action, target_type, target_id, affected_user_id, reason, metadata)
  values (v_actor, 'boost_post', 'post', p_post_id, v_author, v_reason, jsonb_build_object('hours', p_hours));
  return v_until;
end;
$$;

-- Sets the number of free likes (hearts) added to a post. 0 removes them.
create or replace function public.admin_set_bonus_likes(p_post_id uuid, p_count integer, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := auth.uid();
  v_author uuid;
  v_prev   integer;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if not private.is_super_admin(v_actor) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_count is null or p_count < 0 or p_count > 100000 then
    raise exception 'validation' using errcode = 'P0001';
  end if;

  select p.author_id into v_author
  from public.posts p
  where p.id = p_post_id and p.visibility = 'community' and p.status = 'active';
  if v_author is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  select pp.bonus_likes into v_prev from public.post_promotions pp where pp.post_id = p_post_id;
  v_prev := coalesce(v_prev, 0);
  if v_prev = p_count then
    return p_count;
  end if;

  insert into public.post_promotions (post_id, bonus_likes, bonus_by)
  values (p_post_id, p_count, v_actor)
  on conflict (post_id) do update
    set bonus_likes = excluded.bonus_likes, bonus_by = excluded.bonus_by, updated_at = now();

  insert into public.moderation_audit_logs (moderator_id, action, target_type, target_id, affected_user_id, reason, metadata)
  values (v_actor, 'set_bonus_likes', 'post', p_post_id, v_author, v_reason,
          jsonb_build_object('from', v_prev, 'to', p_count));
  return p_count;
end;
$$;

-- Currently boosted posts and posts with free likes.
create or replace function public.admin_list_promotions()
returns table (
  post_id             uuid,
  post_type           text,
  excerpt             text,
  status              text,
  published_at        timestamptz,
  author_handle       text,
  author_display_name text,
  boosted_until       timestamptz,
  boosted_by_handle   text,
  bonus_likes         integer,
  real_reactions      integer,
  reply_count         integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.is_super_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  return query
  select p.id, p.post_type, left(coalesce(nullif(p.caption, ''), p.content, ''), 160), p.status, p.published_at,
         a.handle, a.display_name,
         case when pp.boosted_until > now() then pp.boosted_until end,
         b.handle,
         pp.bonus_likes,
         (select count(*)::int from public.reactions x where x.post_id = p.id),
         (select count(*)::int from public.replies r where r.post_id = p.id and r.status = 'active')
  from public.post_promotions pp
  join public.posts p on p.id = pp.post_id
  join public.profiles a on a.id = p.author_id
  left join public.profiles b on b.id = pp.boosted_by
  where pp.boosted_until > now() or pp.bonus_likes > 0
  order by (pp.boosted_until > now()) desc nulls last, pp.boosted_until desc nulls last, pp.updated_at desc
  limit 200;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Web push
-- -----------------------------------------------------------------------------

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_unique unique (endpoint),
  constraint push_subscriptions_endpoint_format check (endpoint ~ '^https://[^[:space:]]+$' and char_length(endpoint) <= 1024),
  constraint push_subscriptions_p256dh_format check (p256dh ~ '^[A-Za-z0-9_-]{80,100}={0,2}$'),
  constraint push_subscriptions_auth_format check (auth ~ '^[A-Za-z0-9_-]{16,30}={0,2}$')
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id, created_at desc);

comment on table public.push_subscriptions is
  'Browser push endpoints. No client access; written by register/unregister_push_subscription, read by the server for delivery.';

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to service_role;

-- The account signed in on a device owns that device's endpoint. Endpoints are
-- unguessable capability URLs, so holding one proves control of the device.
create or replace function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  perform private.enforce_rate_limit('push_subscribe', 30, interval '1 hour');

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_uid, p_endpoint, p_p256dh, p_auth)
  on conflict on constraint push_subscriptions_endpoint_unique do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();

  -- At most 10 devices per account; the oldest are dropped.
  delete from public.push_subscriptions s
  where s.user_id = v_uid
    and s.id not in (select s2.id from public.push_subscriptions s2
                     where s2.user_id = v_uid order by s2.created_at desc limit 10);
end;
$$;

create or replace function public.unregister_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
end;
$$;

create table private.push_queue (
  notification_id uuid primary key references public.notifications (id) on delete cascade,
  created_at      timestamptz not null default now()
);

create index push_queue_created_idx on private.push_queue (created_at);

create or replace function private.notifications_enqueue_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.push_subscriptions s where s.user_id = new.recipient_id) then
    insert into private.push_queue (notification_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger notifications_enqueue_push after insert on public.notifications
  for each row execute function private.notifications_enqueue_push();

-- Server (service role) only. Claims queued notifications exactly once; stale
-- (> 1 hour) or already-read ones are dropped without sending.
create or replace function public.claim_push_notifications(p_limit integer default 100)
returns table (
  id                 uuid,
  recipient_id       uuid,
  type               text,
  related_post_id    uuid,
  related_session_id uuid,
  data               jsonb,
  language           text
)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    delete from private.push_queue q
    where q.notification_id in (
      select q2.notification_id from private.push_queue q2
      order by q2.created_at
      limit least(greatest(coalesce(p_limit, 100), 1), 500)
      for update skip locked)
    returning q.notification_id, q.created_at
  )
  select n.id, n.recipient_id, n.type, n.related_post_id, n.related_session_id, n.data, p.preferred_language
  from claimed c
  join public.notifications n on n.id = c.notification_id
  join public.profiles p on p.id = n.recipient_id
  where c.created_at > now() - interval '1 hour'
    and n.read_at is null;
$$;

-- -----------------------------------------------------------------------------
-- 5. Privileges
-- -----------------------------------------------------------------------------

revoke execute on function
  public.get_posts(integer, timestamptz, uuid, text, text, text, boolean, text, boolean, uuid, boolean, boolean, text, integer, timestamptz),
  public.admin_boost_post(uuid, integer, text),
  public.admin_set_bonus_likes(uuid, integer, text),
  public.admin_list_promotions(),
  public.register_push_subscription(text, text, text),
  public.unregister_push_subscription(text),
  public.claim_push_notifications(integer)
from public, anon;

grant execute on function
  public.get_posts(integer, timestamptz, uuid, text, text, text, boolean, text, boolean, uuid, boolean, boolean, text, integer, timestamptz),
  public.admin_boost_post(uuid, integer, text),
  public.admin_set_bonus_likes(uuid, integer, text),
  public.admin_list_promotions(),
  public.register_push_subscription(text, text, text),
  public.unregister_push_subscription(text)
to authenticated;

revoke execute on function public.claim_push_notifications(integer) from authenticated;
grant execute on function public.claim_push_notifications(integer) to service_role;
