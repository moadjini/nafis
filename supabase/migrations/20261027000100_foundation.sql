-- =============================================================================
-- Nafis foundation
--   * private schema for internal helpers (never exposed through the Data API)
--   * profiles, roles, account restrictions, notification preferences, blocks
--   * generic rate limiting
--   * profile auto-creation for new auth users
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Shared vocabularies
-- -----------------------------------------------------------------------------

create or replace function private.is_valid_topic(p_topic text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_topic = any (array[
    'loneliness', 'grief', 'family', 'relationships', 'friendship', 'work_money',
    'studies', 'health', 'faith', 'life_abroad', 'stress', 'self_worth', 'hope', 'other'
  ]::text[]);
$$;

create or replace function private.are_valid_topics(p_topics text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(private.is_valid_topic(t)), true) from unnest(p_topics) as t;
$$;

-- -----------------------------------------------------------------------------
-- Profiles
-- -----------------------------------------------------------------------------

create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  handle               text not null unique,
  display_name         text not null,
  avatar_key           text not null default 'leaf',
  bio                  text,
  preferred_language   text not null default 'en',
  theme                text not null default 'light',
  hidden_topics        text[] not null default '{}',
  onboarding_completed boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint profiles_handle_format check (handle ~ '^[a-z0-9_]{3,24}$'),
  constraint profiles_handle_reserved check (handle not in (
    'admin', 'administrator', 'moderator', 'nafis', 'support', 'help', 'safety', 'settings', 'me', 'system'
  )),
  constraint profiles_display_name_length check (char_length(btrim(display_name)) between 2 and 40),
  constraint profiles_avatar_key_format check (avatar_key ~ '^[a-z0-9-]{1,32}$'),
  constraint profiles_bio_length check (bio is null or char_length(bio) <= 280),
  constraint profiles_language check (preferred_language in ('en', 'so')),
  constraint profiles_theme check (theme in ('light', 'dark', 'system')),
  constraint profiles_hidden_topics check (cardinality(hidden_topics) <= 20 and private.are_valid_topics(hidden_topics))
);

comment on table public.profiles is
  'Pseudonymous profile. Never stores email, legal name or location. Readable directly only by its owner; others read through public.get_public_profile().';

-- -----------------------------------------------------------------------------
-- Roles and restrictions (no client write access at all)
-- -----------------------------------------------------------------------------

create table public.user_roles (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  role       text not null check (role in ('moderator', 'admin')),
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles (id) on delete set null
);

comment on table public.user_roles is
  'Moderator/admin grants. Only writable with the service role or SQL; never from the client.';

create table public.account_restrictions (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  suspended_until timestamptz not null,
  reason          text check (reason is null or char_length(reason) <= 1000),
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Notification preferences (row is optional; defaults apply when missing)
-- -----------------------------------------------------------------------------

create table public.notification_preferences (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  replies            boolean not null default true,
  reaction_summaries boolean not null default true,
  sessions           boolean not null default true,
  email_enabled      boolean not null default false,
  updated_at         timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Blocks
-- -----------------------------------------------------------------------------

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

-- -----------------------------------------------------------------------------
-- Helper predicates (SECURITY DEFINER so they can be used inside RLS policies
-- without recursive policy evaluation). They live in the private schema.
-- -----------------------------------------------------------------------------

create or replace function private.is_moderator(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = p_uid and r.role in ('moderator', 'admin')
  );
$$;

create or replace function private.can_participate(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_uid is not null
     and not exists (
       select 1 from public.account_restrictions r
       where r.user_id = p_uid and r.suspended_until > now()
     );
$$;

create or replace function private.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

-- -----------------------------------------------------------------------------
-- Rate limiting. Each guarded action records an event; exceeding the window
-- raises 'rate_limited' (detail = action). Service-role calls are not limited.
-- -----------------------------------------------------------------------------

create table private.rate_limit_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  action     text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_events_lookup_idx
  on private.rate_limit_events (user_id, action, created_at desc);

create or replace function private.enforce_rate_limit(p_action text, p_max integer, p_window interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    return;
  end if;

  -- Serialise concurrent requests from the same user for the same action.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_action, 0));

  select count(*) into v_count
  from private.rate_limit_events e
  where e.user_id = v_uid
    and e.action = p_action
    and e.created_at > now() - p_window;

  if v_count >= p_max then
    raise exception 'rate_limited' using errcode = 'P0001', detail = p_action;
  end if;

  insert into private.rate_limit_events (user_id, action) values (v_uid, p_action);

  if random() < 0.01 then
    delete from private.rate_limit_events where created_at < now() - interval '2 days';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Generic triggers
-- -----------------------------------------------------------------------------

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.profiles_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  new.display_name := btrim(new.display_name);
  new.handle := lower(btrim(new.handle));
  new.bio := nullif(btrim(coalesce(new.bio, '')), '');
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_before_update
  before update on public.profiles
  for each row execute function private.profiles_before_update();

create trigger notification_preferences_touch
  before update on public.notification_preferences
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Profile auto-creation with a gentle random pseudonym
-- -----------------------------------------------------------------------------

create or replace function private.generate_pseudonym()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  adjectives text[] := array['Quiet', 'Gentle', 'Calm', 'Kind', 'Soft', 'Steady', 'Warm', 'Bright',
                             'Patient', 'Hopeful', 'Tender', 'Still', 'Brave', 'Open', 'Light'];
  nouns      text[] := array['River', 'Leaf', 'Cedar', 'Meadow', 'Breeze', 'Harbor', 'Willow', 'Dune',
                             'Moon', 'Sparrow', 'Stone', 'Rain', 'Garden', 'Lantern', 'Tide'];
begin
  return adjectives[1 + floor(random() * array_length(adjectives, 1))::int]
      || ' '
      || nouns[1 + floor(random() * array_length(nouns, 1))::int];
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name     text;
  v_handle   text;
  v_attempts integer := 0;
  v_language text := coalesce(new.raw_user_meta_data ->> 'preferred_language', 'en');
begin
  if v_language not in ('en', 'so') then
    v_language := 'en';
  end if;

  loop
    v_name := private.generate_pseudonym();
    v_handle := lower(replace(v_name, ' ', '_')) || '_' || lpad(floor(random() * 1000)::int::text, 3, '0');
    exit when not exists (select 1 from public.profiles p where p.handle = v_handle);
    v_attempts := v_attempts + 1;
    if v_attempts > 25 then
      v_handle := 'friend_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
      exit;
    end if;
  end loop;

  insert into public.profiles (id, handle, display_name, preferred_language)
  values (new.id, v_handle, v_name, v_language);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.account_restrictions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.blocks enable row level security;

create policy "profiles: owner or moderator can read"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_moderator());

create policy "profiles: owner can update"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "user_roles: owner can read own role"
  on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()));

create policy "account_restrictions: owner can read own restriction"
  on public.account_restrictions for select to authenticated
  using (user_id = (select auth.uid()) or private.is_moderator());

create policy "notification_preferences: owner can read"
  on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notification_preferences: owner can insert"
  on public.notification_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "notification_preferences: owner can update"
  on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "blocks: blocker can read own blocks"
  on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
