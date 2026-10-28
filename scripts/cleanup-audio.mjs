#!/usr/bin/env node
// Deletes abandoned files: voice notes older than 24h that no post references,
// and profile pictures older than 1h that no profile references.
// Same logic as GET /api/cron/cleanup-audio.
//
//   npm run cleanup:audio [-- --dry-run]

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.local"), quiet: true, override: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

for (const [bucket, fn, olderThan] of [
  ["voice-notes", "find_orphaned_voice_objects", "24 hours"],
  ["avatars", "find_orphaned_avatar_objects", "1 hour"],
]) {
  const { data, error } = await admin.rpc(fn, { p_older_than: olderThan, p_limit: 500 });
  if (error) {
    console.error(`${bucket}: ${error.message}`);
    process.exit(1);
  }
  const names = (data ?? []).map((row) => row.name);
  console.log(`${bucket}: ${names.length} orphaned file(s).`);
  if (names.length > 0 && !dryRun) {
    const { error: removeError } = await admin.storage.from(bucket).remove(names);
    if (removeError) {
      console.error(removeError.message);
      process.exit(1);
    }
    console.log(`${bucket}: removed.`);
  }
}
