-- Returns the storage object name of a voice post the caller may hear, or null.
-- Object names are random ("<uuid>.<ext>") and reveal nothing about the author.
create or replace function public.get_post_audio_path(p_post_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.audio_storage_path
  from public.posts p
  where p.id = p_post_id
    and p.post_type = 'voice'
    and private.can_view_post(p.id);
$$;

revoke execute on function public.get_post_audio_path(uuid) from public, anon;
grant execute on function public.get_post_audio_path(uuid) to authenticated;
