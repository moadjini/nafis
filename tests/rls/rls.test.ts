/**
 * Row Level Security, storage and workflow tests against the real Supabase
 * project configured in .env.local. Uses four throwaway accounts:
 *   A, B — ordinary members; C — moderator; D — used for account deletion.
 * All accounts (and their data/recordings) are deleted in afterAll.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteUserAccount } from "@/lib/account-deletion";
import { adminClient, anonClient, audioName, configured, createTestUser, deleteTestUser, fakeAudio, purgeSafetyRecords, type TestUser } from "../support/supabase";

const suite = configured ? describe : describe.skip;

suite("Nafis RLS & permissions (live Supabase)", () => {
  let admin: SupabaseClient;
  let A: TestUser;
  let B: TestUser;
  let C: TestUser;
  let D: TestUser | undefined;

  const ids: Record<string, string> = {};

  async function onboard(user: TestUser, name: string) {
    const { error } = await user.client
      .from("profiles")
      .update({ display_name: name, onboarding_completed: true, avatar_key: "leaf" })
      .eq("id", user.id);
    expect(error).toBeNull();
  }

  async function postsFor(user: TestUser, params: Record<string, unknown> = {}) {
    const { data, error } = await user.client.rpc("get_posts", { p_limit: 50, ...params });
    expect(error).toBeNull();
    return (data ?? []) as Record<string, unknown>[];
  }

  beforeAll(async () => {
    admin = adminClient();
    [A, B, C] = await Promise.all([createTestUser(admin, "a"), createTestUser(admin, "b"), createTestUser(admin, "c")]);
    createdUserIds.push(A.id, B.id, C.id);
    await Promise.all([onboard(A, "Test Member A"), onboard(B, "Test Member B"), onboard(C, "Test Moderator C")]);
    const { error } = await admin.from("user_roles").insert({ user_id: C.id, role: "moderator" });
    if (error) throw new Error(`grant moderator failed: ${error.message}`);
  });

  const createdUserIds: string[] = [];

  afterAll(async () => {
    if (!admin) return;
    for (const user of [A, B, C, D]) await deleteTestUser(admin, user).catch(() => undefined);
    await purgeSafetyRecords([...Object.values(ids), ...createdUserIds]);
  });

  // ---------------------------------------------------------------------------
  describe("authentication & profiles", () => {
    it("creates a pseudonymous profile automatically for new users", async () => {
      const { data } = await admin.from("profiles").select("handle, display_name, onboarding_completed").eq("id", B.id).single();
      expect(data?.handle).toMatch(/^[a-z0-9_]{3,24}$/);
      expect(JSON.stringify(data)).not.toContain(B.email);
    });

    it("rejects a wrong password and allows sign-out", async () => {
      const client = anonClient();
      const bad = await client.auth.signInWithPassword({ email: A.email, password: "definitely-wrong" });
      expect(bad.error?.code).toBe("invalid_credentials");
      const good = await client.auth.signInWithPassword({ email: A.email, password: A.password });
      expect(good.error).toBeNull();
      await client.auth.signOut();
      const after = await client.from("profiles").select("id").eq("id", A.id);
      expect(after.error?.code ?? "").toBe("42501"); // anon has no table privileges
    });

    it("lets a signed-in user change their password (final step of the reset flow)", async () => {
      const client = anonClient();
      await client.auth.signInWithPassword({ email: A.email, password: A.password });
      const next = `${A.password}-new`;
      expect((await client.auth.updateUser({ password: next })).error).toBeNull();
      const relog = anonClient();
      expect((await relog.auth.signInWithPassword({ email: A.email, password: next })).error).toBeNull();
      A.password = next;
    });

    it("blocks anonymous access to every table and RPC", async () => {
      const anon = anonClient();
      for (const table of ["profiles", "posts", "journal_entries", "private_messages", "notifications", "reports"]) {
        const { error } = await anon.from(table).select("*").limit(1);
        expect(error, table).not.toBeNull();
      }
      const { error } = await anon.rpc("get_posts", {});
      expect(error).not.toBeNull();
    });

    it("hides other people's profile rows and protected fields", async () => {
      const { data } = await A.client.from("profiles").select("id").eq("id", B.id);
      expect(data).toEqual([]);

      const { data: pub } = await A.client.rpc("get_public_profile", { p_handle: B.handle });
      const row = (pub as Record<string, unknown>[])[0]!;
      expect(row.display_name).toBe("Test Member B");
      expect(row).not.toHaveProperty("id");
      expect(JSON.stringify(row)).not.toContain(B.id);
    });

    it("prevents editing someone else's profile, changing ids, or self-granting moderator", async () => {
      const other = await A.client.from("profiles").update({ display_name: "Hacked" }).eq("id", B.id).select("id");
      expect(other.data).toEqual([]);

      const idChange = await A.client.from("profiles").update({ id: B.id }).eq("id", A.id);
      expect(idChange.error?.code).toBe("42501");

      const role = await A.client.from("user_roles").insert({ user_id: A.id, role: "admin" });
      expect(role.error).not.toBeNull();

      const { data: myRole } = await A.client.from("user_roles").select("role").eq("user_id", A.id);
      expect(myRole).toEqual([]);
    });

    it("saves onboarding listening preferences only for oneself", async () => {
      const own = await B.client
        .from("listening_preferences")
        .upsert({ user_id: B.id, available: true, languages: ["en", "so"], topics: [] }, { onConflict: "user_id" });
      expect(own.error).toBeNull();
      const forged = await A.client.from("listening_preferences").insert({ user_id: B.id, available: false, languages: ["en"] });
      expect(forged.error).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe("posts, drafts & feed", () => {
    it("lets A publish a community post and keep a private draft", async () => {
      const pub = await A.client
        .from("posts")
        .insert({ author_id: A.id, post_type: "text", content: "RLS test post", language: "en", response_preference: "just_listen" })
        .select("id")
        .single();
      expect(pub.error).toBeNull();
      ids.postA = pub.data!.id;

      const draft = await A.client
        .from("posts")
        .insert({ author_id: A.id, post_type: "text", content: "Private draft", language: "en", response_preference: "express", visibility: "draft" })
        .select("id")
        .single();
      expect(draft.error).toBeNull();
      ids.draftA = draft.data!.id;
    });

    it("never shows A's draft to B", async () => {
      expect(await postsFor(B, { p_post_id: ids.draftA })).toEqual([]);
      const direct = await B.client.from("posts").select("id").eq("id", ids.draftA);
      expect(direct.data).toEqual([]);
      expect((await postsFor(B, { p_drafts: true })).map((p) => p.id)).not.toContain(ids.draftA);
      expect((await postsFor(A, { p_drafts: true })).map((p) => p.id)).toContain(ids.draftA);
    });

    it("shows community posts to B without exposing author ids", async () => {
      const feed = await postsFor(B);
      const post = feed.find((p) => p.id === ids.postA)!;
      expect(post).toBeTruthy();
      expect(post).not.toHaveProperty("author_id");
      expect(JSON.stringify(post)).not.toContain(A.id);
      expect(post.is_mine).toBe(false);
      expect(feed.map((p) => p.id)).not.toContain(ids.draftA);
    });

    it("forbids B from editing, deleting or impersonating A's posts", async () => {
      const upd = await B.client.from("posts").update({ content: "changed" }).eq("id", ids.postA).select("id");
      expect(upd.data).toEqual([]);
      const del = await B.client.from("posts").delete().eq("id", ids.postA).select("id");
      expect(del.data).toEqual([]);
      const forged = await B.client
        .from("posts")
        .insert({ author_id: A.id, post_type: "text", content: "forged", language: "en", response_preference: "advice" });
      expect(forged.error?.code).toBe("42501");
      const status = await B.client
        .from("posts")
        .insert({ author_id: B.id, post_type: "text", content: "x", language: "en", response_preference: "advice", status: "removed" });
      expect(status.error?.code).toBe("42501"); // no column privilege on status
    });

    it("lets A edit their own post but not unpublish it", async () => {
      const edit = await A.client.from("posts").update({ content: "RLS test post (edited)" }).eq("id", ids.postA).select("id");
      expect(edit.data).toHaveLength(1);
      const [row] = await postsFor(A, { p_post_id: ids.postA });
      expect(row!.edited_at).not.toBeNull();
      const unpublish = await A.client.from("posts").update({ visibility: "draft" }).eq("id", ids.postA);
      expect(unpublish.error?.message).toBe("cannot_unpublish");
    });
  });

  // ---------------------------------------------------------------------------
  describe("reactions", () => {
    async function react(user: TestUser, reaction: string | null, target = ids.postA) {
      const { data, error } = await user.client.rpc("set_reaction", { p_target_type: "post", p_target_id: target, p_reaction: reaction });
      return { row: ((data ?? []) as { reactions: Record<string, number>; my_reaction: string | null }[])[0], error };
    }

    it("creates, changes and removes a single reaction with persisted counts", async () => {
      let r = await react(B, "heart");
      expect(r.error).toBeNull();
      expect(r.row).toEqual({ reactions: { heart: 1 }, my_reaction: "heart" });

      r = await react(B, "hug");
      expect(r.row).toEqual({ reactions: { hug: 1 }, my_reaction: "hug" });

      r = await react(C, "heart");
      expect(r.row?.reactions).toEqual({ hug: 1, heart: 1 });

      r = await react(B, null);
      expect(r.row).toEqual({ reactions: { heart: 1 }, my_reaction: null });
    });

    it("enforces one reaction per user per post at the database level", async () => {
      await react(B, "care");
      const dup = await B.client.from("reactions").insert({ post_id: ids.postA, user_id: B.id, reaction_type: "peace" });
      expect(dup.error?.code).toBe("23505");
    });

    it("does not allow reacting as someone else or reading their reaction rows", async () => {
      const forged = await B.client.from("reactions").insert({ post_id: ids.postA, user_id: A.id, reaction_type: "heart" });
      expect(forged.error?.code).toBe("42501");
      const { data } = await B.client.from("reactions").select("user_id").eq("post_id", ids.postA);
      expect((data ?? []).every((r) => r.user_id === B.id)).toBe(true);
    });

    it("does not allow reacting to drafts", async () => {
      const r = await react(B, "heart", ids.draftA);
      expect(r.error).not.toBeNull();
    });

    it("notifies the author with an anonymous reaction summary", async () => {
      const { data } = await A.client.from("notifications").select("type, actor_id, data").eq("type", "reaction_summary").eq("related_post_id", ids.postA);
      expect(data!.length).toBeGreaterThanOrEqual(1);
      expect(data![0]!.actor_id).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe("replies & notifications", () => {
    it("lets B reply and A respond in a nested thread", async () => {
      const b = await B.client.from("replies").insert({ post_id: ids.postA, author_id: B.id, content: "I'm here to listen." }).select("id").single();
      expect(b.error).toBeNull();
      ids.replyB = b.data!.id;
      const a = await A.client
        .from("replies")
        .insert({ post_id: ids.postA, author_id: A.id, parent_reply_id: ids.replyB, content: "Thank you." })
        .select("id")
        .single();
      expect(a.error).toBeNull();
      ids.replyA = a.data!.id;
    });

    it("rejects cross-post threading and over-deep nesting", async () => {
      const other = await C.client
        .from("posts")
        .insert({ author_id: C.id, post_type: "text", content: "C's post", language: "en", response_preference: "advice" })
        .select("id")
        .single();
      ids.postC = other.data!.id;
      const cross = await C.client.from("replies").insert({ post_id: ids.postC, author_id: C.id, parent_reply_id: ids.replyB, content: "x" });
      expect(cross.error?.message).toBe("invalid_thread");
      const deep = await C.client.from("replies").insert({ post_id: ids.postA, author_id: C.id, parent_reply_id: ids.replyA, content: "x" });
      expect(deep.error?.message).toBe("thread_too_deep");
    });

    it("only lets authors edit or delete their own replies", async () => {
      const foreign = await A.client.from("replies").update({ content: "edited by A" }).eq("id", ids.replyB).select("id");
      expect(foreign.data).toEqual([]);
      const own = await B.client.from("replies").update({ content: "I'm here to listen, always." }).eq("id", ids.replyB).select("id");
      expect(own.data).toHaveLength(1);
      const foreignDelete = await A.client.from("replies").delete().eq("id", ids.replyB).select("id");
      expect(foreignDelete.data).toEqual([]);
    });

    it("returns replies without author ids", async () => {
      const { data } = await C.client.rpc("get_post_replies", { p_post_id: ids.postA });
      const rows = data as Record<string, unknown>[];
      expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining([ids.replyB, ids.replyA]));
      expect(JSON.stringify(rows)).not.toContain(A.id);
      expect(JSON.stringify(rows)).not.toContain(B.id);
      expect(rows.find((r) => r.id === ids.replyA)!.is_post_author).toBe(true);
    });

    it("notifies the post author and parent author, privately", async () => {
      const a = await A.client.from("notifications").select("type").eq("related_post_id", ids.postA).eq("type", "post_reply");
      expect(a.data!.length).toBeGreaterThanOrEqual(1);
      const b = await B.client.from("notifications").select("type").eq("type", "reply_reply");
      expect(b.data!.length).toBeGreaterThanOrEqual(1);
      const peek = await B.client.from("notifications").select("id").eq("recipient_id", A.id);
      expect(peek.data).toEqual([]);
      const mark = await B.client.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", A.id).select("id");
      expect(mark.data).toEqual([]);
      const forged = await B.client.from("notifications").insert({ recipient_id: A.id, type: "post_reply" });
      expect(forged.error).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe("bookmarks & journal isolation", () => {
    it("keeps bookmarks private and does not notify the author", async () => {
      const before = await A.client.from("notifications").select("id", { count: "exact", head: true });
      const save = await B.client.from("bookmarks").insert({ user_id: B.id, post_id: ids.postA });
      expect(save.error).toBeNull();
      const peek = await A.client.from("bookmarks").select("post_id").eq("user_id", B.id);
      expect(peek.data).toEqual([]);
      expect((await postsFor(B, { p_bookmarked: true })).map((p) => p.id)).toContain(ids.postA);
      expect(await postsFor(A, { p_bookmarked: true })).toEqual([]);
      const after = await A.client.from("notifications").select("id", { count: "exact", head: true });
      expect(after.count).toBe(before.count);
      const forged = await A.client.from("bookmarks").insert({ user_id: B.id, post_id: ids.postA });
      expect(forged.error).not.toBeNull();
    });

    it("keeps journal entries strictly private", async () => {
      const entry = await A.client.from("journal_entries").insert({ user_id: A.id, title: "Private", content: "Only for me" }).select("id").single();
      expect(entry.error).toBeNull();
      ids.journalA = entry.data!.id;

      expect((await B.client.from("journal_entries").select("id").eq("id", ids.journalA)).data).toEqual([]);
      expect((await B.client.from("journal_entries").update({ content: "x" }).eq("id", ids.journalA).select("id")).data).toEqual([]);
      expect((await B.client.from("journal_entries").delete().eq("id", ids.journalA).select("id")).data).toEqual([]);
      expect((await B.client.from("journal_entries").insert({ user_id: A.id, content: "forged" })).error).not.toBeNull();
      const still = await A.client.from("journal_entries").select("content").eq("id", ids.journalA).single();
      expect(still.data?.content).toBe("Only for me");
    });
  });

  // ---------------------------------------------------------------------------
  describe("private listening sessions", () => {
    it("lets A request B, hides it from C, and blocks direct table writes", async () => {
      const { data, error } = await A.client.rpc("request_listening_session", {
        p_language: "en",
        p_topic: "stress",
        p_intro: "Could we talk?",
        p_listener_handle: B.handle,
      });
      expect(error).toBeNull();
      ids.session = data as string;

      expect((await C.client.from("private_sessions").select("id").eq("id", ids.session)).data).toEqual([]);
      expect((await C.client.rpc("list_my_sessions", { p_session_id: ids.session })).data).toEqual([]);
      expect((await C.client.rpc("respond_to_session", { p_session_id: ids.session, p_accept: true })).error?.message).toBe("not_found");
      expect((await A.client.rpc("respond_to_session", { p_session_id: ids.session, p_accept: true })).error?.message).toBe("not_allowed");
      expect((await A.client.from("private_sessions").update({ status: "accepted" }).eq("id", ids.session)).error?.code).toBe("42501");
      expect((await A.client.from("private_sessions").insert({ requester_id: A.id, language: "en" })).error?.code).toBe("42501");

      const sessions = (await B.client.rpc("list_my_sessions", { p_session_id: ids.session })).data as Record<string, unknown>[];
      expect(sessions[0]!.status).toBe("requested");
      expect(JSON.stringify(sessions)).not.toContain(A.id);
    });

    it("cannot message before acceptance; participants can after", async () => {
      const early = await A.client.from("private_messages").insert({ session_id: ids.session, sender_id: A.id, content: "hello?" });
      expect(early.error?.code).toBe("42501");

      const accept = await B.client.rpc("respond_to_session", { p_session_id: ids.session, p_accept: true });
      expect(accept.data).toBe("accepted");

      expect((await A.client.from("private_messages").insert({ session_id: ids.session, sender_id: A.id, content: "Thank you for accepting." })).error).toBeNull();
      expect((await B.client.from("private_messages").insert({ session_id: ids.session, sender_id: B.id, content: "I'm here." })).error).toBeNull();

      const state = (await A.client.rpc("list_my_sessions", { p_session_id: ids.session })).data as { status: string }[];
      expect(state[0]!.status).toBe("active");
    });

    it("keeps messages away from non-participants and forbids impersonation", async () => {
      expect((await C.client.from("private_messages").select("id").eq("session_id", ids.session)).data).toEqual([]);
      expect((await C.client.from("private_messages").insert({ session_id: ids.session, sender_id: C.id, content: "intrude" })).error?.code).toBe("42501");
      expect((await A.client.from("private_messages").insert({ session_id: ids.session, sender_id: B.id, content: "spoof" })).error?.code).toBe("42501");
      const mine = await A.client.from("private_messages").select("content").eq("session_id", ids.session);
      expect(mine.data).toHaveLength(2);
    });

    it("closes the conversation when a participant ends it", async () => {
      expect((await B.client.rpc("end_session", { p_session_id: ids.session })).error).toBeNull();
      const late = await A.client.from("private_messages").insert({ session_id: ids.session, sender_id: A.id, content: "still there?" });
      expect(late.error?.code).toBe("42501");
      const again = await A.client.rpc("end_session", { p_session_id: ids.session });
      expect(again.error?.message).toBe("invalid_transition");
    });
  });

  // ---------------------------------------------------------------------------
  describe("blocking", () => {
    it("separates blocked users across feeds, replies, reactions, profiles and sessions", async () => {
      await A.client.from("listening_preferences").upsert({ user_id: A.id, available: true, languages: ["en"], topics: [] }, { onConflict: "user_id" });
      expect((await A.client.rpc("block_user", { p_handle: C.handle })).error).toBeNull();

      expect((await postsFor(C)).map((p) => p.id)).not.toContain(ids.postA);
      expect((await postsFor(A)).map((p) => p.id)).not.toContain(ids.postC);
      expect((await C.client.from("replies").insert({ post_id: ids.postA, author_id: C.id, content: "hi" })).error?.code).toBe("42501");
      expect((await C.client.rpc("set_reaction", { p_target_type: "post", p_target_id: ids.postA, p_reaction: "heart" })).error).not.toBeNull();
      expect((await C.client.rpc("get_public_profile", { p_handle: A.handle })).data).toEqual([]);
      const req = await C.client.rpc("request_listening_session", { p_language: "en", p_listener_handle: A.handle });
      expect(req.error?.message).toBe("listener_unavailable");
      const listeners = (await C.client.rpc("list_available_listeners", {})).data as { handle: string }[];
      expect(listeners.map((l) => l.handle)).not.toContain(A.handle);
    });

    it("does not let users block themselves and restores visibility on unblock", async () => {
      expect((await A.client.rpc("block_user", { p_handle: A.handle })).error?.message).toBe("cannot_block_self");
      expect((await A.client.rpc("unblock_user", { p_handle: C.handle })).error).toBeNull();
      expect((await postsFor(C)).map((p) => p.id)).toContain(ids.postA);
    });
  });

  // ---------------------------------------------------------------------------
  describe("reporting & moderation", () => {
    it("accepts reports but never exposes them to members", async () => {
      expect((await B.client.rpc("create_report", { p_target_type: "post", p_reason: "harassment", p_target_id: ids.postA, p_details: "test" })).error).toBeNull();
      expect((await B.client.rpc("create_report", { p_target_type: "user", p_reason: "spam", p_target_handle: A.handle })).error).toBeNull();
      expect((await A.client.rpc("create_report", { p_target_type: "post", p_reason: "spam", p_target_id: ids.postA })).error?.message).toBe("cannot_report_self");
      expect((await A.client.from("reports").select("id")).error?.code).toBe("42501");
      expect((await B.client.from("reports").select("id")).error?.code).toBe("42501");
    });

    it("restricts moderation tools to moderators", async () => {
      expect((await A.client.rpc("mod_list_reports", { p_status: "open" })).error?.message).toBe("not_allowed");
      expect((await A.client.rpc("mod_set_content_status", { p_target_type: "post", p_target_id: ids.postC, p_status: "removed" })).error?.message).toBe("not_allowed");
      expect((await A.client.from("moderation_audit_logs").select("id")).data).toEqual([]);
      expect((await A.client.from("moderation_audit_logs").insert({ moderator_id: A.id, action: "suspend_user", target_type: "user", target_id: A.id })).error).not.toBeNull();

      const { data, error } = await C.client.rpc("mod_list_reports", { p_status: "open" });
      expect(error).toBeNull();
      const report = (data as Record<string, unknown>[]).find((r) => r.target_id === ids.postA)!;
      expect(report).toBeTruthy();
      expect(report).not.toHaveProperty("reporter_id");
      expect(JSON.stringify(data)).not.toContain(B.id);
    });

    it("lets a moderator hide content, which locks it and notifies the author", async () => {
      expect((await C.client.rpc("mod_set_content_status", { p_target_type: "post", p_target_id: ids.postA, p_status: "hidden", p_reason: "test" })).error).toBeNull();
      expect((await postsFor(B)).map((p) => p.id)).not.toContain(ids.postA);
      const own = await postsFor(A, { p_post_id: ids.postA });
      expect(own[0]!.status).toBe("hidden");
      expect((await A.client.from("posts").update({ content: "sneaky edit" }).eq("id", ids.postA)).error?.message).toBe("post_locked");
      const notice = await A.client.from("notifications").select("type").eq("type", "moderation_notice");
      expect(notice.data!.length).toBeGreaterThanOrEqual(1);
      const logs = await C.client.from("moderation_audit_logs").select("action").eq("target_id", ids.postA);
      expect(logs.data!.map((l) => l.action)).toContain("set_post_status");
      expect((await C.client.from("moderation_audit_logs").delete().eq("target_id", ids.postA)).error).not.toBeNull();
      await C.client.rpc("mod_set_content_status", { p_target_type: "post", p_target_id: ids.postA, p_status: "active" });
    });
  });

  // ---------------------------------------------------------------------------
  describe("voice storage", () => {
    it("lets members upload only correctly named, allowed audio", async () => {
      ids.audioA = audioName();
      const up = await A.client.storage.from("voice-notes").upload(ids.audioA, fakeAudio(), { contentType: "audio/webm" });
      expect(up.error).toBeNull();

      const badName = await A.client.storage.from("voice-notes").upload(`${A.id}/x.webm`, fakeAudio(), { contentType: "audio/webm" });
      expect(badName.error).not.toBeNull();

      const badType = await A.client.storage
        .from("voice-notes")
        .upload(audioName().replace(".webm", ".ogg"), new Blob(["hello"], { type: "text/plain" }), { contentType: "text/plain" });
      expect(badType.error).not.toBeNull();
    });

    it("keeps unpublished recordings private to their owner", async () => {
      expect((await A.client.storage.from("voice-notes").createSignedUrl(ids.audioA, 60)).error).toBeNull();
      expect((await B.client.storage.from("voice-notes").createSignedUrl(ids.audioA, 60)).error).not.toBeNull();
      const del = await B.client.storage.from("voice-notes").remove([ids.audioA]);
      expect(del.data ?? []).toEqual([]);
      expect((await A.client.storage.from("voice-notes").download(ids.audioA)).error).toBeNull();
    });

    it("does not let B attach A's recording to their own post", async () => {
      const steal = await B.client.from("posts").insert({
        author_id: B.id, post_type: "voice", audio_storage_path: ids.audioA, audio_mime_type: "audio/webm",
        audio_duration_seconds: 5, language: "en", response_preference: "just_listen",
      });
      expect(steal.error?.message).toBe("audio_not_found");
    });

    it("allows authorised playback once published, never anonymously", async () => {
      const post = await A.client
        .from("posts")
        .insert({ author_id: A.id, post_type: "voice", audio_storage_path: ids.audioA, audio_mime_type: "audio/webm", audio_duration_seconds: 5, language: "so", response_preference: "just_listen" })
        .select("id")
        .single();
      expect(post.error).toBeNull();
      ids.voiceA = post.data!.id;

      const path = await B.client.rpc("get_post_audio_path", { p_post_id: ids.voiceA });
      expect(path.data).toBe(ids.audioA);
      const signed = await B.client.storage.from("voice-notes").createSignedUrl(ids.audioA, 60);
      expect(signed.error).toBeNull();
      expect(signed.data!.signedUrl).not.toContain(A.id);

      expect((await anonClient().storage.from("voice-notes").createSignedUrl(ids.audioA, 60)).error).not.toBeNull();

      await A.client.rpc("block_user", { p_handle: B.handle });
      expect((await B.client.storage.from("voice-notes").createSignedUrl(ids.audioA, 60)).error).not.toBeNull();
      expect((await B.client.rpc("get_post_audio_path", { p_post_id: ids.voiceA })).data).toBeNull();
      await A.client.rpc("unblock_user", { p_handle: B.handle });
    });
  });

  // ---------------------------------------------------------------------------
  describe("account deletion", () => {
    it("removes the account, its content and recordings", async () => {
      D = await createTestUser(admin, "d");
      createdUserIds.push(D.id);
      await onboard(D, "Test Member D");
      const name = audioName();
      expect((await D.client.storage.from("voice-notes").upload(name, fakeAudio(), { contentType: "audio/webm" })).error).toBeNull();
      const post = await D.client
        .from("posts")
        .insert({ author_id: D.id, post_type: "voice", audio_storage_path: name, audio_mime_type: "audio/webm", audio_duration_seconds: 3, language: "en", response_preference: "express" })
        .select("id")
        .single();
      expect(post.error).toBeNull();
      await D.client.from("journal_entries").insert({ user_id: D.id, content: "goodbye" });
      await A.client.from("replies").insert({ post_id: post.data!.id, author_id: A.id, content: "take care" });
      await D.client.rpc("create_report", { p_target_type: "post", p_reason: "spam", p_target_id: ids.postC });

      const result = await deleteUserAccount(admin, D.id);
      expect(result).toEqual({ ok: true });

      expect((await admin.from("profiles").select("id").eq("id", D.id)).data).toEqual([]);
      expect((await admin.from("posts").select("id").eq("author_id", D.id)).data).toEqual([]);
      expect((await admin.from("journal_entries").select("id").eq("user_id", D.id)).data).toEqual([]);
      expect((await admin.rpc("voice_objects_owned_by", { p_user: D.id })).data).toEqual([]);
      const reports = await admin.from("reports").select("reporter_id").eq("target_id", ids.postC);
      expect(reports.data!.some((r) => r.reporter_id === null)).toBe(true); // retained, unlinked
      D = undefined;
    });
  });
});
