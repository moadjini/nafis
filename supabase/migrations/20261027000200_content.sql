-- =============================================================================
-- Nafis community content
--   posts, reactions, replies, reply_reactions, bookmarks, muted_threads,
--   journal_entries
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Posts
-- -----------------------------------------------------------------------------

create table public.posts (
  id                     uuid primary key default gen_random_uuid(),
  author_id              uuid not null references public.profiles (id) on delete cascade,
  post_type              text not null,
  content                text,
  audio_storage_path     text,
  audio_duration_seconds integer,
  audio_mime_type        text,
  caption                text,
  language               text not null default 'en',
  topic                  text,
  response_preference    text not null,
  visibility             text not null default 'community',
  status                 text not null default 'active',
  published_at           timestamptz,
  edited_at              timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint posts_type check (post_type in ('text', 'voice')),
  constraint posts_language check (language in ('en', 'so', 'other')),
  constraint posts_topic check (topic is null or private.is_valid_topic(topic)),
  constraint posts_response_preference check (
    response_preference in ('just_listen', 'advice', 'similar_experience', 'express')
  ),
  -- 'community' = visible to signed-in members under a pseudonym (NOT private).
  -- 'draft'     = visible only to the author.
  constraint posts_visibility check (visibility in ('community', 'draft')),
  constraint posts_status check (status in ('active', 'hidden', 'removed')),
  constraint posts_content_length check (content is null or char_length(content) <= 5000),
  constraint posts_caption_length check (caption is null or char_length(caption) <= 300),
  constraint posts_text_shape check (
    post_type <> 'text'
    or (content is not null and char_length(btrim(content)) >= 1
        and audio_storage_path is null and audio_duration_seconds is null and audio_mime_type is null)
  ),
  constraint posts_voice_shape check (
    post_type <> 'voice'
    or (content is null and audio_storage_path is not null and audio_mime_type is not null
        and audio_duration_seconds between 1 and 600)
  ),
  constraint posts_audio_in_owner_folder check (
    audio_storage_path is null or split_part(audio_storage_path, '/', 1) = author_id::text
  ),
  constraint posts_audio_mime check (
    audio_mime_type is null or audio_mime_type in (
      'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/x-m4a'
    )
  ),
  constraint posts_published_at check (visibility <> 'community' or published_at is not null)
);

create unique index posts_audio_path_key on public.posts (audio_storage_path) where audio_storage_path is not null;
create index posts_feed_idx on public.posts (published_at desc, id desc)
  where visibility = 'community' and status = 'active';
create index posts_topic_feed_idx on public.posts (topic, published_at desc)
  where visibility = 'community' and status = 'active';
create index posts_author_idx on public.posts (author_id, created_at desc);

create or replace function private.posts_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enforce_rate_limit('post_create', 15, interval '1 hour');

  new.status := 'active';
  new.created_at := now();
  new.updated_at := now();
  new.edited_at := null;
  new.published_at := case when new.visibility = 'community' then now() else null end;
  new.content := nullif(new.content, '');
  new.caption := nullif(btrim(coalesce(new.caption, '')), '');

  if new.post_type = 'voice' and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'voice-notes' and o.name = new.audio_storage_path
  ) then
    raise exception 'audio_not_found' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create or replace function private.posts_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content_changed boolean :=
       new.content is distinct from old.content
    or new.caption is distinct from old.caption
    or new.topic is distinct from old.topic
    or new.language is distinct from old.language
    or new.response_preference is distinct from old.response_preference
    or new.visibility is distinct from old.visibility;
begin
  if new.author_id is distinct from old.author_id
     or new.post_type is distinct from old.post_type
     or new.audio_storage_path is distinct from old.audio_storage_path
     or new.created_at is distinct from old.created_at then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if v_content_changed and old.status <> 'active' and not private.is_moderator() then
    raise exception 'post_locked' using errcode = 'P0001';
  end if;

  if old.visibility = 'community' and new.visibility = 'draft' then
    raise exception 'cannot_unpublish' using errcode = 'P0001';
  end if;

  if old.visibility = 'draft' and new.visibility = 'community' then
    new.published_at := now();
  elsif old.visibility = 'community' and (
       new.content is distinct from old.content or new.caption is distinct from old.caption) then
    new.edited_at := now();
  end if;

  new.caption := nullif(btrim(coalesce(new.caption, '')), '');
  new.updated_at := now();
  return new;
end;
$$;

create trigger posts_before_insert before insert on public.posts
  for each row execute function private.posts_before_insert();
create trigger posts_before_update before update on public.posts
  for each row execute function private.posts_before_update();

-- Visibility predicates ---------------------------------------------------------

-- The current user may interact (react, reply, bookmark) with the post.
create or replace function private.can_engage_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post_id
      and p.visibility = 'community'
      and p.status = 'active'
      and auth.uid() is not null
      and not private.is_blocked_between(auth.uid(), p.author_id)
  );
