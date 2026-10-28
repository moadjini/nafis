/**
 * Ranked feed, Super Admin promotions (boost and free likes) and the push
 * subscription/queue model, against the live project. Every call goes straight
 * to the Data API as the given user, so these prove the database itself
 * rejects unauthorised requests. Accounts: SA (Super Admin), MOD (moderator),
 * M (author) and M2 (member).
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  configured,
  createTestUser,
  deleteTestUser,
  ownerQuery,
  purgeSafetyRecords,
  removeTestRoles,
  type TestUser,
} from "../support/supabase";

const suite = configured ? describe : describe.skip;

type FeedRow = { id: string; reactions: Record<string, number>; promotion: { boosted_until: string | null; bonus_likes: number } | null };

const fakeSubscription = () => ({
  endpoint: `https://push.example.test/send/${randomBytes(24).toString("base64url")}`,
  p256dh: randomBytes(65).toString("base64url"),
  auth: randomBytes(16).toString("base64url"),
});

suite("Feed ranking, promotions & push (live Supabase)", () => {
  let admin: SupabaseClient;
  let SA: TestUser;
  let MOD: TestUser;
  let M: TestUser;
  let M2: TestUser;
  const ids: string[] = [];
  let postA = "";
  let postB = "";
  let postC = "";

  const rpc = (u: TestUser, fn: string, args: Record<string, unknown> = {}) => u.client.rpc(fn, args);
  const feed = async (u: TestUser, args: Record<string, unknown> = {}) => {
    const { data, error } = await rpc(u, "get_posts", { p_author_handle: M.handle, p_limit: 10, ...args });
    if (error) throw new Error(error.message);
    return data as FeedRow[];
  };

  beforeAll(async () => {
    admin = adminClient();
    [SA, MOD, M, M2] = await Promise.all(["sa", "mod", "m", "m2"].map((l) => createTestUser(admin, l, "feed")));
    ids.push(SA.id, MOD.id, M.id, M2.id);
    for (const u of [SA, MOD, M, M2]) await u.client.from("profiles").update({ onboarding_completed: true }).eq("id", u.id);
    const { error } = await admin.from("user_roles").insert([
      { user_id: SA.id, role: "super_admin" },
      { user_id: MOD.id, role: "moderator" },
    ]);
    if (error) throw new Error(error.message);

    // A, B, C published in that order (C newest).
    for (const label of ["A", "B", "C"]) {
      const { data, error: postError } = await M.client
        .from("posts")
        .insert({ author_id: M.id, post_type: "text", content: `feed suite ${label}`, language: "en", response_preference: "advice" })
        .select("id")
        .single();
      if (postError) throw new Error(postError.message);
      if (label === "A") postA = data.id;
      if (label === "B") postB = data.id;
      if (label === "C") postC = data.id;
      await new Promise((r) => setTimeout(r, 50));
    }
    ids.push(postA, postB, postC);
  });

  afterAll(async () => {
    if (!admin) return;
    await purgeSafetyRecords(ids).catch(() => undefined);
    await removeTestRoles(ids).catch(() => undefined);
    for (const u of [SA, MOD, M, M2]) if (u) await deleteTestUser(admin, u).catch(() => undefined);
  });

  describe("ranked feed", () => {
    it("orders Top by engagement and Latest by time", async () => {
      // A gets two reactions and a reply from someone else; B and C get nothing.
      await rpc(M2, "set_reaction", { p_target_type: "post", p_target_id: postA, p_reaction: "heart" });
      await rpc(MOD, "set_reaction", { p_target_type: "post", p_target_id: postA, p_reaction: "hug" });
      const reply = await M2.client.from("replies").insert({ post_id: postA, author_id: M2.id, content: "You're not alone in this." });
      expect(reply.error).toBeNull();
      // The author's own replies do not count towards ranking.
      await M.client.from("replies").insert({ post_id: postB, author_id: M.id, content: "Adding a little more." });

      expect((await feed(M2)).map((p) => p.id)).toEqual([postC, postB, postA]);
      expect((await feed(M2, { p_sort: "top" }))[0]!.id).toBe(postA);
    });

    it("pages Top by offset without repeats against a fixed ranking time", async () => {
      const rankedAt = new Date().toISOString();
      const first = await feed(M2, { p_sort: "top", p_limit: 2, p_offset: 0, p_ranked_at: rankedAt });
      const second = await feed(M2, { p_sort: "top", p_limit: 2, p_offset: 2, p_ranked_at: rankedAt });
      const all = [...first, ...second].map((p) => p.id);
      expect(new Set(all).size).toBe(3);
      expect(all.sort()).toEqual([postA, postB, postC].sort());
    });
  });

  describe("promotions", () => {
    it("rejects members and moderators, even calling the database directly", async () => {
      for (const u of [M, M2, MOD]) {
        expect((await rpc(u, "admin_boost_post", { p_post_id: postB, p_hours: 24 })).error?.message).toBe("not_allowed");
        expect((await rpc(u, "admin_set_bonus_likes", { p_post_id: postB, p_count: 50 })).error?.message).toBe("not_allowed");
        expect((await rpc(u, "admin_list_promotions")).error?.message).toBe("not_allowed");
        expect((await u.client.from("post_promotions").select("post_id")).error).not.toBeNull();
        expect((await u.client.from("post_promotions").insert({ post_id: postB, bonus_likes: 99 })).error).not.toBeNull();
      }
    });

    it("validates input and only promotes visible community posts", async () => {
      expect((await rpc(SA, "admin_boost_post", { p_post_id: postB, p_hours: 721 })).error?.message).toBe("validation");
      expect((await rpc(SA, "admin_boost_post", { p_post_id: postB, p_hours: -1 })).error?.message).toBe("validation");
      expect((await rpc(SA, "admin_set_bonus_likes", { p_post_id: postB, p_count: -5 })).error?.message).toBe("validation");
      expect((await rpc(SA, "admin_set_bonus_likes", { p_post_id: postB, p_count: 100001 })).error?.message).toBe("validation");
      const draft = await M.client
        .from("posts")
        .insert({ author_id: M.id, post_type: "text", content: "feed suite draft", language: "en", response_preference: "advice", visibility: "draft" })
        .select("id")
        .single();
      ids.push(draft.data!.id);
      expect((await rpc(SA, "admin_boost_post", { p_post_id: draft.data!.id, p_hours: 6 })).error?.message).toBe("not_found");
    });

    it("lets a Super Admin boost a post to the top and add free likes, visible only as an effect", async () => {
      const boosted = await rpc(SA, "admin_boost_post", { p_post_id: postB, p_hours: 24, p_reason: "Community highlight" });
      expect(boosted.error).toBeNull();
      expect(new Date(boosted.data as string).getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
      expect((await rpc(SA, "admin_set_bonus_likes", { p_post_id: postB, p_count: 50 })).data).toBe(50);

      // Members: B first in Top with 50 extra hearts, but no promotion details.
      const top = await feed(M2, { p_sort: "top" });
      expect(top[0]!.id).toBe(postB);
      expect(top[0]!.reactions.heart).toBe(50);
      expect(top.every((p) => p.promotion === null)).toBe(true);
      // Latest is unaffected by boosts.
      expect((await feed(M2))[0]!.id).toBe(postC);
      // Moderators don't see promotion details either; Super Admins do.
      expect((await feed(MOD, { p_sort: "top" }))[0]!.promotion).toBeNull();
      const saView = (await feed(SA, { p_sort: "top" })).find((p) => p.id === postB)!;
      expect(saView.promotion?.bonus_likes).toBe(50);
      expect(saView.promotion?.boosted_until).not.toBeNull();

      // A real heart adds to the free likes in the reaction response, too.
      const reacted = await rpc(M2, "set_reaction", { p_target_type: "post", p_target_id: postB, p_reaction: "heart" });
      expect((reacted.data as { reactions: Record<string, number> }[])[0]!.reactions.heart).toBe(51);

      const list = (await rpc(SA, "admin_list_promotions")).data as { post_id: string; bonus_likes: number; real_reactions: number }[];
      const row = list.find((r) => r.post_id === postB)!;
      expect(row.bonus_likes).toBe(50);
      expect(row.real_reactions).toBe(1);
    });

    it("audits every change and shows those entries to Super Admins only", async () => {
      await rpc(SA, "admin_set_bonus_likes", { p_post_id: postB, p_count: 0 });
      await rpc(SA, "admin_boost_post", { p_post_id: postB, p_hours: 0 });
      expect((await feed(M2, { p_sort: "top" }))[0]!.id).toBe(postA);

      const { data } = await rpc(SA, "admin_list_audit_logs", { p_affected_handle: M.handle, p_limit: 50 });
      const actions = (data as { action: string; target_id: string; metadata: Record<string, unknown> }[]).filter((r) => r.target_id === postB);
      expect(actions.map((a) => a.action).sort()).toEqual(["boost_post", "set_bonus_likes", "set_bonus_likes", "unboost_post"]);
      expect(actions.find((a) => a.action === "set_bonus_likes" && a.metadata.to === 0)?.metadata.from).toBe(50);

      const modView = (await rpc(MOD, "admin_list_audit_logs", { p_affected_handle: M.handle, p_limit: 50 })).data as { action: string }[];
      expect(modView.some((r) => ["boost_post", "unboost_post", "set_bonus_likes"].includes(r.action))).toBe(false);
    });
  });

  describe("push subscriptions and delivery queue", () => {
    it("gives clients no direct access to subscriptions or the delivery queue", async () => {
      const sub = fakeSubscription();
      expect((await rpc(M, "register_push_subscription", { p_endpoint: sub.endpoint, p_p256dh: sub.p256dh, p_auth: sub.auth })).error).toBeNull();
      expect((await M.client.from("push_subscriptions").select("endpoint")).error).not.toBeNull();
      expect((await M2.client.from("push_subscriptions").insert({ user_id: M2.id, ...sub })).error).not.toBeNull();
      expect((await rpc(M, "claim_push_notifications", { p_limit: 10 })).error).not.toBeNull();
      expect((await rpc(SA, "claim_push_notifications", { p_limit: 10 })).error).not.toBeNull();
    });

    it("rejects malformed subscriptions", async () => {
      const sub = fakeSubscription();
      expect((await rpc(M, "register_push_subscription", { p_endpoint: "http://insecure.example.test/x", p_p256dh: sub.p256dh, p_auth: sub.auth })).error).not.toBeNull();
      expect((await rpc(M, "register_push_subscription", { p_endpoint: sub.endpoint, p_p256dh: "short", p_auth: sub.auth })).error).not.toBeNull();
    });

    it("queues notifications for subscribed people and lets the server claim each once", async () => {
      const sub = fakeSubscription();
      await rpc(M, "register_push_subscription", { p_endpoint: sub.endpoint, p_p256dh: sub.p256dh, p_auth: sub.auth });
      const reply = await M2.client.from("replies").insert({ post_id: postC, author_id: M2.id, content: "Thinking of you today." }).select("id").single();
      expect(reply.error).toBeNull();

      const { data: notes } = await admin.from("notifications").select("id").eq("recipient_id", M.id).eq("related_post_id", postC);
      expect(notes?.length).toBe(1);
      expect(await ownerQuery("select 1 from private.push_queue where notification_id = $1", [notes![0]!.id])).toHaveLength(1);

      // Claiming drains the whole queue (another reason to run this suite on a development project).
      const queued = await admin.rpc("claim_push_notifications", { p_limit: 500 });
      expect(queued.error).toBeNull();
      const mine = (queued.data as { id: string; type: string; language: string; related_post_id: string }[]).filter((r) => r.id === notes![0]!.id);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ type: "post_reply", related_post_id: postC, language: "en" });

      const again = await admin.rpc("claim_push_notifications", { p_limit: 500 });
      expect((again.data as { id: string }[]).some((r) => r.id === notes![0]!.id)).toBe(false);
    });

    it("moves a device endpoint to whoever registers it last, and forgets it on unregister", async () => {
      const sub = fakeSubscription();
      await rpc(M, "register_push_subscription", { p_endpoint: sub.endpoint, p_p256dh: sub.p256dh, p_auth: sub.auth });
      await rpc(M2, "register_push_subscription", { p_endpoint: sub.endpoint, p_p256dh: sub.p256dh, p_auth: sub.auth });
      const owner = await admin.from("push_subscriptions").select("user_id").eq("endpoint", sub.endpoint).single();
      expect(owner.data?.user_id).toBe(M2.id);

      expect((await rpc(M2, "unregister_push_subscription", { p_endpoint: sub.endpoint })).error).toBeNull();
      expect((await admin.from("push_subscriptions").select("id").eq("endpoint", sub.endpoint)).data).toEqual([]);
    });

    it("does not queue anything for people without a subscription", async () => {
      await rpc(SA, "admin_set_verification", { p_handle: SA.handle, p_verified: true });
      const note = await admin.from("notifications").select("id").eq("recipient_id", SA.id).eq("type", "account_update").single();
      expect(note.data?.id).toBeTruthy();
      expect(await ownerQuery("select 1 from private.push_queue where notification_id = $1", [note.data!.id])).toHaveLength(0);
      await rpc(SA, "admin_set_verification", { p_handle: SA.handle, p_verified: false });
    });
  });
});
