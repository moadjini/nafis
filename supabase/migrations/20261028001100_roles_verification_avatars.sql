-- =============================================================================
-- Roles (member / moderator / super_admin), verification badges, profile
-- pictures, a unified audit trail and the admin RPCs.
-- Design and rationale: docs/admin-and-roles.md
-- Additive: no existing account, post or role is deleted.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Roles
-- -----------------------------------------------------------------------------

-- 'admin' only ever had moderator powers; map it to the least-privileged
-- equivalent so this migration can never create a Super Admin by itself.
update public.user_roles set role = 'moderator' where role = 'admin';

alter table public.user_roles drop constraint user_roles_role_check;
alter table public.user_roles add constraint user_roles_role check (role in ('moderator', 'super_admin'));
alter table public.user_roles add column reason text;
alter table public.user_roles add constraint user_roles_reason_length check (reason is null or char_length(reason) <= 1000);
alter table public.user_roles add column updated_at timestamptz not null default now();
create index user_roles_role_idx on public.user_roles (role);

create or replace function private.role_of(p_uid uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select r.role from public.user_roles r where r.user_id = p_uid), 'member');
$$;

-- Same signature as before so every existing policy keeps working. Super Admins
-- hold all moderator powers; a suspended account holds none.
create or replace function private.is_moderator(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = p_uid and r.role in ('moderator', 'super_admin')
  ) and private.can_participate(p_uid);
$$;

create or replace function private.is_super_admin(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = p_uid and r.role = 'super_admin'
  ) and private.can_participate(p_uid);
$$;

-- Never allow the last active Super Admin to disappear (demotion, role row
-- deletion, or account deletion cascading to the role row).
create or replace function private.user_roles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'DELETE' and old.role = 'super_admin')
     or (tg_op = 'UPDATE' and old.role = 'super_admin' and new.role <> 'super_admin') then
    perform pg_advisory_xact_lock(hashtext('nafis:super_admins'));
    if not exists (
      select 1 from public.user_roles r
      where r.role = 'super_admin'
        and r.user_id <> old.user_id
        and private.can_participate(r.user_id)
    ) then
      raise exception 'last_super_admin' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_roles_guard
  before update or delete on public.user_roles
  for each row execute function private.user_roles_guard();

-- -----------------------------------------------------------------------------
-- 2. Verification (separate from roles; never inferred)
-- -----------------------------------------------------------------------------

create table public.account_verifications (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  verified_at timestamptz not null default now(),
  verified_by uuid references public.profiles (id) on delete set null,
  reason      text,
  constraint account_verifications_reason_length check (reason is null or char_length(reason) <= 500)
);

create index account_verifications_recent_idx on public.account_verifications (verified_at desc);

alter table public.account_verifications enable row level security;

create policy "account_verifications: owner or super admin can read"
  on public.account_verifications for select to authenticated
  using (user_id = (select auth.uid()) or private.is_super_admin());

-- No insert/update/delete policies: only public.admin_set_verification writes.

-- -----------------------------------------------------------------------------
-- 3. Profile pictures
-- -----------------------------------------------------------------------------

alter table public.profiles add column avatar_path text;
alter table public.profiles add constraint profiles_avatar_path_format check (
  avatar_path is null
  or avatar_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
);
-- avatar_path is deliberately NOT added to the authenticated role's column
-- privileges: only the server (after decoding and re-encoding) sets it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No storage.objects policies for 'avatars': clients cannot list, upload,
-- overwrite or delete. Processed images are written by the server only.

-- -----------------------------------------------------------------------------
-- 4. Unified audit trail and notifications
-- -----------------------------------------------------------------------------

alter table public.moderation_audit_logs
  add column affected_user_id uuid references public.profiles (id) on delete set null;
create index moderation_audit_logs_affected_idx on public.moderation_audit_logs (affected_user_id, created_at desc);

alter table public.moderation_audit_logs drop constraint audit_action;
alter table public.moderation_audit_logs add constraint audit_action check (action in (
  'set_post_status', 'set_reply_status', 'update_report', 'suspend_user', 'lift_suspension', 'remove_avatar',
  'set_role', 'bootstrap_super_admin', 'grant_verification', 'revoke_verification'
));

