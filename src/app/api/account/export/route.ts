import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Exports the signed-in user's own data as JSON. Every query runs with the
 * user's session, so RLS limits the export to rows they own. Messages written
 * by the other participant of a conversation are not included.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const supabase = await createClient();
  const [profile, posts, replies, reactions, replyReactions, bookmarks, journal, listening, notificationPrefs, sessions, messages, blocked, notifications] =
    await Promise.all([
      supabase.from("profiles").select("handle, display_name, avatar_key, bio, preferred_language, theme, hidden_topics, created_at, updated_at").eq("id", user.id).maybeSingle(),
      supabase.from("posts").select("id, post_type, content, caption, audio_duration_seconds, language, topic, response_preference, visibility, status, published_at, created_at, updated_at").eq("author_id", user.id),
      supabase.from("replies").select("id, post_id, parent_reply_id, content, status, created_at, updated_at").eq("author_id", user.id),
      supabase.from("reactions").select("post_id, reaction_type, created_at").eq("user_id", user.id),
      supabase.from("reply_reactions").select("reply_id, reaction_type, created_at").eq("user_id", user.id),
      supabase.from("bookmarks").select("post_id, created_at").eq("user_id", user.id),
      supabase.from("journal_entries").select("id, title, content, is_draft, created_at, updated_at").eq("user_id", user.id),
      supabase.from("listening_preferences").select("available, languages, topics, note, updated_at").eq("user_id", user.id).maybeSingle(),
      supabase.from("notification_preferences").select("replies, reaction_summaries, sessions, email_enabled").eq("user_id", user.id).maybeSingle(),
      supabase.rpc("list_my_sessions", { p_session_id: null }),
      supabase.from("private_messages").select("session_id, content, created_at").eq("sender_id", user.id),
      supabase.rpc("list_blocked_users"),
      supabase.from("notifications").select("type, created_at, read_at").eq("recipient_id", user.id),
    ]);

  const body = {
    exported_at: new Date().toISOString(),
    account: { email: user.email },
    profile: profile.data,
    posts: posts.data ?? [],
    replies: replies.data ?? [],
    reactions: reactions.data ?? [],
    reply_reactions: replyReactions.data ?? [],
    bookmarks: bookmarks.data ?? [],
    journal_entries: journal.data ?? [],
    listening_preferences: listening.data,
    notification_preferences: notificationPrefs.data,
    listening_sessions: sessions.data ?? [],
    messages_you_sent: messages.data ?? [],
    blocked_accounts: blocked.data ?? [],
    notifications: notifications.data ?? [],
    note: "Voice recordings are not embedded. Recordings are attached to your voice posts and can be played from the app.",
  };

  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="nafis-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
