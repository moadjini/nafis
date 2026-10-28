"use server";

import { redirect } from "next/navigation";
import { deleteUserAccount } from "@/lib/account-deletion";
import { authenticate, notAuthenticated } from "@/lib/action-utils";
import { fail, type ActionResult } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Permanently deletes the signed-in user's account.
 *
 * Why the service role is needed: deleting an auth user and removing their
 * storage objects requires admin privileges. The caller is verified from the
 * session cookie first, and the admin client only ever acts on that user's id.
 *
 * Retention (see the privacy page): deleting the auth user cascades to the
 * profile, posts (+ their replies, reactions, bookmarks), own replies,
 * reactions, bookmarks, journal, notifications, listening preferences and every
 * private session the user took part in (with its messages). Reports and
 * moderation audit logs are kept with the user reference set to NULL.
 */
export async function deleteAccountAction(confirmation: string): Promise<ActionResult> {
  if (confirmation !== "DELETE") return fail("validation", { confirmation: "required" });

  const auth = await authenticate();
  if (!auth) return notAuthenticated();

  const admin = createAdminClient();
  if (!admin) return fail("configuration");

  const result = await deleteUserAccount(admin, auth.user.id);
  if (!result.ok) return fail(result.step === "last_super_admin" ? "last_super_admin" : "generic");

  // Clear the session cookie locally (the refresh token is already invalid).
  await auth.supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  redirect("/?account=deleted");
}
