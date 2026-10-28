import "server-only";
import { PAGE_SIZE, REPLY_PAGE_SIZE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type {
  ActivityPoint,
  AdminOverview,
  AdminUserDetail,
  AdminUserRow,
  AuditLogRow,
  BlockedUser,
  FeedCursor,
  FeedFilters,
  JournalEntry,
  ListenerRow,
  ListeningPreferences,
  MessageRow,
  ModReportRow,
  NotificationPreferences,
  NotificationRow,
  OpenRequestRow,
  PostCursor,
  PostRow,
  PromotionRow,
  PublicProfile,
  ReplyRow,
  RestrictionRow,
  SessionRow,
} from "@/lib/types";

// Read helpers for Server Components. All queries run as the signed-in user;
// visibility, blocking and moderation rules are enforced in the database.

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * One feed page. "top" pages by offset against a fixed ranking time so later
 * pages line up with the first; everything else uses keyset pagination.
 */
export async function fetchFeedPage(supabase: Supabase, filters: FeedFilters, cursor: FeedCursor | null, limit = PAGE_SIZE) {
  const top = filters.sort === "top";
  const ranked = cursor && "rankedAt" in cursor ? cursor : null;
  const keyset = cursor && "at" in cursor ? cursor : null;
  const rankedAt = ranked?.rankedAt ?? new Date().toISOString();
  const offset = ranked?.offset ?? 0;

  const result = await supabase.rpc("get_posts", {
    p_limit: limit,
    p_cursor_at: top ? null : (keyset?.at ?? null),
    p_cursor_id: top ? null : (keyset?.id ?? null),
    p_post_type: filters.postType ?? null,
    p_topic: filters.topic ?? null,
    p_language: filters.language ?? null,
    p_seeking: filters.seeking ?? false,
    p_author_handle: filters.authorHandle ?? null,
    p_bookmarked: filters.bookmarked ?? false,
    p_inviting: filters.inviting ?? false,
    p_sort: top ? "top" : "latest",
    p_offset: top ? offset : 0,
    p_ranked_at: top ? rankedAt : null,
  });
  if (result.error) return { ok: false as const, error: result.error };

  const posts = (result.data ?? []) as PostRow[];
  const last = posts.at(-1);
  let nextCursor: FeedCursor | null = null;
  if (posts.length === limit && last) {
    nextCursor = top ? { rankedAt, offset: offset + limit } : { at: last.sort_at, id: last.id };
  }
  return { ok: true as const, posts, nextCursor };
}

export async function getPosts(filters: FeedFilters = {}, cursor: FeedCursor | null = null, limit = PAGE_SIZE) {
  const page = await fetchFeedPage(await createClient(), filters, cursor, limit);
  if (!page.ok) throw new Error(`get_posts failed: ${page.error.message}`);
  return { posts: page.posts, nextCursor: page.nextCursor };
}

export async function getPost(postId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_posts", { p_post_id: postId, p_limit: 1 });
  if (error) throw new Error(`get_posts(single) failed: ${error.message}`);
  return ((data ?? []) as PostRow[])[0] ?? null;
}

export async function getDrafts() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_posts", { p_drafts: true, p_limit: 50 });
  if (error) throw new Error(`get_posts(drafts) failed: ${error.message}`);
  return (data ?? []) as PostRow[];
}

export async function getReplies(postId: string, cursor: PostCursor | null = null) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_post_replies", {
    p_post_id: postId,
    p_limit: REPLY_PAGE_SIZE,
    p_cursor_at: cursor?.at ?? null,
    p_cursor_id: cursor?.id ?? null,
  });
  if (error) throw new Error(`get_post_replies failed: ${error.message}`);
  const replies = (data ?? []) as ReplyRow[];
  const last = replies.at(-1);
  const nextCursor: PostCursor | null =
    replies.length === REPLY_PAGE_SIZE && last ? { at: last.created_at, id: last.id } : null;
  return { replies, nextCursor };
}

export async function getPublicProfile(handle: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_profile", { p_handle: handle });
  if (error) throw new Error(`get_public_profile failed: ${error.message}`);
  return ((data ?? []) as PublicProfile[])[0] ?? null;
}

export async function listAvailableListeners(language?: string | null, topic?: string | null) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_available_listeners", {
    p_language: language ?? null,
    p_topic: topic ?? null,
  });
  if (error) throw new Error(`list_available_listeners failed: ${error.message}`);
  return (data ?? []) as ListenerRow[];
}