-- Append-only, except for FK actions that null a deleted account's id.
create or replace function private.audit_logs_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'moderator_id' - 'affected_user_id') = (to_jsonb(old) - 'moderator_id' - 'affected_user_id')
     and (new.moderator_id is not distinct from old.moderator_id or new.moderator_id is null)
     and (new.affected_user_id is not distinct from old.affected_user_id or new.affected_user_id is null) then
    return new;
  end if;
  raise exception 'audit_log_immutable' using errcode = 'P0001';
end;
$$;

-- Moderators read moderation actions; only Super Admins read role and
-- verification actions.
drop policy "moderation_audit_logs: moderators can read" on public.moderation_audit_logs;
create policy "moderation_audit_logs: staff can read by category"
  on public.moderation_audit_logs for select to authenticated
  using (
    private.is_super_admin()
    or (private.is_moderator() and action in (
      'set_post_status', 'set_reply_status', 'update_report', 'suspend_user', 'lift_suspension', 'remove_avatar'
    ))
  );

alter table public.notifications drop constraint notifications_type;
alter table public.notifications add constraint notifications_type check (type in (
  'post_reply', 'reply_reply', 'reaction_summary',
  'session_request', 'session_accepted', 'session_declined', 'session_cancelled', 'session_ended',
  'session_message', 'moderation_notice', 'account_update'
));

-- -----------------------------------------------------------------------------
-- 5. Initial Super Admin bootstrap (database owner only, once)
-- -----------------------------------------------------------------------------

