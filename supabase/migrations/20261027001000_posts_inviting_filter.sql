-- get_posts gains p_inviting: only posts that invite responses (excludes
-- "I just need to express myself"), used by the Listening space.

drop function public.get_posts(integer, timestamptz, uuid, text, text, text, boolean, text, boolean, uuid, boolean);

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
  p_drafts        boolean default false,
  p_inviting      boolean default false
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
          and (not p_inviting or p.response_preference <> 'express')
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

revoke execute on function public.get_posts(integer, timestamptz, uuid, text, text, text, boolean, text, boolean, uuid, boolean, boolean) from public, anon;
grant execute on function public.get_posts(integer, timestamptz, uuid, text, text, text, boolean, text, boolean, uuid, boolean, boolean) to authenticated;
