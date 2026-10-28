"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, THEME_COOKIE, type Locale, type Theme } from "@/lib/constants";
import { authenticate, notAuthenticated, validate } from "@/lib/action-utils";
import { fail, ok, toErrorCode, type ActionResult } from "@/lib/errors";
import { notificationPreferencesSchema, preferencesSchema } from "@/lib/validation";
import type { NotificationPreferences } from "@/lib/types";

const YEAR = 60 * 60 * 24 * 365;

async function setPreferenceCookie(name: string, value: string) {
  (await cookies()).set(name, value, { path: "/", maxAge: YEAR, sameSite: "lax", httpOnly: false });
}

/** Works signed in or out. Signed-in users also persist it to their profile. */
export async function setLocaleAction(locale: Locale): Promise<ActionResult> {
  const v = validate(preferencesSchema, { language: locale });
  if (!v.success || !v.data.language) return fail("validation");
  await setPreferenceCookie(LOCALE_COOKIE, v.data.language);

  const auth = await authenticate();
  if (auth) {
    await auth.supabase.from("profiles").update({ preferred_language: v.data.language }).eq("id", auth.user.id);
  }
  revalidatePath("/", "layout");
  return ok(null);
}

export async function setThemeAction(theme: Theme): Promise<ActionResult> {
  const v = validate(preferencesSchema, { theme });
  if (!v.success || !v.data.theme) return fail("validation");
  await setPreferenceCookie(THEME_COOKIE, v.data.theme);

  const auth = await authenticate();
  if (auth) {
    await auth.supabase.from("profiles").update({ theme: v.data.theme }).eq("id", auth.user.id);
  }
  revalidatePath("/", "layout");
  return ok(null);
}

export async function saveHiddenTopicsAction(hiddenTopics: string[]): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(preferencesSchema, { hiddenTopics });
  if (!v.success) return v.result;

  const { error } = await auth.supabase
    .from("profiles")
    .update({ hidden_topics: v.data.hiddenTopics ?? [] })
    .eq("id", auth.user.id);
  if (error) return fail(toErrorCode(error));
  revalidatePath("/", "layout");
  return ok(null);
}

export async function saveNotificationPreferencesAction(input: NotificationPreferences): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(notificationPreferencesSchema, input);
  if (!v.success) return v.result;

  const { error } = await auth.supabase
    .from("notification_preferences")
    .upsert({ user_id: auth.user.id, ...v.data }, { onConflict: "user_id" });
  if (error) return fail(toErrorCode(error));
  return ok(null);
}
