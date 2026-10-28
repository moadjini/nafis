-- =============================================================================
-- Voice notes: ownership by storage owner_id instead of a <user-id>/ folder.
-- Object names become "<random-uuid>.<ext>", so signed playback URLs never
-- contain the author's internal account id. Storage sets owner_id from the
-- uploader's JWT, and these policies check it.
-- =============================================================================

alter table public.posts drop constraint posts_audio_in_owner_folder;
alter table public.posts add constraint posts_audio_path_format check (
  audio_storage_path is null
  or audio_storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|ogg|m4a|mp3|wav|aac)$'
);

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

  -- The recording must exist and belong to the author.
  if new.post_type = 'voice' and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'voice-notes'
      and o.name = new.audio_storage_path
      and o.owner_id = new.author_id::text
  ) then
    raise exception 'audio_not_found' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create or replace function private.voice_upload_quota_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from storage.objects o
      where o.bucket_id = 'voice-notes'
        and o.owner_id = auth.uid()::text
        and o.created_at > now() - interval '1 hour') < 20
    and
    (select count(*) from storage.objects o
      where o.bucket_id = 'voice-notes'
        and o.owner_id = auth.uid()::text) < 300;
$$;

create or replace function private.can_play_audio(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.posts p
    where p.audio_storage_path = p_object_name
      and (
        p.author_id = auth.uid()
        or private.is_moderator()
        or (p.visibility = 'community' and p.status = 'active'
            and not private.is_blocked_between(auth.uid(), p.author_id))
      )
  );
$$;

drop policy "voice-notes: upload into own folder" on storage.objects;
drop policy "voice-notes: read own or permitted" on storage.objects;
drop policy "voice-notes: delete own" on storage.objects;

create policy "voice-notes: members upload their own recordings"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'voice-notes'
    and owner_id = (select auth.uid())::text
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|ogg|m4a|mp3|wav|aac)$'
    and private.can_participate()
    and private.voice_upload_quota_ok()
  );

create policy "voice-notes: owner or permitted listener can read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'voice-notes'
    and (owner_id = (select auth.uid())::text or private.can_play_audio(name))
  );

create policy "voice-notes: owner can delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'voice-notes' and owner_id = (select auth.uid())::text);

-- Service-role helper for account deletion.
create or replace function public.voice_objects_owned_by(p_user uuid)
returns table (name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name from storage.objects o
  where o.bucket_id = 'voice-notes' and o.owner_id = p_user::text;
$$;

revoke execute on function public.voice_objects_owned_by(uuid) from public, anon, authenticated;
grant execute on function public.voice_objects_owned_by(uuid) to service_role;
revoke execute on function private.voice_upload_quota_ok() from public, anon;
revoke execute on function private.can_play_audio(text) from public, anon;
revoke execute on function private.posts_before_insert() from public, anon;
grant execute on function private.voice_upload_quota_ok(), private.can_play_audio(text) to authenticated;
