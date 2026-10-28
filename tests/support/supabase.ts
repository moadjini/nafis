// Shared helpers for tests that run against the real Supabase project in
// .env.local (RLS suite and Playwright end-to-end suite). Every account they
// create is a confirmed throwaway user made with the admin API (no email is
// sent) and is deleted again by the suite that created it.
// Run these suites against a development project, never production.

import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import dotenv from "dotenv";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// override: project values win over machine-level variables of the same name.
dotenv.config({ path: path.resolve(__dirname, "../../.env.local"), quiet: true, override: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const configured = Boolean(url && publishableKey && serviceRoleKey);

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export const RUN_ID = randomBytes(4).toString("hex");

export function anonClient(): SupabaseClient {
  return createClient(url!, publishableKey!, noSession);
}

export function adminClient(): SupabaseClient {
  return createClient(url!, serviceRoleKey!, noSession);
}

export type TestUser = {
  label: string;
  id: string;
  email: string;
  password: string;
  handle: string;
  client: SupabaseClient;
};

/** Creates a confirmed throwaway user and signs it in with supabase-js. */
export async function createTestUser(admin: SupabaseClient, label: string, prefix = "rls"): Promise<TestUser> {
  const email = `nafis-${prefix}-${RUN_ID}-${label}@example.com`;
  const password = `T3st-${randomBytes(12).toString("base64url")}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser(${label}) failed: ${error?.message}`);

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn(${label}) failed: ${signInError.message}`);

  const { data: profile, error: profileError } = await client.from("profiles").select("handle").eq("id", data.user.id).single();
  if (profileError) throw new Error(`profile(${label}) missing: ${profileError.message}`);

  return { label, id: data.user.id, email, password, handle: profile.handle as string, client };
}

/**
 * Signs in through @supabase/ssr, exactly as the app does, and returns the auth
 * cookies it writes. Browsers get these cookies instead of typing a password.
 */
export async function sessionCookies(email: string, password: string) {
  const jar = new Map<string, string>();
  const client = createServerClient(url!, publishableKey!, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`ssr signIn failed: ${error.message}`);
  return [...jar].map(([name, value]) => ({ name, value }));
}

export async function deleteTestUser(admin: SupabaseClient, user: Pick<TestUser, "id"> | undefined) {
  if (!user) return;
  const { data } = await admin.rpc("voice_objects_owned_by", { p_user: user.id });
  const names = ((data ?? []) as { name: string }[]).map((o) => o.name);
  if (names.length) await admin.storage.from("voice-notes").remove(names);
  await admin.auth.admin.deleteUser(user.id);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reports and moderation audit logs intentionally outlive account deletion, so
 * suites remove the ones they created: anything targeting, filed by or about
 * the given ids. The audit log is append-only; its guard trigger is disabled
 * only inside this transaction (table owner only).
 */
export async function purgeSafetyRecords(candidates: string[]) {
  const ids = candidates.filter((v) => UUID.test(v));
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl || ids.length === 0) return;
  const { default: pg } = await import("pg");
  const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query("begin");
    const { rows } = await db.query<{ id: string }>(
      `delete from public.reports
        where target_id = any($1::uuid[]) or reporter_id = any($1::uuid[]) or target_user_id = any($1::uuid[])
        returning id`,
      [ids],
    );
    await db.query("alter table public.moderation_audit_logs disable trigger moderation_audit_logs_immutable");
    await db.query("delete from public.moderation_audit_logs where target_id = any($1::uuid[])", [
      [...ids, ...rows.map((r) => r.id)],
    ]);
    await db.query("alter table public.moderation_audit_logs enable trigger moderation_audit_logs_immutable");
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    await db.end();
  }
}

/**
 * Removes staff roles held by test accounts. The last-Super-Admin guard
 * (correctly) blocks deleting a sole Super Admin, so teardown disables that
 * trigger inside one transaction, as the table owner, for these ids only.
 */
export async function removeTestRoles(userIds: string[]) {
  const ids = userIds.filter((v) => UUID.test(v));
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl || ids.length === 0) return;
  const { default: pg } = await import("pg");
  const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query("begin");
    await db.query("alter table public.user_roles disable trigger user_roles_guard");
    await db.query("delete from public.user_roles where user_id = any($1::uuid[])", [ids]);
    await db.query("alter table public.user_roles enable trigger user_roles_guard");
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    await db.end();
  }
}

/** Runs SQL as the database owner (tests only). */
export async function ownerQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const { default: pg } = await import("pg");
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    return (await db.query(sql, params)).rows as T[];
  } finally {
    await db.end();
  }
}

/** A tiny WebM-typed payload. Storage validates the declared MIME type and size only. */
export function fakeAudio() {
  return new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...randomBytes(256)])], { type: "audio/webm" });
}

export function audioName() {
  return `${randomUUID()}.webm`;
}
