import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/**
 * Subscribes only after Realtime carries the signed-in user's token.
 *
 * On a fresh page load the browser client reads the session from cookies
 * asynchronously. A channel joined before that happens uses the anonymous key,
 * which has no privileges on our tables, so Realtime rejects the subscription.
 * Returns an unsubscribe function for useEffect cleanup.
 */
export function subscribeAuthorized(supabase: SupabaseClient, build: (supabase: SupabaseClient) => RealtimeChannel) {
  let channel: RealtimeChannel | null = null;
  let cancelled = false;

  void supabase.auth.getSession().then(async ({ data }) => {
    if (cancelled || !data.session) return;
    await supabase.realtime.setAuth(data.session.access_token);
    if (cancelled) return;
    channel = build(supabase).subscribe();
  });

  return () => {
    cancelled = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