$$;

-- The current user may read the post (owner, moderator, or engageable).
create or replace function private.can_view_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post_id
      and auth.uid() is not null
      and (
        p.author_id = auth.uid()
        or private.is_moderator()
        or (p.visibility = 'community' and p.status = 'active'
            and not private.is_blocked_between(auth.uid(), p.author_id))
      )
  );
$$;

-- -----------------------------------------------------------------------------
-- Reactions on posts (one per user per post)
-- -----------------------------------------------------------------------------

create table public.reactions (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.posts (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  reaction_type text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint reactions_type check (
    reaction_type in ('heart', 'hug', 'support', 'here', 'peace', 'care', 'hear_you')
  ),
  constraint reactions_one_per_user unique (post_id, user_id)
);

create index reactions_post_idx on public.reactions (post_id, reaction_type);
create index reactions_user_idx on public.reactions (user_id);

create or replace function private.reactions_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id or new.post_id is distinct from old.post_id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  perform private.enforce_rate_limit('reaction', 120, interval '10 minutes');
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger reactions_before_write before insert or update on public.reactions
  for each row execute function private.reactions_before_write();

-- -----------------------------------------------------------------------------
-- Replies (max depth 2: a reply may answer a top-level reply)
-- -----------------------------------------------------------------------------

create table public.replies (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references public.posts (id) on delete cascade,
  author_id       uuid not null references public.profiles (id) on delete cascade,
  parent_reply_id uuid references public.replies (id) on delete set null,
  content         text not null,
  status          text not null default 'active',
  edited_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint replies_content_length check (char_length(btrim(content)) between 1 and 2000),
  constraint replies_status check (status in ('active', 'hidden', 'removed')),
  constraint replies_not_self_parent check (parent_reply_id is null or parent_reply_id <> id)
);

create index replies_post_idx on public.replies (post_id, created_at, id);
create index replies_author_idx on public.replies (author_id, created_at desc);
create index replies_parent_idx on public.replies (parent_reply_id);

create or replace function private.replies_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.replies%rowtype;
begin
  perform private.enforce_rate_limit('reply_burst', 6, interval '1 minute');
  perform private.enforce_rate_limit('reply_create', 60, interval '1 hour');

  new.status := 'active';
  new.created_at := now();
  new.updated_at := now();
  new.edited_at := null;

  if new.parent_reply_id is not null then
    select * into v_parent from public.replies r where r.id = new.parent_reply_id;
    if not found then
      raise exception 'parent_not_found' using errcode = 'P0001';
    end if;
    if v_parent.post_id <> new.post_id then
      raise exception 'invalid_thread' using errcode = 'P0001';
    end if;
    if v_parent.parent_reply_id is not null then
      raise exception 'thread_too_deep' using errcode = 'P0001';
    end if;
    if v_parent.status <> 'active' or private.is_blocked_between(new.author_id, v_parent.author_id) then
      raise exception 'not_allowed' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.replies_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.author_id is distinct from old.author_id
     or new.post_id is distinct from old.post_id
     or new.created_at is distinct from old.created_at
     or (new.parent_reply_id is not null and new.parent_reply_id is distinct from old.parent_reply_id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if new.content is distinct from old.content then
    if old.status <> 'active' and not private.is_moderator() then
      raise exception 'reply_locked' using errcode = 'P0001';
    end if;
    new.edited_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger replies_before_insert before insert on public.replies
  for each row execute function private.replies_before_insert();
create trigger replies_before_update before update on public.replies
  for each row execute function private.replies_before_update();

create or replace function private.can_engage_reply(p_reply_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.replies r
    where r.id = p_reply_id
      and r.status = 'active'
      and private.can_engage_post(r.post_id)
      and not private.is_blocked_between(auth.uid(), r.author_id)
  );
$$;

create or replace function private.can_view_reply(p_reply_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.replies r
    where r.id = p_reply_id
      and private.can_view_post(r.post_id)
      and (r.status = 'active' or r.author_id = auth.uid() or private.is_moderator())
      and not private.is_blocked_between(auth.uid(), r.author_id)
  );
$$;

-- -----------------------------------------------------------------------------
-- Reactions on replies
-- -----------------------------------------------------------------------------

create table public.reply_reactions (
  id            uuid primary key default gen_random_uuid(),
  reply_id      uuid not null references public.replies (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  reaction_type text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint reply_reactions_type check (
    reaction_type in ('heart', 'hug', 'support', 'here', 'peace', 'care', 'hear_you')
  ),
  constraint reply_reactions_one_per_user unique (reply_id, user_id)
);

create index reply_reactions_reply_idx on public.reply_reactions (reply_id, reaction_type);
create index reply_reactions_user_idx on public.reply_reactions (user_id);

create or replace function private.reply_reactions_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id or new.reply_id is distinct from old.reply_id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  perform private.enforce_rate_limit('reaction', 120, interval '10 minutes');
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger reply_reactions_before_write before insert or update on public.reply_reactions
  for each row execute function private.reply_reactions_before_write();

-- -----------------------------------------------------------------------------
-- Bookmarks (private) and muted threads (private)
-- -----------------------------------------------------------------------------

create table public.bookmarks (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint bookmarks_pkey primary key (user_id, post_id)
);

create index bookmarks_user_idx on public.bookmarks (user_id, created_at desc);
create index bookmarks_post_idx on public.bookmarks (post_id);

create or replace function private.bookmarks_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enforce_rate_limit('bookmark', 120, interval '1 hour');
  new.created_at := now();
  return new;
end;
$$;

create trigger bookmarks_before_insert before insert on public.bookmarks
  for each row execute function private.bookmarks_before_insert();

create table public.muted_threads (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint muted_threads_pkey primary key (user_id, post_id)
);

create index muted_threads_post_idx on public.muted_threads (post_id);

-- -----------------------------------------------------------------------------
-- Journal (strictly private)
-- -----------------------------------------------------------------------------

create table public.journal_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text,
  content    text not null default '',
  is_draft   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_title_length check (title is null or char_length(title) <= 150),
  constraint journal_content_length check (char_length(content) <= 20000),
  constraint journal_content_required check (is_draft or char_length(btrim(content)) >= 1)
);

create index journal_entries_user_idx on public.journal_entries (user_id, created_at desc);

create or replace function private.journal_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enforce_rate_limit('journal_create', 60, interval '1 hour');
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.journal_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger journal_before_insert before insert on public.journal_entries
  for each row execute function private.journal_before_insert();
create trigger journal_before_update before update on public.journal_entries
  for each row execute function private.journal_before_update();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.posts enable row level security;
alter table public.reactions enable row level security;
alter table public.replies enable row level security;
alter table public.reply_reactions enable row level security;
alter table public.bookmarks enable row level security;
alter table public.muted_threads enable row level security;
alter table public.journal_entries enable row level security;

-- Posts: direct reads are limited to the author (and moderators). Community
-- reads go through public.get_posts(), which never exposes author ids.
create policy "posts: author or moderator can read"
  on public.posts for select to authenticated
  using (author_id = (select auth.uid()) or private.is_moderator());

create policy "posts: members can create their own"
  on public.posts for insert to authenticated
  with check (author_id = (select auth.uid()) and status = 'active' and private.can_participate());

create policy "posts: author can update"
  on public.posts for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy "posts: author can delete"
  on public.posts for delete to authenticated
  using (author_id = (select auth.uid()));

-- Reactions
create policy "reactions: owner can read"
  on public.reactions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "reactions: owner can create on visible posts"
  on public.reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_engage_post(post_id) and private.can_participate());

create policy "reactions: owner can change"
  on public.reactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.can_engage_post(post_id));

