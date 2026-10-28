#!/usr/bin/env node
// Applies supabase/migrations/*.sql in order, each inside its own transaction.
// Applied versions are recorded in supabase_migrations.schema_migrations, the
// same table the Supabase CLI uses, so `supabase db push` stays compatible.
//
//   npm run db:migrate            apply pending migrations
//   npm run db:status             list applied / pending migrations
//
// Requires SUPABASE_DB_URL (session pooler connection string) in .env.local.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.local"), quiet: true, override: true });

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set. Add it to .env.local (see .env.example).");
  process.exit(1);
}

const statusOnly = process.argv.includes("--status");
const migrationsDir = path.join(root, "supabase", "migrations");
const files = (await readdir(migrationsDir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[],
      name text
    );
  `);

  const { rows } = await client.query("select version from supabase_migrations.schema_migrations");
  const applied = new Set(rows.map((r) => r.version));

  let pending = 0;
  for (const file of files) {
    const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
    const name = rest.join("_");
    if (applied.has(version)) {
      if (statusOnly) console.log(`  applied  ${file}`);
      continue;
    }
    pending += 1;
    if (statusOnly) {
      console.log(`  pending  ${file}`);
      continue;
    }

    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    process.stdout.write(`Applying ${file} ... `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)",
        [version, name, [sql]],
      );
      await client.query("commit");
      console.log("ok");
    } catch (error) {
      await client.query("rollback");
      console.log("FAILED");
      console.error(error.message);
      if (error.position) {
        const pos = Number(error.position);
        console.error("near:", sql.slice(Math.max(0, pos - 200), pos + 100));
      }
      process.exitCode = 1;
      break;
    }
  }

  if (!statusOnly && pending === 0) console.log("Database is up to date.");
  if (statusOnly) console.log(pending === 0 ? "No pending migrations." : `${pending} pending migration(s).`);
} finally {
  await client.end();
}
