-- Called by the upload server action (with the user's own session) before an
-- image is processed: blocks suspended accounts and rate-limits uploads in the
-- database, where the limit cannot be bypassed by calling the action directly.
create or replace function public.register_avatar_upload()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if not private.can_participate() then
    raise exception 'suspended' using errcode = 'P0001';
  end if;
  perform private.enforce_rate_limit('avatar_upload', 10, interval '1 hour');
end;
$$;

revoke execute on function public.register_avatar_upload() from public, anon;
grant execute on function public.register_avatar_upload() to authenticated;
