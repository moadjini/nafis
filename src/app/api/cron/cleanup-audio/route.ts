import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { AUDIO, AVATAR_UPLOAD } from "@/lib/constants";
import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Removes abandoned files: voice uploads older than 24h that no post
 * references, and profile pictures older than 1h that no profile references
 * (replaced, removed by moderators, or failed saves). Call from a scheduler
 * with "Authorization: Bearer $CRON_SECRET". Uses the service role because it
 * must see every user's files.
 */
export async function GET(request: NextRequest) {
  const secret = serverEnv.cronSecret;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  const authorised =
    Boolean(secret) && header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  if (!authorised) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "service role key not configured" }, { status: 503 });

  const removed: Record<string, number> = {};
  for (const [bucket, fn, olderThan] of [
    [AUDIO.bucket, "find_orphaned_voice_objects", "24 hours"],
    [AVATAR_UPLOAD.bucket, "find_orphaned_avatar_objects", "1 hour"],
  ] as const) {
    const { data, error } = await admin.rpc(fn, { p_older_than: olderThan, p_limit: 500 });
    if (error) return NextResponse.json({ error: `${bucket} lookup failed` }, { status: 500 });
    const names = ((data ?? []) as { name: string }[]).map((row) => row.name);
    if (names.length > 0) {
      const { error: removeError } = await admin.storage.from(bucket).remove(names);
      if (removeError) return NextResponse.json({ error: `${bucket} remove failed` }, { status: 500 });
    }
    removed[bucket] = names.length;
  }
  return NextResponse.json({ removed });
}
