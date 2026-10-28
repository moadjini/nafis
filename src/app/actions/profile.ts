"use server";

import { revalidatePath } from "next/cache";
import { authenticate, notAuthenticated, validate } from "@/lib/action-utils";
import { fail, ok, toErrorCode, type ActionResult } from "@/lib/errors";
import { onboardingSchema, profileSchema } from "@/lib/validation";

export async function completeOnboardingAction(input: unknown): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(onboardingSchema, input);
  if (!v.success) return v.result;
  const data = v.data;

  // Column privileges only allow these fields; id/role cannot be changed.
  const { error } = await auth.supabase
    .from("profiles")
    .update({
      display_name: data.displayName,
      avatar_key: data.avatarKey,
      preferred_language: data.language,
      onboarding_completed: true,
    })
    .eq("id", auth.user.id);
  if (error) return fail(toErrorCode(error));

  const { error: prefsError } = await auth.supabase.from("listening_preferences").upsert(
    {
      user_id: auth.user.id,
      available: data.listening.available,
      languages: data.listening.languages,
      topics: data.listening.topics,
    },
    { onConflict: "user_id" },
  );
  if (prefsError) return fail(toErrorCode(prefsError));

  // No cookie write or revalidation here: either would re-render /onboarding,
  // which redirects completed accounts and would skip the welcome step. The
  // language cookie is already set by step 1, and every app page renders
  // dynamically, so nothing is stale.
  return ok(null);
}

export async function updateProfileAction(input: unknown): Promise<ActionResult<{ handle: string }>> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(profileSchema, input);
  if (!v.success) return v.result;

  const { error } = await auth.supabase
    .from("profiles")
    .update({
      display_name: v.data.displayName,
      handle: v.data.handle,
      avatar_key: v.data.avatarKey,
      bio: v.data.bio ?? null,
    })
    .eq("id", auth.user.id);

  if (error) {
    if (error.code === "23505") return fail("validation", { handle: "taken" });
    if (error.code === "23514") return fail("validation", { handle: "invalid" });
    return fail(toErrorCode(error));
  }
  revalidatePath("/", "layout");
  return ok({ handle: v.data.handle });
}
