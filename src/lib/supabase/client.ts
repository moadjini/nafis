import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let browserClient: SupabaseClient | undefined;

/** Browser client (publishable key + the user's session cookie). RLS applies. */
export function createClient() {
  browserClient ??= createBrowserClient(env.supabaseUrl, env.supabasePublishableKey);
  return browserClient;
}
