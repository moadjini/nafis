#!/usr/bin/env node
// Server-rendering smoke test for signed-in pages. Requires `npm run dev` (or
// `npm start`) on BASE_URL and the Supabase settings in .env.local. Creates two
// throwaway confirmed users with the admin API, seeds content, fetches every
// app route with real auth cookies, then deletes the users.
//
//   node tests/smoke/ssr-smoke.mjs            (BASE_URL defaults to http://localhost:3000)

import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(root, ".env.local"), quiet: true, override: true });

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const run = randomBytes(3).toString("hex");

async function signedInUser(label) {
  const email = `nafis-smoke-${run}-${label}@example.com`;
  const password = `Smoke-${randomBytes(9).toString("base64url")}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const jar = new Map();
  const client = createServerClient(URL_, KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  const cookie = [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
  return { id: data.user.id, client, cookie };
}

const results = [];
async function check(label, cookie, route, { expect = [], status = 200, notExpect = [] } = {}) {
  const res = await fetch(`${BASE}${route}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  const body = res.status === 200 ? await res.text() : "";
  const problems = [];
  if (res.status !== status) problems.push(`status ${res.status} (wanted ${status}) ${res.headers.get("location") ?? ""}`);
  for (const text of expect) if (!body.includes(text)) problems.push(`missing "${text}"`);
  for (const text of notExpect) if (body.includes(text)) problems.push(`unexpected "${text}"`);
  // A server render error is serialised into the payload with a digest.
  if (/\?"digest\?":/.test(body) || body.includes("__next_error__")) problems.push("render error (see dev server log)");
  results.push({ label, route, ok: problems.length === 0, problems });
}

