/**
 * Server-side push delivery against the live database: queue → claim →
 * payload → send, and clean-up of endpoints the push service reports as gone.
 * Only the network hop to the push service (web-push) is replaced; reaching a
 * real browser push service needs a real device and is not automated.
 * Note: delivery drains the whole queue, so run this on a development project.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, configured, createTestUser, deleteTestUser, type TestUser } from "../support/supabase";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));

const sent: { endpoint: string; payload: Record<string, string> }[] = [];
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async (sub: { endpoint: string }, body: string) => {
      if (sub.endpoint.includes("/gone/")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      sent.push({ endpoint: sub.endpoint, payload: JSON.parse(body) });
      return { statusCode: 201 };
    }),
  },
}));

const suite = configured && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? describe : describe.skip;

const subscription = (kind: "ok" | "gone") => ({
  p_endpoint: `https://push.example.test/${kind}/${randomBytes(20).toString("base64url")}`,
  p_p256dh: randomBytes(65).toString("base64url"),
  p_auth: randomBytes(16).toString("base64url"),
});

suite("Push delivery (live database, mocked push service)", () => {
  let admin: SupabaseClient;
  let M: TestUser;
  let M2: TestUser;
  let post = "";
  const ok = subscription("ok");
  const gone = subscription("gone");

  beforeAll(async () => {
    admin = adminClient();
    [M, M2] = await Promise.all(["m", "m2"].map((l) => createTestUser(admin, l, "push")));
    for (const u of [M, M2]) await u.client.from("profiles").update({ onboarding_completed: true }).eq("id", u.id);
    const created = await M.client
      .from("posts")
      .insert({ author_id: M.id, post_type: "text", content: "push suite post", language: "en", response_preference: "advice" })
      .select("id")
      .single();
    post = created.data!.id;
    for (const sub of [ok, gone]) {
      const { error } = await M.client.rpc("register_push_subscription", sub);
      if (error) throw new Error(error.message);
    }
  });

  afterAll(async () => {
    if (!admin) return;
    for (const u of [M, M2]) if (u) await deleteTestUser(admin, u).catch(() => undefined);
  });

  it("sends a generic, localised alert and deletes endpoints that are gone", async () => {
    const { deliverPendingPushes } = await import("@/lib/push/server");
    await M2.client.from("replies").insert({ post_id: post, author_id: M2.id, content: "A very private reply" });

    const result = await deliverPendingPushes(500);
    const mine = sent.filter((s) => s.endpoint === ok.p_endpoint);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.payload).toMatchObject({ title: "Nafis", body: "Someone replied to your post.", url: `/post/${post}`, lang: "en" });
    expect(JSON.stringify(mine[0]!.payload)).not.toContain("private reply");
    expect(result.removed).toBeGreaterThanOrEqual(1);

    const remaining = await admin.from("push_subscriptions").select("endpoint").eq("user_id", M.id);
    expect(remaining.data?.map((r) => r.endpoint)).toEqual([ok.p_endpoint]);

    // Nothing is sent twice.
    sent.length = 0;
    await deliverPendingPushes(500);
    expect(sent.filter((s) => s.endpoint === ok.p_endpoint)).toHaveLength(0);
  });

  it("uses the recipient's language", async () => {
    const { deliverPendingPushes } = await import("@/lib/push/server");
    await M.client.from("profiles").update({ preferred_language: "so" }).eq("id", M.id);
    await M.client.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", M.id);
    await M2.client.from("replies").insert({ post_id: post, author_id: M2.id, content: "Mar kale" });

    sent.length = 0;
    await deliverPendingPushes(500);
    const mine = sent.filter((s) => s.endpoint === ok.p_endpoint);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.payload).toMatchObject({ body: "Qof ayaa ka jawaabay qoraalkaaga.", lang: "so" });
  });
});