create policy "reactions: owner can remove"
  on public.reactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- Replies
create policy "replies: author or moderator can read"
  on public.replies for select to authenticated
  using (author_id = (select auth.uid()) or private.is_moderator());

create policy "replies: members can reply to visible posts"
  on public.replies for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and status = 'active'
    and private.can_engage_post(post_id)
    and private.can_participate()
  );

create policy "replies: author can update"
  on public.replies for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy "replies: author can delete"
  on public.replies for delete to authenticated
  using (author_id = (select auth.uid()));

-- Reply reactions
create policy "reply_reactions: owner can read"
  on public.reply_reactions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "reply_reactions: owner can create on visible replies"
  on public.reply_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_engage_reply(reply_id) and private.can_participate());

create policy "reply_reactions: owner can change"
  on public.reply_reactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.can_engage_reply(reply_id));

create policy "reply_reactions: owner can remove"
  on public.reply_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- Bookmarks
create policy "bookmarks: owner can read"
  on public.bookmarks for select to authenticated
  using (user_id = (select auth.uid()));

create policy "bookmarks: owner can create on visible posts"
  on public.bookmarks for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_engage_post(post_id));

create policy "bookmarks: owner can delete"
  on public.bookmarks for delete to authenticated
  using (user_id = (select auth.uid()));

-- Muted threads
create policy "muted_threads: owner can read"
  on public.muted_threads for select to authenticated
  using (user_id = (select auth.uid()));

create policy "muted_threads: owner can create"
  on public.muted_threads for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_view_post(post_id));

create policy "muted_threads: owner can delete"
  on public.muted_threads for delete to authenticated
  using (user_id = (select auth.uid()));

-- Journal: owner only, for every operation.
create policy "journal: owner can read"
  on public.journal_entries for select to authenticated
  using (user_id = (select auth.uid()));

create policy "journal: owner can create"
  on public.journal_entries for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "journal: owner can update"
  on public.journal_entries for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "journal: owner can delete"
  on public.journal_entries for delete to authenticated
  using (user_id = (select auth.uid()));
