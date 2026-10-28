import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ViewerProfile } from "@/lib/types";

export type SessionUser = { id: string; email: string | null };

/** The verified signed-in user for this request, or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims || typeof claims.sub !== "string") return null;
  const sub = claims.sub;
  const email = typeof claims.email === "string" ? claims.email : null;
  return { id: sub, email };
});

/** The signed-in user's own profile (RLS: owner-only read), role and restriction. */
export const getViewerProfile = cache(async (): Promise<ViewerProfile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const [profileResult, roleResult, restrictionResult, verificationResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_key, avatar_path, bio, preferred_language, theme, hidden_topics, onboarding_completed, created_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
    supabase.from("account_restrictions").select("suspended_until").eq("user_id", user.id).maybeSingle(),
    supabase.from("account_verifications").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);

  if (!profileResult.data) return null;
  const suspendedUntil = restrictionResult.data?.suspended_until ?? null;

  const suspended = Boolean(suspendedUntil && new Date(suspendedUntil) > new Date());
  return {
    ...(profileResult.data as Omit<ViewerProfile, "role" | "suspended_until" | "is_verified">),
    // Mirrors private.is_moderator(): a suspended account holds no staff powers.
    role: suspended ? null : ((roleResult.data?.role as ViewerProfile["role"]) ?? null),
    is_verified: Boolean(verificationResult.data),
    suspended_until: suspended ? suspendedUntil : null,
  };
});

/** For pages: signed in, otherwise redirect to sign-in. */
export async function requireUser(next?: string) {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/auth/sign-in?next=${encodeURIComponent(next)}` : "/auth/sign-in");
  return user;
}

/** For app pages: signed in and onboarded, otherwise redirect appropriately. */
export async function requireProfile(next?: string) {
  await requireUser(next);
  const profile = await getViewerProfile();
  if (!profile || !profile.onboarding_completed) redirect("/onboarding");
  return profile;
}

/** UI gates only — every privileged operation is re-checked in the database. */
export function isModerator(profile: Pick<ViewerProfile, "role"> | null) {
  return profile?.role === "moderator" || profile?.role === "super_admin";
}

export function isSuperAdmin(profile: Pick<ViewerProfile, "role"> | null) {
  return profile?.role === "super_admin";
}