let E;
let F;
try {
  [E, F] = await Promise.all([signedInUser("e"), signedInUser("f")]);
  for (const [u, name] of [[E, "Smoke Writer"], [F, "Smoke Listener"]]) {
    await u.client.from("profiles").update({ display_name: name, onboarding_completed: true }).eq("id", u.id);
  }
  const { data: eProfile } = await E.client.from("profiles").select("handle").eq("id", E.id).single();
  const { data: fProfile } = await F.client.from("profiles").select("handle").eq("id", F.id).single();

  // Seed content
  const post = await E.client.from("posts").insert({ author_id: E.id, post_type: "text", content: "Smoke test: the house feels quiet.", caption: "A quiet evening", language: "en", topic: "loneliness", response_preference: "just_listen" }).select("id").single();
  const draft = await E.client.from("posts").insert({ author_id: E.id, post_type: "text", content: "Smoke draft", language: "en", response_preference: "express", visibility: "draft" }).select("id").single();
  const audio = `${randomUUID()}.webm`;
  await E.client.storage.from("voice-notes").upload(audio, new Blob([randomBytes(512)], { type: "audio/webm" }), { contentType: "audio/webm" });
  await E.client.from("posts").insert({ author_id: E.id, post_type: "voice", audio_storage_path: audio, audio_mime_type: "audio/webm", audio_duration_seconds: 12, caption: "Smoke voice note", language: "so", response_preference: "similar_experience" });
  await F.client.from("replies").insert({ post_id: post.data.id, author_id: F.id, content: "Smoke reply: I'm here to listen." });
  await F.client.rpc("set_reaction", { p_target_type: "post", p_target_id: post.data.id, p_reaction: "hug" });
  await F.client.from("bookmarks").insert({ user_id: F.id, post_id: post.data.id });
  const journal = await E.client.from("journal_entries").insert({ user_id: E.id, title: "Smoke journal", content: "Private smoke entry" }).select("id").single();
  await E.client.from("listening_preferences").upsert({ user_id: E.id, available: true, languages: ["en", "so"], topics: [], note: "Smoke listener note" }, { onConflict: "user_id" });
  const { data: sessionId } = await F.client.rpc("request_listening_session", { p_language: "en", p_intro: "Smoke intro", p_listener_handle: eProfile.handle });
  await E.client.rpc("respond_to_session", { p_session_id: sessionId, p_accept: true });
  await F.client.from("private_messages").insert({ session_id: sessionId, sender_id: F.id, content: "Smoke private message" });

  // Signed-out gate
  await check("guest", null, "/home", { status: 307 });
  await check("guest", null, "/", { expect: ["Meel aad ku nafiso.", "rel=\"icon\" href=\"/favicon.ico", "rel=\"icon\" href=\"/icon.svg", "rel=\"apple-touch-icon\""] });
  await check("guest", null, "/community-guidelines", { expect: ["Community guidelines"] });
  await check("guest", null, "/safety", { expect: ["988"] });
  await check("guest", null, "/manifest.webmanifest", { expect: ['"name":"Nafis"', '"display":"standalone"', "maskable"] });
  await check("guest", null, "/sw.js", { expect: ["showNotification", "offline.html"] });
  await check("guest", null, "/offline.html", { expect: ["You're offline", "Internet ma jiro"] });

  // E (author)
  await check("E", E.cookie, "/home", { expect: ["A quiet evening", "Smoke voice note"] });
  await check("E", E.cookie, "/home?type=voice", { expect: ["Smoke voice note"], notExpect: ["A quiet evening"] });
  await check("E", E.cookie, "/home?sort=latest", { expect: ["A quiet evening", "Newest first."] });
  await check("E", E.cookie, "/explore", { expect: ["A gentle prompt"] });
  await check("E", E.cookie, "/explore?tab=seeking");
  await check("E", E.cookie, "/post/create", { expect: ["Let it out"] });
  await check("E", E.cookie, "/post/create?type=voice");
  await check("E", E.cookie, `/post/${post.data.id}`, { expect: ["Smoke reply: I&#x27;m here to listen.", "They&#x27;d prefer to be heard"] });
  await check("E", E.cookie, `/post/${post.data.id}/edit`, { expect: ["Edit post"] });
  await check("E", E.cookie, `/post/${draft.data.id}`, { expect: ["Smoke draft", "Draft"] });
  await check("E", E.cookie, "/listening", { expect: ["Stories inviting a reply"] });
  await check("E", E.cookie, "/listening?view=private", { expect: ["Your conversations", "Smoke Listener"] });
  await check("E", E.cookie, `/sessions/${sessionId}`, { expect: ["Smoke private message", "Smoke intro"] });
  await check("E", E.cookie, "/saved");
  await check("E", E.cookie, "/journal", { expect: ["Smoke journal"] });
  await check("E", E.cookie, "/journal/new");
  await check("E", E.cookie, `/journal/${journal.data.id}`, { expect: ["Private smoke entry"] });
  await check("E", E.cookie, `/profile/${eProfile.handle}`, { expect: ["Smoke Writer", "Smoke draft", "Smoke listener note"] });
  // Redirects after the streamed shell starts arrive as a client redirect (HTTP 200).
  await check("E", E.cookie, "/profile/me", { expect: [`/profile/${eProfile.handle}`] });
  await check("E", E.cookie, "/settings", { expect: ["Delete account", "Blocked accounts"] });
  await check("E", E.cookie, "/notifications", { expect: ["replied to your post"] });
  // Members never get admin chrome or data, whichever admin URL they try.
  for (const path of ["/admin", "/admin/users", "/admin/verification", "/admin/moderation", "/admin/analytics", "/admin/promotions", "/admin/audit", "/admin/users/someone"]) {
    await check("E", E.cookie, path, { expect: ["The admin area is available to moderators and Super Admins."], notExpect: ["Registered accounts", "Staff area"] });
  }
  await check("E", E.cookie, "/onboarding", { status: 307 });
  await check("E", E.cookie, "/auth/sign-in", { status: 307 });
  await check("E", E.cookie, "/api/account/export", { expect: ["Private smoke entry", "Smoke test: the house feels quiet."] });

  // F (other member): isolation checks at the page level
  await check("F", F.cookie, "/saved", { expect: ["A quiet evening"] });
  await check("F", F.cookie, `/post/${draft.data.id}`, { expect: ["This post isn&#x27;t available"], notExpect: ["Smoke draft"] });
  await check("F", F.cookie, `/journal/${journal.data.id}`, { expect: ["This entry doesn&#x27;t exist."], notExpect: ["Private smoke entry"] });
  await check("F", F.cookie, `/profile/${eProfile.handle}`, { expect: ["Smoke Writer"], notExpect: ["Smoke draft"] });
  await check("F", F.cookie, `/profile/${fProfile.handle}`, { expect: ["Smoke Listener"] });
  await check("F", F.cookie, "/api/account/export", { notExpect: ["Private smoke entry"] });
} finally {
  for (const u of [E, F]) {
    if (!u) continue;
    const { data } = await admin.rpc("voice_objects_owned_by", { p_user: u.id });
    if (data?.length) await admin.storage.from("voice-notes").remove(data.map((o) => o.name));
    await admin.auth.admin.deleteUser(u.id);
  }
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  [${r.label}] ${r.route}${r.ok ? "" : `  -> ${r.problems.join("; ")}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} route checks passed.`);
process.exitCode = failed ? 1 : 0;
