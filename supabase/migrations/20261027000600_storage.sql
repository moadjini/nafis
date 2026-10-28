-- =============================================================================
-- Voice-note storage
--   * private bucket (never public); playback only through short-lived signed
--     URLs created with the viewer's own session, so these policies apply
--   * uploads only into the uploader's own folder: <auth.uid()>/<file>
--   * soft upload quota enforced in the INSERT policy
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-notes',
  'voice-notes',
  false,
  10485760, -- 10 MB
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/x-m4a']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Max 20 uploads per hour and 300 stored objects per user.
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
        and o.name like auth.uid()::text || '/%'
        and o.created_at > now() - interval '1 hour') < 20
    and
    (select count(*) from storage.objects o
      where o.bucket_id = 'voice-notes'
        and o.name like auth.uid()::text || '/%') < 300;
$$;

-- Whether the current user may play the object: it is their own, or it is
-- attached to a post they are allowed to read.
create or replace function private.can_play_audio(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    split_part(p_object_name, '/', 1) = auth.uid()::text
    or exists (
      select 1 from public.posts p
      where p.audio_storage_path = p_object_name
        and (
          private.is_moderator()
          or (p.visibility = 'community' and p.status = 'active'
              and not private.is_blocked_between(auth.uid(), p.author_id))
        )
    )
  );
$$;

create policy "voice-notes: upload into own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and private.can_participate()
    and private.voice_upload_quota_ok()
  );

create policy "voice-notes: read own or permitted"
  on storage.objects for select to authenticated
  using (bucket_id = 'voice-notes' and private.can_play_audio(name));

create policy "voice-notes: delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- No UPDATE policy: objects cannot be overwritten or moved by clients.

-- Used by the server-side cleanup job (service role only).
create or replace function public.find_orphaned_voice_objects(
  p_older_than interval default interval '24 hours',
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
  where o.bucket_id = 'voice-notes'
    and o.created_at < now() - p_older_than
    and not exists (select 1 from public.posts p where p.audio_storage_path = o.name)
  order by o.created_at
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
$$;
