-- =============================================================================
-- Privileges and Realtime
-- Supabase grants ALL on new public tables/functions to anon and authenticated
-- by default. Nafis has no anonymous data access, and authenticated users get
-- only the table/column privileges listed below (RLS still applies on top).
-- NOTE: future migrations that add functions must repeat the revokes for anon.
-- =============================================================================

-- Nothing for anonymous visitors.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
revoke execute on all functions in schema private from anon, public;

-- Start authenticated from zero, then grant precisely.
revoke all on all tables in schema public from authenticated;

grant select on public.profiles to authenticated;
grant update (handle, display_name, avatar_key, bio, preferred_language, theme, hidden_topics, onboarding_completed)
  on public.profiles to authenticated;

grant select on public.user_roles to authenticated;
grant select on public.account_restrictions to authenticated;

grant select on public.notification_preferences to authenticated;
grant insert (user_id, replies, reaction_summaries, sessions, email_enabled)
  on public.notification_preferences to authenticated;
grant update (user_id, replies, reaction_summaries, sessions, email_enabled)
  on public.notification_preferences to authenticated;

grant select on public.blocks to authenticated;

grant select, delete on public.posts to authenticated;
grant insert (author_id, post_type, content, audio_storage_path, audio_duration_seconds, audio_mime_type,
              caption, language, topic, response_preference, visibility)
  on public.posts to authenticated;
grant update (content, caption, language, topic, response_preference, visibility)
  on public.posts to authenticated;

grant select, delete on public.reactions to authenticated;
grant insert (post_id, user_id, reaction_type) on public.reactions to authenticated;
grant update (reaction_type) on public.reactions to authenticated;

grant select, delete on public.replies to authenticated;
grant insert (post_id, author_id, parent_reply_id, content) on public.replies to authenticated;
grant update (content) on public.replies to authenticated;

grant select, delete on public.reply_reactions to authenticated;
grant insert (reply_id, user_id, reaction_type) on public.reply_reactions to authenticated;
grant update (reaction_type) on public.reply_reactions to authenticated;

grant select, delete on public.bookmarks to authenticated;
grant insert (user_id, post_id) on public.bookmarks to authenticated;

grant select, delete on public.muted_threads to authenticated;
grant insert (user_id, post_id) on public.muted_threads to authenticated;

grant select, delete on public.journal_entries to authenticated;
grant insert (user_id, title, content, is_draft) on public.journal_entries to authenticated;
grant update (title, content, is_draft) on public.journal_entries to authenticated;

grant select on public.listening_preferences to authenticated;
grant insert (user_id, available, languages, topics, note) on public.listening_preferences to authenticated;
grant update (user_id, available, languages, topics, note) on public.listening_preferences to authenticated;

grant select on public.private_sessions to authenticated;

grant select on public.private_messages to authenticated;
grant insert (session_id, sender_id, content) on public.private_messages to authenticated;

grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- reports: no direct access (create_report / mod_* RPCs only)
grant select on public.moderation_audit_logs to authenticated;

-- Private helpers are referenced from RLS policies, so the authenticated role
-- needs EXECUTE. The private schema is not exposed through the Data API.
grant execute on all functions in schema private to authenticated, service_role;

-- Public RPC surface for signed-in members.
grant execute on function
  public.get_posts(integer, timestamptz, uuid, text, text, text, boolean, text, boolean, uuid, boolean),
  public.get_post_replies(uuid, integer, timestamptz, uuid),
  public.get_reaction_state(text, uuid),
  public.set_reaction(text, uuid, text),
  public.get_public_profile(text),
  public.list_blocked_users(),
  public.list_available_listeners(text, text),
  public.list_open_requests(),
  public.list_my_sessions(uuid),
  public.get_notifications(integer, timestamptz),
  public.get_unread_notification_count(),
  public.request_listening_session(text, text, text, text),
  public.respond_to_session(uuid, boolean),
  public.cancel_session_request(uuid),
  public.end_session(uuid),
  public.block_user(text),
  public.unblock_user(text),
  public.create_report(text, text, uuid, text, text),
  public.mod_list_reports(text, integer),
  public.mod_set_content_status(text, uuid, text, text),
  public.mod_update_report(uuid, text, text),
  public.mod_suspend_user(text, integer, text),
  public.mod_list_audit_logs(integer)
to authenticated;

-- Server-only maintenance.
revoke execute on function public.find_orphaned_voice_objects(interval, integer) from authenticated;
grant execute on function public.find_orphaned_voice_objects(interval, integer) to service_role;

-- Realtime: live chat, session state and notification badges. Realtime
-- evaluates each subscriber's SELECT policy before delivering a change.
alter publication supabase_realtime add table public.private_messages;
alter publication supabase_realtime add table public.private_sessions;
alter publication supabase_realtime add table public.notifications;
