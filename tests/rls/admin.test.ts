/**
 * Roles, verification, profile pictures and admin RPCs against the live
 * project. Every call is made directly against the Data API as the given user
 * (not through the UI), so these prove the database rejects unauthorised
 * requests. Accounts: SA (Super Admin), MOD (moderator), M and M2 (members).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteUserAccount } from "@/lib/account-deletion";
import {
  adminClient,
  anonClient,
  configured,
  createTestUser,
  deleteTestUser,
  ownerQuery,
  purgeSafetyRecords,
  removeTestRoles,
  type TestUser,
} from "../support/supabase";

const suite = configured ? describe : describe.skip;
const tinyWebp = () => new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])], { type: "image/webp" });

suite("Roles, verification & admin permissions (live Supabase)", () => {
  let admin: SupabaseClient;
  let SA: TestUser;
  let MOD: TestUser;
  let M: TestUser;
  let M2: TestUser;
  const ids: string[] = [];
  let otherSuperAdmins = 0;
  let postM = "";

  const rpc = (u: TestUser, fn: string, args: Record<string, unknown> = {}) => u.client.rpc(fn, args);

  beforeAll(async () => {
    admin = adminClient();
    [SA, MOD, M, M2] = await Promise.all(["sa", "mod", "m", "m2"].map((l) => createTestUser(admin, l, "adm")));
    ids.push(SA.id, MOD.id, M.id, M2.id);
    for (const [u, name] of [[SA, "Test Super Admin"], [MOD, "Test Moderator"], [M, "Test Member"], [M2, "Test Member Two"]] as const) {
      await u.client.from("profiles").update({ display_name: name, onboarding_completed: true }).eq("id", u.id);
    }
    const { count } = await admin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "super_admin");
    otherSuperAdmins = count ?? 0;
    // Test fixtures: roles inserted with the service role (the bootstrap path is tested separately).
    const { error } = await admin.from("user_roles").insert([
      { user_id: SA.id, role: "super_admin" },
      { user_id: MOD.id, role: "moderator" },
    ]);
    if (error) throw new Error(error.message);
    const post = await M.client
      .from("posts")
      .insert({ author_id: M.id, post_type: "text", content: "admin suite post", language: "en", response_preference: "advice" })
      .select("id")
      .single();
    postM = post.data!.id;
  });

  afterAll(async () => {
    if (!admin) return;
    await purgeSafetyRecords(ids).catch(() => undefined);
    await removeTestRoles(ids).catch(() => undefined);
    for (const u of [SA, MOD, M, M2]) {
      if (!u) continue;
      const { data } = await admin.from("profiles").select("avatar_path").eq("id", u.id).maybeSingle();
      if (data?.avatar_path) await admin.storage.from("avatars").remove([data.avatar_path]);
      await deleteTestUser(admin, u).catch(() => undefined);
    }
  });

  // ---------------------------------------------------------------------------
  describe("role model", () => {
    it("never lets members write roles or read other people's roles", async () => {
      expect((await M.client.from("user_roles").insert({ user_id: M.id, role: "super_admin" })).error).not.toBeNull();
      expect((await M.client.from("user_roles").update({ role: "super_admin" }).eq("user_id", MOD.id).select()).data ?? []).toEqual([]);
      expect((await M.client.from("user_roles").delete().eq("user_id", SA.id).select()).data ?? []).toEqual([]);
      expect((await M.client.from("user_roles").select("user_id")).data).toEqual([]);
      const own = await MOD.client.from("user_roles").select("role").eq("user_id", MOD.id).single();
      expect(own.data?.role).toBe("moderator");
    });

    it("rejects admin_set_role from members and moderators", async () => {
      expect((await rpc(M, "admin_set_role", { p_handle: M.handle, p_role: "super_admin" })).error?.message).toBe("not_allowed");
      expect((await rpc(MOD, "admin_set_role", { p_handle: M.handle, p_role: "moderator" })).error?.message).toBe("not_allowed");
      expect((await anonClient().rpc("admin_set_role", { p_handle: M.handle, p_role: "moderator" })).error).not.toBeNull();
    });

    it("lets a Super Admin promote, audits it, notifies, and does not verify", async () => {
      const { data, error } = await rpc(SA, "admin_set_role", { p_handle: M.handle, p_role: "moderator", p_reason: "Helps in Somali threads" });
      expect(error).toBeNull();
      expect(data).toBe("moderator");

      const row = await admin.from("user_roles").select("role, granted_by, reason").eq("user_id", M.id).single();
      expect(row.data).toEqual({ role: "moderator", granted_by: SA.id, reason: "Helps in Somali threads" });

      const audit = await admin.from("moderation_audit_logs").select("moderator_id, affected_user_id, metadata, reason").eq("action", "set_role").eq("affected_user_id", M.id);
      expect(audit.data).toHaveLength(1);
      expect(audit.data![0]).toMatchObject({ moderator_id: SA.id, metadata: { from: "member", to: "moderator" }, reason: "Helps in Somali threads" });

      const note = await M.client.from("notifications").select("type, data").eq("type", "account_update");
      expect(note.data?.[0]?.data).toMatchObject({ kind: "role", role: "moderator" });

      expect((await admin.from("account_verifications").select("user_id").eq("user_id", M.id)).data).toEqual([]);
      expect((await rpc(M, "mod_list_reports", { p_status: "open" })).error).toBeNull();
      expect((await rpc(M, "admin_overview", { p_days: 7 })).error?.message).toBe("not_allowed");
    });

    it("removes powers on demotion", async () => {
      expect((await rpc(SA, "admin_set_role", { p_handle: M.handle, p_role: "member" })).error).toBeNull();
      expect((await admin.from("user_roles").select("user_id").eq("user_id", M.id)).data).toEqual([]);
      expect((await rpc(M, "mod_list_reports", { p_status: "open" })).error?.message).toBe("not_allowed");
    });

    it("enforces the restriction hierarchy", async () => {
      // Moderators: members only, up to 30 days.
      expect((await rpc(MOD, "mod_suspend_user", { p_handle: M.handle, p_days: 31 })).error?.message).toBe("not_allowed");
      expect((await rpc(MOD, "mod_suspend_user", { p_handle: SA.handle, p_days: 1 })).error?.message).toBe("not_allowed");
      expect((await rpc(MOD, "mod_suspend_user", { p_handle: M.handle, p_days: 3, p_reason: "test" })).error).toBeNull();
      expect((await rpc(MOD, "mod_suspend_user", { p_handle: M.handle, p_days: 0 })).error).toBeNull();

      // Suspended staff hold no staff powers.
      expect((await rpc(SA, "mod_suspend_user", { p_handle: MOD.handle, p_days: 2 })).error).toBeNull();
      expect((await rpc(MOD, "mod_list_reports", { p_status: "open" })).error?.message).toBe("not_allowed");
      expect((await rpc(SA, "mod_suspend_user", { p_handle: MOD.handle, p_days: 0 })).error).toBeNull();
      expect((await rpc(MOD, "mod_list_reports", { p_status: "open" })).error).toBeNull();

      // Nobody suspends a Super Admin, including themselves.
      expect((await rpc(SA, "mod_suspend_user", { p_handle: SA.handle, p_days: 1 })).error?.message).toBe("not_allowed");
      expect((await rpc(SA, "admin_set_role", { p_handle: M2.handle, p_role: "super_admin" })).error).toBeNull();
      expect((await rpc(SA, "mod_suspend_user", { p_handle: M2.handle, p_days: 1 })).error?.message).toBe("not_allowed");
      expect((await rpc(SA, "admin_set_role", { p_handle: M2.handle, p_role: "member" })).error).toBeNull();
    });

    it("refuses to lose the last active Super Admin", async (ctx) => {
      if (otherSuperAdmins > 0) ctx.skip(); // a real Super Admin exists; never touched by tests
      expect((await rpc(SA, "admin_set_role", { p_handle: SA.handle, p_role: "member" })).error?.message).toBe("last_super_admin");
      expect((await admin.from("user_roles").delete().eq("user_id", SA.id)).error?.message).toBe("last_super_admin");
      expect(await deleteUserAccount(admin, SA.id)).toEqual({ ok: false, step: "last_super_admin" });
      expect((await admin.from("user_roles").select("role").eq("user_id", SA.id).single()).data?.role).toBe("super_admin");
    });

    it("keeps the bootstrap function private and one-time", async () => {
      expect((await M.client.rpc("bootstrap_super_admin", { p_handle: M.handle })).error).not.toBeNull();
      const [priv] = await ownerQuery<{ can: boolean }>(
        "select has_function_privilege('authenticated', 'private.bootstrap_super_admin(text)', 'execute') as can",
      );
      expect(priv!.can).toBe(false);
      await expect(ownerQuery("select private.bootstrap_super_admin($1)", [M.handle])).rejects.toThrow("super_admin_exists");
      expect((await admin.from("user_roles").select("user_id").eq("user_id", M.id)).data).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  describe("verification", () => {
    it("can only be granted by a Super Admin", async () => {
      expect((await M.client.from("account_verifications").insert({ user_id: M.id })).error).not.toBeNull();
      expect((await rpc(M, "admin_set_verification", { p_handle: M.handle, p_verified: true })).error?.message).toBe("not_allowed");
      expect((await rpc(MOD, "admin_set_verification", { p_handle: M.handle, p_verified: true })).error?.message).toBe("not_allowed");
    });

    it("shows the badge everywhere once granted, and audits grant and revoke", async () => {
      expect((await rpc(SA, "admin_set_verification", { p_handle: M.handle, p_verified: true, p_reason: "Community counsellor" })).data).toBe(true);

      const feed = (await rpc(M2, "get_posts", { p_post_id: postM })).data as { author_verified: boolean }[];
      expect(feed[0]!.author_verified).toBe(true);
      const profile = (await rpc(M2, "get_public_profile", { p_handle: M.handle })).data as { is_verified: boolean }[];
      expect(profile[0]!.is_verified).toBe(true);

      expect((await M.client.from("account_verifications").select("user_id")).data).toHaveLength(1); // own row
      expect((await M2.client.from("account_verifications").select("user_id")).data).toEqual([]); // others: RLS
      expect((await admin.from("user_roles").select("user_id").eq("user_id", M.id)).data).toEqual([]); // not staff

      expect((await rpc(SA, "admin_set_verification", { p_handle: M.handle, p_verified: false, p_reason: "test" })).data).toBe(false);
      const after = (await rpc(M2, "get_posts", { p_post_id: postM })).data as { author_verified: boolean }[];
      expect(after[0]!.author_verified).toBe(false);

      const actions = (await admin.from("moderation_audit_logs").select("action, reason").eq("affected_user_id", M.id).in("action", ["grant_verification", "revoke_verification"])).data!;
      expect(actions.map((a) => a.action).sort()).toEqual(["grant_verification", "revoke_verification"]);
    });
  });

  // ---------------------------------------------------------------------------
  describe("audit log and admin data", () => {
    it("shows moderators moderation actions only", async () => {
      const modView = (await rpc(MOD, "admin_list_audit_logs", { p_limit: 200 })).data as { action: string }[];
      expect(modView.some((r) => ["set_role", "grant_verification", "revoke_verification"].includes(r.action))).toBe(false);
      const direct = (await MOD.client.from("moderation_audit_logs").select("action")).data!;
      expect(direct.some((r) => r.action === "set_role")).toBe(false);

      const saView = (await rpc(SA, "admin_list_audit_logs", { p_affected_handle: M.handle, p_limit: 200 })).data as { action: string; actor_handle: string }[];
      expect(saView.map((r) => r.action)).toEqual(expect.arrayContaining(["set_role", "grant_verification", "suspend_user"]));
      expect((await rpc(M, "admin_list_audit_logs", {})).error?.message).toBe("not_allowed");
    });

    it("keeps the audit log append-only, even for Super Admins", async () => {
      expect((await SA.client.from("moderation_audit_logs").delete().eq("affected_user_id", M.id)).error).not.toBeNull();
      expect((await SA.client.from("moderation_audit_logs").insert({ action: "set_role", target_type: "user", target_id: M.id })).error).not.toBeNull();
    });

    it("restricts dashboards and user data to Super Admins and never exposes ids or emails", async () => {
      for (const fn of ["admin_overview", "admin_activity_series", "admin_list_users"]) {
        expect((await rpc(M, fn, {})).error?.message, fn).toBe("not_allowed");
        expect((await rpc(MOD, fn, {})).error?.message, fn).toBe("not_allowed");
      }
      expect((await rpc(MOD, "admin_get_user", { p_handle: M.handle })).error?.message).toBe("not_allowed");

      const overview = (await rpc(SA, "admin_overview", { p_days: 30 })).data as Record<string, number>;
      expect(overview.total_users).toBeGreaterThanOrEqual(4);
      expect(overview.super_admins).toBeGreaterThanOrEqual(1);

      const series = (await rpc(SA, "admin_activity_series", { p_days: 7 })).data as unknown[];
      expect(series).toHaveLength(7);

      const users = (await rpc(SA, "admin_list_users", { p_search: M.handle, p_limit: 10 })).data as Record<string, unknown>[];
      expect(users.map((u) => u.handle)).toContain(M.handle);
      const serialized = JSON.stringify(users);
      expect(serialized).not.toContain(M.id);
      expect(serialized).not.toContain(M.email);

      const detail = (await rpc(SA, "admin_get_user", { p_handle: M.handle })).data as Record<string, unknown>;
      expect(detail.handle).toBe(M.handle);
      expect(JSON.stringify(detail)).not.toContain(M.email);
      expect((detail.history as unknown[]).length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe("profile pictures", () => {
    it("gives members no direct write path to pictures", async () => {
      const name = `${randomUUID()}.webp`;
      expect((await M.client.from("profiles").update({ avatar_path: name }).eq("id", M.id)).error?.code).toBe("42501");
      expect((await M.client.storage.from("avatars").upload(name, tinyWebp(), { contentType: "image/webp" })).error).not.toBeNull();
      expect((await M.client.storage.from("avatars").list()).data ?? []).toEqual([]);
    });

    it("gates uploads in the database (suspension and rate limit)", async () => {
      expect((await rpc(M, "register_avatar_upload")).error).toBeNull();
      expect((await anonClient().rpc("register_avatar_upload")).error).not.toBeNull();
      await rpc(SA, "mod_suspend_user", { p_handle: M2.handle, p_days: 1 });
      expect((await rpc(M2, "register_avatar_upload")).error?.message).toBe("suspended");
      await rpc(SA, "mod_suspend_user", { p_handle: M2.handle, p_days: 0 });
    });

    it("serves server-stored pictures publicly and lets moderators remove members' pictures", async () => {
      // Simulates the server action's privileged write (processing is covered by unit tests).
      const name = `${randomUUID()}.webp`;
      expect((await admin.storage.from("avatars").upload(name, tinyWebp(), { contentType: "image/webp" })).error).toBeNull();
      expect((await admin.from("profiles").update({ avatar_path: name }).eq("id", M.id)).error).toBeNull();

      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${name}`);
      expect(res.status).toBe(200);
      const feed = (await rpc(M2, "get_posts", { p_post_id: postM })).data as { author_avatar_path: string }[];
      expect(feed[0]!.author_avatar_path).toBe(name);

      expect((await rpc(M2, "mod_remove_avatar", { p_handle: M.handle })).error?.message).toBe("not_allowed");
      expect((await rpc(MOD, "mod_remove_avatar", { p_handle: SA.handle })).error?.message).toBe("not_allowed");
      expect((await rpc(MOD, "mod_remove_avatar", { p_handle: M.handle, p_reason: "test" })).error).toBeNull();
      expect((await admin.from("profiles").select("avatar_path").eq("id", M.id).single()).data?.avatar_path).toBeNull();
      const audit = await admin.from("moderation_audit_logs").select("action").eq("affected_user_id", M.id).eq("action", "remove_avatar");
      expect(audit.data).toHaveLength(1);

      // The orphaned file is what the cleanup job removes.
      const orphans = (await admin.rpc("find_orphaned_avatar_objects", { p_older_than: "0 seconds", p_limit: 1000 })).data as { name: string }[];
      expect(orphans.map((o) => o.name)).toContain(name);
      await admin.storage.from("avatars").remove([name]);
      expect((await M.client.rpc("find_orphaned_avatar_objects", {})).error).not.toBeNull();
    });
  });
});