create or replace function private.bootstrap_super_admin(p_handle text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
begin
  perform pg_advisory_xact_lock(hashtext('nafis:super_admins'));
  if exists (select 1 from public.user_roles r where r.role = 'super_admin') then
    raise exception 'super_admin_exists' using errcode = 'P0001',
      hint = 'Manage roles from the admin dashboard instead.';
  end if;

  select p.id into v_target from public.profiles p where p.handle = lower(btrim(p_handle));
  if v_target is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not private.can_participate(v_target) then
    raise exception 'suspended' using errcode = 'P0001';
  end if;

  insert into public.user_roles (user_id, role, reason)
  values (v_target, 'super_admin', 'Initial Super Admin bootstrap')
  on conflict (user_id) do update
    set role = 'super_admin', granted_at = now(), granted_by = null, reason = excluded.reason;

  insert into public.moderation_audit_logs (moderator_id, action, target_type, target_id, affected_user_id, reason)
  values (null, 'bootstrap_super_admin', 'user', v_target, v_target, 'Initial Super Admin bootstrap by the database owner');

  return v_target;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Admin RPCs (Super Admin unless stated)
-- -----------------------------------------------------------------------------

create or replace function public.admin_set_role(p_handle text, p_role text, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := auth.uid();
  v_target uuid;
  v_old    text;
  v_new    text := lower(btrim(coalesce(p_role, '')));
  v_reason text := nullif(btrim(p_reason), '');
begin
  if not private.is_super_admin(v_actor) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_new not in ('member', 'moderator', 'super_admin') then
    raise exception 'validation' using errcode = 'P0001';
  end if;

  select p.id into v_target from public.profiles p where p.handle = lower(btrim(p_handle));
  if v_target is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  v_old := private.role_of(v_target);
  if v_old = v_new then
    return v_new;
  end if;
  if v_new <> 'member' and not private.can_participate(v_target) then
    raise exception 'suspended' using errcode = 'P0001';
  end if;

  if v_new = 'member' then
    delete from public.user_roles where user_id = v_target; -- guard trigger protects the last Super Admin
  else
    insert into public.user_roles (user_id, role, granted_by, reason)
    values (v_target, v_new, v_actor, v_reason)
    on conflict (user_id) do update
      set role = excluded.role, granted_by = excluded.granted_by, granted_at = now(), reason = excluded.reason;
  end if;

  insert into public.moderation_audit_logs (moderator_id, action, target_type, target_id, affected_user_id, reason, metadata)
  values (v_actor, 'set_role', 'user', v_target, v_target, v_reason, jsonb_build_object('from', v_old, 'to', v_new));

  perform private.notify(v_target, null, 'account_update', null, null, null, jsonb_build_object('kind', 'role', 'role', v_new));
  return v_new;
end;
$$;

create or replace function public.admin_set_verification(p_handle text, p_verified boolean, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := auth.uid();
  v_target uuid;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if not private.is_super_admin(v_actor) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select p.id into v_target from public.profiles p where p.handle = lower(btrim(p_handle));
  if v_target is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if p_verified then
    if exists (select 1 from public.account_verifications v where v.user_id = v_target) then
      return true;
    end if;
    insert into public.account_verifications (user_id, verified_by, reason) values (v_target, v_actor, v_reason);
    insert into public.moderation_audit_logs (moderator_id, action, target_type, target_id, affected_user_id, reason)
    values (v_actor, 'grant_verification', 'user', v_target, v_target, v_reason);
    perform private.notify(v_target, null, 'account_update', null, null, null, jsonb_build_object('kind', 'verified'));
    return true;
  end if;

  delete from public.account_verifications where user_id = v_target;
  if not found then
    return false;
  end if;
  insert into public.moderation_audit_logs (moderator_id, action, target_type, target_id, affected_user_id, reason)
  values (v_actor, 'revoke_verification', 'user', v_target, v_target, v_reason);
  perform private.notify(v_target, null, 'account_update', null, null, null, jsonb_build_object('kind', 'unverified'));
  return false;
end;
$$;

create or replace function public.admin_overview(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
begin
  if not private.is_super_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'days', least(greatest(coalesce(p_days, 30), 1), 365),
    'total_users', (select count(*) from public.profiles),
    'onboarded_users', (select count(*) from public.profiles where onboarding_completed),
    'new_users', (select count(*) from public.profiles where created_at >= v_since),
    'signed_in_users', (select count(*) from auth.users u where u.last_sign_in_at >= v_since),
    'active_contributors', (
      select count(distinct x.uid) from (
        select author_id as uid from public.posts where created_at >= v_since
        union all select author_id from public.replies where created_at >= v_since
        union all select user_id from public.reactions where created_at >= v_since
        union all select sender_id from public.private_messages where created_at >= v_since
      ) x
    ),
    'total_posts', (select count(*) from public.posts where visibility = 'community'),
    'new_posts', (select count(*) from public.posts where visibility = 'community' and published_at >= v_since),
    'total_replies', (select count(*) from public.replies),
    'new_replies', (select count(*) from public.replies where created_at >= v_since),
    'pending_reports', (select count(*) from public.reports where status in ('open', 'reviewing')),
    'open_cases', (
      select count(*) from (
        select distinct target_type, target_id from public.reports where status in ('open', 'reviewing')
      ) c
    ),
    'verified_users', (select count(*) from public.account_verifications),
    'moderators', (select count(*) from public.user_roles where role = 'moderator'),
    'super_admins', (select count(*) from public.user_roles where role = 'super_admin'),
    'suspended_users', (select count(*) from public.account_restrictions where suspended_until > now()),
    'open_sessions', (select count(*) from public.private_sessions where status in ('requested', 'accepted', 'active'))
  );
end;
$$;

create or replace function public.admin_activity_series(p_days integer default 30)
returns table (day date, registrations integer, posts integer, replies integer, contributors integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_today date := (now() at time zone 'utc')::date;
begin
  if not private.is_super_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  return query
  with days as (
    select generate_series(v_today - (v_days - 1), v_today, interval '1 day')::date as d
  ),
  activity as (
    select author_id as uid, created_at from public.posts where created_at >= v_today - v_days
    union all select author_id, created_at from public.replies where created_at >= v_today - v_days
    union all select user_id, created_at from public.reactions where created_at >= v_today - v_days
    union all select sender_id, created_at from public.private_messages where created_at >= v_today - v_days
  )
  select
    d.d,
    (select count(*)::int from public.profiles p where (p.created_at at time zone 'utc')::date = d.d),
    (select count(*)::int from public.posts p where p.visibility = 'community' and (p.published_at at time zone 'utc')::date = d.d),
    (select count(*)::int from public.replies r where (r.created_at at time zone 'utc')::date = d.d),
    (select count(distinct a.uid)::int from activity a where (a.created_at at time zone 'utc')::date = d.d)
  from days d
  order by d.d;
end;
$$;

create or replace function public.admin_list_users(
  p_search     text default null,
  p_role       text default null,
  p_verified   boolean default null,
  p_restricted boolean default null,
  p_sort       text default 'newest',
  p_limit      integer default 25,
  p_offset     integer default 0
)
returns table (
  handle               text,
  display_name         text,
  avatar_key           text,
  avatar_path          text,
  role                 text,
  is_verified          boolean,
  verified_at          timestamptz,
  created_at           timestamptz,
  onboarding_completed boolean,
  suspended_until      timestamptz,
  post_count           integer,
  open_reports         integer,
  total_count          bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_term text := nullif(btrim(coalesce(p_search, '')), '');
  v_like text;
begin
  if not private.is_super_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_term is not null then
    v_like := '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select
    p.handle, p.display_name, p.avatar_key, p.avatar_path,
    coalesce(r.role, 'member'),
    v.user_id is not null, v.verified_at,
    p.created_at, p.onboarding_completed,
    case when ar.suspended_until > now() then ar.suspended_until end,
    (select count(*)::int from public.posts po where po.author_id = p.id and po.visibility = 'community'),
    (select count(*)::int from public.reports rp where rp.target_user_id = p.id and rp.status in ('open', 'reviewing')),
    count(*) over ()
  from public.profiles p
  left join public.user_roles r on r.user_id = p.id
  left join public.account_verifications v on v.user_id = p.id
  left join public.account_restrictions ar on ar.user_id = p.id
  where (v_like is null or p.handle ilike v_like or p.display_name ilike v_like)
    and (p_role is null or coalesce(r.role, 'member') = p_role)
    and (p_verified is null or (v.user_id is not null) = p_verified)
    and (p_restricted is null or coalesce(ar.suspended_until > now(), false) = p_restricted)
  order by
    case when p_sort = 'verified' then v.verified_at end desc nulls last,
    case when p_sort = 'oldest' then p.created_at end asc,
    case when p_sort = 'name' then lower(p.display_name) end asc,
    p.created_at desc,
    p.handle
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_get_user(p_handle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_result jsonb;
begin
  if not private.is_super_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select p.id into v_id from public.profiles p where p.handle = lower(btrim(p_handle));
  if v_id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'handle', p.handle,
    'display_name', p.display_name,
    'avatar_key', p.avatar_key,
    'avatar_path', p.avatar_path,
    'bio', p.bio,
    'preferred_language', p.preferred_language,
    'onboarding_completed', p.onboarding_completed,
    'created_at', p.created_at,
    'last_sign_in_at', (select u.last_sign_in_at from auth.users u where u.id = v_id),
    'role', private.role_of(v_id),
    'role_granted_at', r.granted_at,
    'role_granted_by', (select g.handle from public.profiles g where g.id = r.granted_by),
    'role_reason', r.reason,
    'is_verified', v.user_id is not null,
    'verified_at', v.verified_at,
    'verified_by', (select g.handle from public.profiles g where g.id = v.verified_by),
    'verification_reason', v.reason,
    'suspended_until', case when ar.suspended_until > now() then ar.suspended_until end,
    'suspension_reason', case when ar.suspended_until > now() then ar.reason end,
    'counts', jsonb_build_object(
      'posts', (select count(*) from public.posts po where po.author_id = v_id and po.visibility = 'community'),
      'replies', (select count(*) from public.replies re where re.author_id = v_id),
      'reports_open', (select count(*) from public.reports rp where rp.target_user_id = v_id and rp.status in ('open', 'reviewing')),
      'reports_total', (select count(*) from public.reports rp where rp.target_user_id = v_id),
      'reports_filed', (select count(*) from public.reports rp where rp.reporter_id = v_id),
      'hidden_or_removed', (
        (select count(*) from public.posts po where po.author_id = v_id and po.status <> 'active')
        + (select count(*) from public.replies re where re.author_id = v_id and re.status <> 'active')
      )
    ),
    'history', coalesce((
      select jsonb_agg(h order by h.created_at desc)
      from (
        select l.action, l.target_type, l.reason, l.metadata, l.created_at, a.handle as actor_handle
        from public.moderation_audit_logs l
        left join public.profiles a on a.id = l.moderator_id
        where l.affected_user_id = v_id
        order by l.created_at desc
        limit 50
      ) h
    ), '[]'::jsonb)
  )
  into v_result
  from public.profiles p
  left join public.user_roles r on r.user_id = p.id
  left join public.account_verifications v on v.user_id = p.id
  left join public.account_restrictions ar on ar.user_id = p.id
  where p.id = v_id;

  return v_result;
end;
$$;

-- Moderators and Super Admins (moderators see moderation actions only).
create or replace function public.admin_list_audit_logs(
  p_action          text default null,
  p_affected_handle text default null,
  p_limit           integer default 50,
  p_offset          integer default 0
)
returns table (
  id                    uuid,
  actor_handle          text,
  actor_display_name    text,
  action                text,
  target_type           text,
  target_id             uuid,
  affected_handle       text,
  affected_display_name text,
  reason                text,
  metadata              jsonb,
  created_at            timestamptz,
  total_count           bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_super boolean := private.is_super_admin();
begin
  if not private.is_moderator() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  return query
  select l.id, a.handle, a.display_name, l.action, l.target_type, l.target_id, u.handle, u.display_name,
         l.reason, l.metadata, l.created_at, count(*) over ()
  from public.moderation_audit_logs l
  left join public.profiles a on a.id = l.moderator_id
  left join public.profiles u on u.id = l.affected_user_id
  where (v_super or l.action in ('set_post_status', 'set_reply_status', 'update_report', 'suspend_user', 'lift_suspension', 'remove_avatar'))
    and (p_action is null or l.action = p_action)
    and (p_affected_handle is null or u.handle = lower(btrim(p_affected_handle)))
  order by l.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

drop function public.mod_list_audit_logs(integer);

-- Moderators and Super Admins: currently restricted accounts.
create or replace function public.mod_list_restrictions()
returns table (
  handle            text,
  display_name      text,
  avatar_key        text,
  avatar_path       text,
  role              text,
  suspended_until   timestamptz,
  reason            text,
  created_at        timestamptz,
  created_by_handle text
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
  select p.handle, p.display_name, p.avatar_key, p.avatar_path, private.role_of(p.id),
         ar.suspended_until, ar.reason, ar.created_at, c.handle
  from public.account_restrictions ar
  join public.profiles p on p.id = ar.user_id
  left join public.profiles c on c.id = ar.created_by
  where ar.suspended_until > now()
  order by ar.suspended_until asc
  limit 200;
end;
$$;

-- Moderators: remove an inappropriate profile picture (the file is removed by
-- the orphan cleanup job). Staff pictures need a Super Admin.
create or replace function public.mod_remove_avatar(p_handle text, p_reason text default null)
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
  if private.role_of(v_target) <> 'member' and not private.is_super_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  update public.profiles set avatar_path = null where id = v_target and avatar_path is not null;
  if not found then
    return;
  end if;

  insert into public.moderation_audit_logs (moderator_id, action, target_type, target_id, affected_user_id, reason)
  values (auth.uid(), 'remove_avatar', 'user', v_target, v_target, nullif(btrim(p_reason), ''));
  perform private.notify(v_target, null, 'moderation_notice', null, null, null,
                         jsonb_build_object('target_type', 'avatar', 'status', 'removed'));
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Existing moderation RPCs: record the affected account, enforce hierarchy
-- -----------------------------------------------------------------------------

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

  insert into public.moderation_audit_logs (moderator_id, action, target_type, target_id, affected_user_id, reason, metadata)
  values (auth.uid(), 'set_' || p_target_type || '_status', p_target_type, p_target_id, v_author,
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
declare
  v_affected uuid;
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
   where id = p_report_id
  returning target_user_id into v_affected;

  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  insert into public.moderation_audit_logs (moderator_id, action, target_type, target_id, affected_user_id, reason, metadata)
  values (auth.uid(), 'update_report', 'report', p_report_id, v_affected, nullif(btrim(p_note), ''),
          jsonb_build_object('status', p_status));
end;
$$;

-- Moderators: members only, up to 30 days. Super Admins: members and
-- moderators, any length. Nobody can restrict a Super Admin (demote first).
create or replace function public.mod_suspend_user(p_handle text, p_days integer, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
  v_role   text;
  v_super  boolean := private.is_super_admin();
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

  v_role := private.role_of(v_target);
  if v_role = 'super_admin' or (v_role = 'moderator' and not v_super) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if coalesce(p_days, 0) <= 0 then
    delete from public.account_restrictions where user_id = v_target;
    insert into public.moderation_audit_logs (moderator_id, action, target_type, target_id, affected_user_id, reason)
    values (auth.uid(), 'lift_suspension', 'user', v_target, v_target, nullif(btrim(p_reason), ''));
    return;
  end if;

  if p_days > 30 and not v_super then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  insert into public.account_restrictions (user_id, suspended_until, reason, created_by)
  values (v_target, now() + make_interval(days => least(p_days, 3650)), nullif(btrim(p_reason), ''), auth.uid())
  on conflict (user_id) do update
    set suspended_until = excluded.suspended_until,
        reason = excluded.reason,
        created_by = excluded.created_by,
        created_at = now();

  insert into public.moderation_audit_logs (moderator_id, action, target_type, target_id, affected_user_id, reason, metadata)
  values (auth.uid(), 'suspend_user', 'user', v_target, v_target, nullif(btrim(p_reason), ''), jsonb_build_object('days', p_days));

  perform private.notify(v_target, null, 'moderation_notice', null, null, null,
                         jsonb_build_object('target_type', 'account', 'status', 'suspended', 'days', p_days));
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Read API: add profile pictures and verification badges
-- -----------------------------------------------------------------------------

drop function public.get_posts(integer, timestamptz, uuid, text, text, text, boolean, text, boolean, uuid, boolean, boolean);

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
  author_avatar_path     text,
  author_verified        boolean,
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
    a.handle, a.display_name, a.avatar_key, a.avatar_path,
    exists (select 1 from public.account_verifications av where av.user_id = p.author_id),
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
          and (p_cursor_at is null or (p.published_at, p.id) < (p_cursor_at, p_cursor_id)))
    )
  order by sort_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

drop function public.get_post_replies(uuid, integer, timestamptz, uuid);

create function public.get_post_replies(
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
  author_avatar_path  text,
  author_verified     boolean,
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
    a.handle, a.display_name, a.avatar_key, a.avatar_path,
    exists (select 1 from public.account_verifications av where av.user_id = r.author_id),
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

drop function public.get_public_profile(text);

create function public.get_public_profile(p_handle text)
returns table (
  handle              text,
  display_name        text,
  avatar_key          text,
  avatar_path         text,
  is_verified         boolean,
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
    p.handle, p.display_name, p.avatar_key, p.avatar_path,
    exists (select 1 from public.account_verifications av where av.user_id = p.id),
    p.bio,
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
    and not exists (select 1 from public.blocks b where b.blocker_id = p.id and b.blocked_id = auth.uid());
$$;

drop function public.list_blocked_users();

create function public.list_blocked_users()
returns table (handle text, display_name text, avatar_key text, avatar_path text, is_verified boolean, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.handle, p.display_name, p.avatar_key, p.avatar_path,
         exists (select 1 from public.account_verifications av where av.user_id = p.id),
         b.created_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

drop function public.list_available_listeners(text, text);

create function public.list_available_listeners(p_language text default null, p_topic text default null)
returns table (
  handle       text,
  display_name text,
  avatar_key   text,
  avatar_path  text,
  is_verified  boolean,
  languages    text[],
  topics       text[],
  note         text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.handle, p.display_name, p.avatar_key, p.avatar_path,
         exists (select 1 from public.account_verifications av where av.user_id = p.id),
         lp.languages, lp.topics, lp.note
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

drop function public.list_open_requests();

create function public.list_open_requests()
returns table (
  id                     uuid,
  language               text,
  topic                  text,
  intro                  text,
  created_at             timestamptz,
  requester_handle       text,
  requester_display_name text,
  requester_avatar_key   text,
  requester_avatar_path  text,
  requester_verified     boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.language, s.topic, s.intro, s.created_at, r.handle, r.display_name, r.avatar_key, r.avatar_path,
         exists (select 1 from public.account_verifications av where av.user_id = r.id)
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

drop function public.list_my_sessions(uuid);

create function public.list_my_sessions(p_session_id uuid default null)
returns table (
  id                        uuid,
  status                    text,
  end_reason                text,
  my_role                   text,
  is_open_request           boolean,
  counterpart_handle        text,
  counterpart_display_name  text,
  counterpart_avatar_key    text,
  counterpart_avatar_path   text,
  counterpart_verified      boolean,
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
    c.handle, c.display_name, c.avatar_key, c.avatar_path,
    c.id is not null and exists (select 1 from public.account_verifications av where av.user_id = c.id),
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

-- Orphaned profile pictures (server-only cleanup job).
create or replace function public.find_orphaned_avatar_objects(
  p_older_than interval default interval '1 hour',
  p_limit      integer default 200
)
returns table (name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'avatars'
    and o.created_at < now() - p_older_than
    and not exists (select 1 from public.profiles p where p.avatar_path = o.name)
  order by o.created_at
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
$$;

-- -----------------------------------------------------------------------------
-- 9. Privileges
-- -----------------------------------------------------------------------------

revoke all on public.account_verifications from anon, authenticated;
grant select on public.account_verifications to authenticated;

-- Helpers used in RLS policies need EXECUTE for authenticated.
revoke execute on function private.role_of(uuid), private.is_super_admin(uuid), private.user_roles_guard() from public, anon;
grant execute on function private.role_of(uuid), private.is_super_admin(uuid) to authenticated, service_role;

-- Bootstrap: database owner only.
revoke execute on function private.bootstrap_super_admin(text) from public, anon, authenticated, service_role;

revoke execute on function
  public.admin_set_role(text, text, text),
  public.admin_set_verification(text, boolean, text),
  public.admin_overview(integer),
  public.admin_activity_series(integer),
  public.admin_list_users(text, text, boolean, boolean, text, integer, integer),
  public.admin_get_user(text),
  public.admin_list_audit_logs(text, text, integer, integer),
  public.mod_list_restrictions(),
  public.mod_remove_avatar(text, text),
  public.get_posts(integer, timestamptz, uuid, text, text, text, boolean, text, boolean, uuid, boolean, boolean),
  public.get_post_replies(uuid, integer, timestamptz, uuid),
  public.get_public_profile(text),
  public.list_blocked_users(),
  public.list_available_listeners(text, text),
  public.list_open_requests(),
  public.list_my_sessions(uuid),
  public.find_orphaned_avatar_objects(interval, integer)
from public, anon;

grant execute on function
  public.admin_set_role(text, text, text),
  public.admin_set_verification(text, boolean, text),
  public.admin_overview(integer),
  public.admin_activity_series(integer),
  public.admin_list_users(text, text, boolean, boolean, text, integer, integer),
  public.admin_get_user(text),
  public.admin_list_audit_logs(text, text, integer, integer),
  public.mod_list_restrictions(),
  public.mod_remove_avatar(text, text),
  public.get_posts(integer, timestamptz, uuid, text, text, text, boolean, text, boolean, uuid, boolean, boolean),
  public.get_post_replies(uuid, integer, timestamptz, uuid),
  public.get_public_profile(text),
  public.list_blocked_users(),
  public.list_available_listeners(text, text),
  public.list_open_requests(),
  public.list_my_sessions(uuid)
to authenticated;

revoke execute on function public.find_orphaned_avatar_objects(interval, integer) from authenticated;
grant execute on function public.find_orphaned_avatar_objects(interval, integer) to service_role;
