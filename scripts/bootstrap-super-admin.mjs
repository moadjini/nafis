#!/usr/bin/env node
// One-time creation of the first Super Admin.
//
//   npm run admin:bootstrap -- <handle>
//
// Runs private.bootstrap_super_admin() as the database owner (SUPABASE_DB_URL),
// which refuses to run once any Super Admin exists and records an audit entry.
// After that, roles are managed only from the admin dashboard (/admin/users).

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.local"), quiet: true, override: true });

const handle = process.argv[2];
if (!handle) {
  console.error("Usage: npm run admin:bootstrap -- <handle>   (the handle shown at /profile/<handle>)");
  process.exit(1);
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("SUPABASE_DB_URL is not set in .env.local.");
  process.exit(1);
}

const messages = {
  super_admin_exists: "A Super Admin already exists. Ask them to grant the role from /admin/users.",
  not_found: `No profile with handle "${handle}". Finish onboarding first, then use the handle from your profile URL.`,
  suspended: "That account is currently suspended.",
};

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("select private.bootstrap_super_admin($1)", [handle]);
  console.log(`@${handle.toLowerCase()} is now the first Super Admin. Sign in and open /admin.`);
} catch (error) {
  console.error(messages[error.message] ?? error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
