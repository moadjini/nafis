import { randomBytes } from "node:crypto";
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import {
  adminClient,
  configured,
  createTestUser,
  deleteTestUser,
  purgeSafetyRecords,
  removeTestRoles,
  sessionCookies,
  type TestUser,
} from "../support/supabase";

export { expect };

export type Member = TestUser & {
  displayName: string;
  /** Browser context signed in as this member (its own cookie jar). */
  context: BrowserContext;
  page: Page;
};

type MemberOptions = {
  /** Default true. False leaves the account at the onboarding wizard. */
  onboarded?: boolean;
  displayName?: string;
  /** Opt in to private listening requests (English and Somali). */
  listener?: boolean;
  /** Staff role, inserted with the service role (test fixture only). */
  role?: "moderator" | "super_admin";
};

type Fixtures = {
  /** Creates a throwaway member and a browser page already signed in as them. */
  member: (label: string, options?: MemberOptions) => Promise<Member>;
};

export const test = base.extend<Fixtures>({
  member: async ({ browser, baseURL }, provide) => {
    test.skip(!configured, "Supabase credentials are not configured in .env.local");
    const admin = adminClient();
    const created: Member[] = [];

    await provide(async (label, options = {}) => {
      const user = await createTestUser(admin, `${label}-${randomBytes(2).toString("hex")}`, "e2e");
      const displayName = options.displayName ?? `E2E ${label}`;

      if (options.onboarded !== false) {
        const { error } = await user.client
          .from("profiles")
          .update({ display_name: displayName, onboarding_completed: true, avatar_key: "leaf" })
          .eq("id", user.id);
        if (error) throw new Error(`onboarding ${label}: ${error.message}`);
      }
      if (options.listener) {
        const { error } = await user.client
          .from("listening_preferences")
          .upsert({ user_id: user.id, available: true, languages: ["en", "so"], topics: [] }, { onConflict: "user_id" });
        if (error) throw new Error(`listener ${label}: ${error.message}`);
      }

      if (options.role) {
        const { error } = await admin.from("user_roles").insert({ user_id: user.id, role: options.role });
        if (error) throw new Error(`role ${label}: ${error.message}`);
      }

      // Same cookie format the app writes after a normal sign-in.
      const cookies = await sessionCookies(user.email, user.password);
      const context = await browser.newContext({ baseURL, permissions: ["microphone"], locale: "en-US" });
      await context.addCookies([
        ...cookies.map((c) => ({ ...c, url: baseURL! })),
        { name: "nafis-locale", value: "en", url: baseURL! },
      ]);
      const page = await context.newPage();

      const member: Member = { ...user, displayName, context, page };
      created.push(member);
      return member;
    });

    for (const m of created) await m.context.close().catch(() => undefined);
    // Reports outlive accounts by design; remove the ones these members touched.
    await purgeSafetyRecords(created.map((m) => m.id)).catch(() => undefined);
    await removeTestRoles(created.map((m) => m.id)).catch(() => undefined);
    for (const m of created) {
      const { data } = await admin.from("profiles").select("avatar_path").eq("id", m.id).maybeSingle();
      if (data?.avatar_path) await admin.storage.from("avatars").remove([data.avatar_path as string]).catch(() => undefined);
      await deleteTestUser(admin, m).catch(() => undefined);
    }
  },
});

/** Navigates and waits for the page's scripts so client components are interactive. */
export async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

export async function createPost(
  member: Member,
  content: string,
  responsePreference: "just_listen" | "advice" | "similar_experience" | "express" = "just_listen",
) {
  const { data, error } = await member.client
    .from("posts")
    .insert({ author_id: member.id, post_type: "text", content, language: "en", response_preference: responsePreference })
    .select("id")
    .single();
  if (error) throw new Error(`createPost: ${error.message}`);
  return data.id as string;
}

export function pathOf(page: Page) {
  return new URL(page.url()).pathname;
}

export const UUID_PATH = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