export async function listOpenRequests() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_open_requests");
  if (error) throw new Error(`list_open_requests failed: ${error.message}`);
  return (data ?? []) as OpenRequestRow[];
}

export async function listMySessions() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_sessions", { p_session_id: null });
  if (error) throw new Error(`list_my_sessions failed: ${error.message}`);
  return (data ?? []) as SessionRow[];
}

export async function getSession(sessionId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_sessions", { p_session_id: sessionId });
  if (error) throw new Error(`list_my_sessions(single) failed: ${error.message}`);
  return ((data ?? []) as SessionRow[])[0] ?? null;
}

export async function getMessages(sessionId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("private_messages")
    .select("id, session_id, sender_id, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(`private_messages failed: ${error.message}`);
  return (data ?? []) as MessageRow[];
}

export async function getNotifications(cursorAt: string | null = null) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_notifications", { p_limit: 30, p_cursor_at: cursorAt });
  if (error) throw new Error(`get_notifications failed: ${error.message}`);
  return (data ?? []) as NotificationRow[];
}

export async function getUnreadNotificationCount() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_unread_notification_count");
  if (error) return 0;
  return (data as number | null) ?? 0;
}

export async function getJournalEntries() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("journal_entries")
    .select("id, title, content, is_draft, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`journal_entries failed: ${error.message}`);
  return (data ?? []) as JournalEntry[];
}

export async function getJournalEntry(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("journal_entries")
    .select("id, title, content, is_draft, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`journal_entries(single) failed: ${error.message}`);
  return (data as JournalEntry | null) ?? null;
}

export async function getListeningPreferences(userId: string): Promise<ListeningPreferences> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("listening_preferences")
    .select("available, languages, topics, note")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as ListeningPreferences | null) ?? { available: false, languages: ["en"], topics: [], note: null };
}

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notification_preferences")
    .select("replies, reaction_summaries, sessions, email_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as NotificationPreferences | null) ?? {
    replies: true,
    reaction_summaries: true,
    sessions: true,
    email_enabled: false,
  };
}

export async function listBlockedUsers() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_blocked_users");
  if (error) throw new Error(`list_blocked_users failed: ${error.message}`);
  return (data ?? []) as BlockedUser[];
}

export async function modListReports(status: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mod_list_reports", { p_status: status, p_limit: 100 });
  if (error) return null;
  return (data ?? []) as ModReportRow[];
}

// ---- Staff (every RPC re-checks the caller's role and raises not_allowed) ----

type Loaded<T> = { ok: true; data: T } | { ok: false; error: string };

async function staffRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<Loaded<T>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    return { ok: false, error: error.message === "not_allowed" || error.message === "not_found" ? error.message : "generic" };
  }
  return { ok: true, data: data as T };
}

export function adminListAuditLogs(filters: { action?: string | null; affectedHandle?: string | null; page?: number }, pageSize = 30) {
  const page = Math.max(1, filters.page ?? 1);
  return staffRpc<AuditLogRow[]>("admin_list_audit_logs", {
    p_action: filters.action ?? null,
    p_affected_handle: filters.affectedHandle ?? null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
}

export function adminListPromotions() {
  return staffRpc<PromotionRow[]>("admin_list_promotions");
}

export function modListRestrictions() {
  return staffRpc<RestrictionRow[]>("mod_list_restrictions");
}

export function adminOverview(days: number) {
  return staffRpc<AdminOverview>("admin_overview", { p_days: days });
}

export function adminActivitySeries(days: number) {
  return staffRpc<ActivityPoint[]>("admin_activity_series", { p_days: days });
}

export type AdminUserFilters = {
  search?: string | null;
  role?: string | null;
  verified?: boolean | null;
  restricted?: boolean | null;
  sort?: "newest" | "oldest" | "name" | "verified";
  page?: number;
};

export function adminListUsers(filters: AdminUserFilters, pageSize = 20) {
  const page = Math.max(1, filters.page ?? 1);
  return staffRpc<AdminUserRow[]>("admin_list_users", {
    p_search: filters.search ?? null,
    p_role: filters.role ?? null,
    p_verified: filters.verified ?? null,
    p_restricted: filters.restricted ?? null,
    p_sort: filters.sort ?? "newest",
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
}

export function adminGetUser(handle: string) {
  return staffRpc<AdminUserDetail>("admin_get_user", { p_handle: handle });
}
