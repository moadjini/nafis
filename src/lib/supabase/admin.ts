import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

/**
 * Service-role client. It BYPASSES Row Level Security, so it is used only for:
 *   1. account deletion (auth.admin.deleteUser + removing the user's own audio)
 *   2. the abandoned-audio cleanup job
 * Callers must authenticate and authorise the request before using it.
 * Returns null when the key is not configured.
 */
export function createAdminClient() {
  if (!serverEnv.serviceRoleKey) return null;
  return createClient(env.supabaseUrl, serverEnv.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
