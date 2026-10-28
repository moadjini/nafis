# Nafis

**Meel aad ku nafiso.** — *A place to let it out.*

Nafis is a calm, pseudonymous peer-support space. People share what they are carrying in writing or by voice, choose how they want to be met ("just listen", advice, similar experiences, or simply expressing), receive gentle reactions and replies, request private conversations with opted-in listeners, keep a private journal, and stay safe through blocking, reporting and human moderation. The interface is available in English and Somali.

> Nafis is peer support. It is not therapy or an emergency service. See `/safety` in the app.

- **Stack:** Next.js 16 (App Router, React 19, TypeScript strict) · Tailwind CSS 4 · Radix/shadcn-style components · Lucide · Supabase (Auth, Postgres + RLS, Storage, Realtime) · React Hook Form + Zod · Vitest
- **Status of every feature:** see [CHECKLIST.md](CHECKLIST.md) (completed, unverified and not-yet-built items are listed separately).

---

## 1. Quick start

```bash
cp .env.example .env.local      # then fill in the values
npm install
npm run db:migrate              # applies supabase/migrations/*.sql
npm run dev                     # http://localhost:3000
```

Requires Node.js 20.9+ (developed on Node 24).

### Environment variables

| Variable | Where it is used | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | `sb_publishable_…` (or the legacy anon key) |
| `NEXT_PUBLIC_SITE_URL` | server | Base URL for auth email redirects, no trailing slash |
| `NEXT_PUBLIC_MAX_RECORDING_SECONDS` | browser + server | Voice limit, default `180`, max `600` |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Account deletion, the cleanup job, storing processed profile pictures, push delivery |
| `CRON_SECRET` | **server only** | Bearer token for `/api/cron/cleanup-audio` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | browser + server | Web push public key. Leave empty to turn push off |
| `VAPID_PRIVATE_KEY` | **server only** | Web push private key (`npx web-push generate-vapid-keys`) |
| `VAPID_SUBJECT` | **server only** | `mailto:you@your-domain` or an `https://` URL; Apple rejects `localhost` |
| `SUPABASE_DB_URL` | scripts/tests only | Session-pooler connection string |

Environment variables are validated at startup (`src/lib/env.ts`, `src/lib/env.server.ts`). Nothing secret is prefixed `NEXT_PUBLIC_`; a production build was scanned and contains only the publishable key.

> **Machine-level variables.** Next.js normally lets variables set in your OS environment win over `.env.local`. On this machine a user-level `NEXT_PUBLIC_SUPABASE_URL` points at a *different* Supabase project. `env-override.cjs` (loaded by `next.config.ts`, the scripts and the tests) makes `.env.local` win and prints a warning naming the overridden key. Removing the stray variable from Windows (System Properties → Environment Variables) is the cleaner fix.

---

## 2. Supabase setup

1. **Run the migrations:** `npm run db:migrate` (`npm run db:status` lists applied/pending). Files are named like Supabase CLI migrations and recorded in `supabase_migrations.schema_migrations`, so `supabase db push` remains compatible.
2. **Auth → URL Configuration:**
   - Site URL: your deployed URL (or `http://localhost:3000`)
   - Redirect URLs: `http://localhost:3000/auth/callback` and `https://<your-domain>/auth/callback`
3. **Auth → Email:** keep *Confirm email* on. The default templates work: links land on `/auth/callback?code=…` (PKCE). If you switch to `token_hash` templates, point them at `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type={{ .Type }}`; the route handles both.
4. **Email delivery:** Supabase's built-in email service is heavily rate-limited and intended for testing; at the time of writing it only delivers to members of your Supabase organisation. Configure **custom SMTP** (Auth → SMTP) before inviting real users.
5. **First Super Admin (one-time bootstrap):** sign up, finish onboarding, copy your handle from `/profile/<handle>`, then run
   ```bash
   npm run admin:bootstrap -- <handle>
   ```
   This calls `private.bootstrap_super_admin()` with the **database owner** connection (`SUPABASE_DB_URL`). It works only while no Super Admin exists, writes a `bootstrap_super_admin` audit entry, and cannot be called through the Data API. From then on, roles are managed only at `/admin/users` (see section 4).
6. **Storage:** the `voice-notes` (private) and `avatars` (public-read, server-write-only) buckets and their policies are created by the migrations; no dashboard steps are needed.
7. **Realtime:** `private_messages`, `private_sessions` and `notifications` are added to the `supabase_realtime` publication by the migrations.

### Migrations

| File | Contents |
| --- | --- |
| `…000100_foundation.sql` | `private` schema, profiles (auto-created with a random pseudonym), roles, account restrictions, notification preferences, blocks, rate limiting |
| `…000200_content.sql` | posts, reactions, replies (max depth 2), reply reactions, bookmarks, muted threads, journal + RLS |
| `…000300_listening.sql` | listening preferences, private sessions (state machine), private messages + RLS |
| `…000400_notifications_safety.sql` | notifications + triggers, reports, append-only moderation audit log, session / block / report / moderation RPCs |
| `…000500_read_api.sql` | read RPCs (`get_posts`, `get_post_replies`, `get_public_profile`, …) |
| `…000600_storage.sql` | private `voice-notes` bucket, storage policies, orphan finder |
| `…000700_privileges_realtime.sql` | revokes all anonymous access, precise table/column grants, Realtime publication |
| `…000800_voice_owner_paths.sql` | voice objects owned via `owner_id` with random names (no user ids in URLs) |
| `…000900_audio_access.sql` | `get_post_audio_path` for authorised playback |
| `…001000_posts_inviting_filter.sql` | `get_posts(p_inviting)` for the Listening space |
| `…001100_roles_verification_avatars.sql` | member / moderator / super_admin roles, last-Super-Admin guard, bootstrap function, `account_verifications`, profile pictures (`avatars` bucket), unified audit trail, admin RPCs, read API with badges and pictures |
| `…001200_avatar_upload_limit.sql` | database-enforced suspension check and rate limit for picture uploads |
| `…001300_feed_ranking_promotions_push.sql` | ranked feed (`get_posts(p_sort => 'top')`), Super Admin boosts and free likes (audited), push subscriptions and the delivery queue |

> Supabase grants `anon`/`authenticated` full privileges on new public objects by default. Any future migration that adds a function must `revoke execute … from public, anon` like the existing ones do.

---

## 3. Security & privacy model

- **Row Level Security on every table**, with explicit policies per operation. Anonymous visitors have **no** table or RPC privileges.
- **Column privileges** limit what clients may write (for example, `posts.status`, `profiles.id` and roles cannot be written by members). Triggers additionally block changing owners, unpublishing, editing moderated content and invalid session transitions.
- **No internal account ids in community data.** Other people's posts, replies, profiles and listener lists are read through `SECURITY DEFINER` functions that return handles and display names only and apply visibility, moderation, block and hidden-topic rules in one place. Participants of a private conversation do see each other's internal id in message rows, because that is needed to render the chat.
- **Counts come from the database:** reactions are written by `set_reaction` (a security-invoker function, so RLS applies) and the response returns persisted counts. One reaction per person per post/reply is a unique constraint.
- **Rate limits** live in Postgres (`private.enforce_rate_limit`) for posts, replies, reactions, bookmarks, reports, blocks, journal entries, session requests and messages; voice uploads are capped by a storage policy.
- **Roles:** `user_roles` is the single source of truth (no row = member). Every `mod_*` and `admin_*` function re-checks the caller's role in SQL, and a suspended account holds no staff powers. Clients have no write access to roles, verification or `profiles.avatar_path`. Details: [docs/admin-and-roles.md](docs/admin-and-roles.md).
- **Moderation:** reporters are never revealed (not even in the moderator queue); the audit log is append-only; moderators see moderation entries only, Super Admins see everything.
- **Service role usage** (server-only, `src/lib/supabase/admin.ts`): (1) account deletion, after verifying the session, acting only on that user's id; (2) the abandoned-file cleanup job, behind `CRON_SECRET`; (3) storing a profile picture *after* the server has decoded and re-encoded it, for the signed-in user only; (4) delivering push notifications (claiming queued notifications and reading device endpoints). Nothing else bypasses RLS.
- **Profile pictures:** the browser crops; the server rejects anything that isn't a real JPEG, PNG or WebP (SVG, HTML, executables included), re-encodes to a 512×512 WebP without EXIF/GPS metadata, and stores it under a random name in the public-read `avatars` bucket, which has no client write policies. Anyone with the URL can view a picture; the upload screen says so.
- **Voice storage:** private bucket; 10 MB limit; audio MIME allow-list; random `<uuid>.<ext>` names (no user ids or folders); uploads only under the uploader's `owner_id`; playback through 10-minute signed URLs created *with the listener's own session*, so the storage policy re-checks post visibility and blocks.
- **Headers:** `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, `Permissions-Policy` (microphone for this origin only). There is no Content-Security-Policy yet.
- **No third-party analytics or trackers.** Cookies: the Supabase session, language and theme.
- Messages are **not** end-to-end encrypted, and the UI says so.

### Retention on account deletion

Deleting the auth user cascades to the profile, the user's posts (with their replies, reactions and bookmarks), the user's own replies, reactions, bookmarks, journal, drafts, notifications, listening preferences, and every private session they took part in (with all its messages, for both participants). Their recordings are removed from storage first. Reports they filed and moderation audit entries are kept with the user reference set to `NULL`. Hosting-provider backups expire on their own schedule; the app does not promise otherwise.

---

## 4. Roles, verification and the admin dashboard

| Capability | Member | Moderator | Super Admin |
| --- | :-: | :-: | :-: |
| Moderation center (reports, hide/remove/restore content, remove pictures) | | ✓ | ✓ |
| Suspend members (≤ 30 days) | | ✓ | ✓ |
| Suspend longer, or suspend moderators | | | ✓ |
| Overview, analytics, user management, verification, role changes | | | ✓ |
| Boost posts and give free likes (Promotions) | | | ✓ |

- `/admin` (Super Admins): overview statistics, **Users** (search, filters, pagination, role changes, verification, suspensions, picture removal, per-account history), **Verification**, **Analytics**, **Promotions**, **Audit logs**.
- `/admin/moderation` and `/admin/audit` are also open to moderators (audit limited to moderation actions).
- The database refuses any change that would leave **no active Super Admin**, including deleting that account. Promote someone else first.
- Super Admins cannot be suspended; demote them first.
- **Verification** is separate from roles: only Super Admins grant or revoke the blue badge, with an optional reason, and both are audited. Promoting someone never verifies them.
- **Recovery** if every Super Admin loses access: as the database owner, insert a `super_admin` row into `public.user_roles` for a trusted handle (SQL editor), then record why in your own records. The app offers no other path.

---

## 5. Feed ranking and promoted posts

The home feed opens on **Top**; **Latest** is one tap away (`/home?sort=latest`). Explore, Listening, profiles and saved posts stay chronological.

- **Top** puts currently boosted posts first (most recently boosted first), then orders by `(reactions + free likes + 2 × replies from other people + 1) ÷ (hours since posting + 2)^1.3`. Replies count double because they are the heart of peer support; an author's own replies don't count. Older posts sink gradually, so new posts still surface.
- Scores are computed at read time from live counts (no stored score to drift). "Show more" pages by offset against the moment the first page loaded, so pages don't repeat or skip. This suits a community feed up to roughly 100k posts; beyond that, a stored score refreshed periodically would be the next step.
- **Boost** (Super Admins, from a post's ⋯ menu): 6 hours to 7 days (up to 30 days through the API). **Free likes**: a number (0 to 100,000) added to the post's ❤️ count and to its score. Neither is labelled for members, and free likes never notify the author. Every change is written to the audit log, and `/admin/promotions` lists what is currently promoted, with real reaction and reply counts beside the free ones.
- Only visible community posts (not drafts, hidden or removed posts) can be promoted. Moderators cannot promote and don't see promotion details.

---

## 6. Installing Nafis and push notifications

**Install (PWA).** `src/app/manifest.ts` and `public/sw.js` make Nafis installable (standalone window, maskable icons in `public/icons`, regenerated with `npm run icons:generate`). After about **12 seconds of visible use** in a session, a small card offers to install: Chrome, Edge and Android use the browser's install prompt; iPhone and iPad get "Share → Add to Home Screen" instructions. Installed apps go straight to the notifications offer. "Not now" hides each offer for 14 days, and the card appears at most once per session.

**Service worker.** It does two things only: it shows `/offline.html` when a page can't load, and it displays push notifications. Pages are never cached, because a shared phone must not show someone else's feed or messages offline.

**Push notifications (opt-in).** Permission is only requested from a tap (the 12-second card, or *Settings → Notifications on this device*). Each device opts in separately.

- Every in-app notification (replies, reaction summaries, listening requests and messages, moderation and account updates) is also queued for push when the recipient has a subscribed device. The existing per-type preferences, mutes and blocks still apply.
- **Privacy:** push text is generic and localised ("Someone replied to your post."). It never contains names, post text or messages, because notifications appear on lock screens. Opening one goes to the related post or conversation, which is re-authorised as usual.
- **Delivery:** server actions schedule delivery right after they respond (`after()`). The server claims queued notifications exactly once (`claim_push_notifications`, service role only), sends them with `web-push` (VAPID), and deletes endpoints that the push service reports as gone. Queued notifications older than an hour, or already read in the app, are dropped instead of sent.
- **Devices and accounts:** signing out removes this device's subscription. If another account signs in on the same browser, the previous account's subscription is dropped, never inherited.
- **Platforms:** Chrome, Edge and Firefox (desktop and Android), and Safari on macOS. On **iPhone and iPad, web push only works after adding Nafis to the Home Screen** (iOS 16.4 or later); Settings explains this.
- **Setup:** generate keys with `npx web-push generate-vapid-keys` and set the three `VAPID` variables. A key pair was generated into `.env.local` for development; use a new pair and a real contact for `VAPID_SUBJECT` in production. Without the keys, push options are hidden.

---

## 7. Voice notes

Recording uses `MediaRecorder` (WebM/Opus in Chromium and Firefox, MP4/AAC in Safari). The microphone is requested only after the user taps **Record** and is released when recording stops. Users can pause/resume (where supported), preview, delete and re-record, or upload an existing file (WebM, Ogg, MP3, M4A, AAC, WAV, up to 10 MB). Uploads go directly to Storage with progress and retry. Nothing is transcribed or analysed.

Abandoned uploads (older than 24 h and not attached to any post) are removed by:

- `GET /api/cron/cleanup-audio` with `Authorization: Bearer $CRON_SECRET` (scheduled daily in `vercel.json` for Vercel deployments), or
- `npm run cleanup:audio` (`-- --dry-run` to preview).

The recording duration is measured in the browser and validated server-side against the configured limit. The server cannot decode audio, so the 10 MB size cap is the hard bound.

---

## 8. Testing

| Command | What it does |
| --- | --- |
| `npm test` | 37 unit tests: validation schemas, Somali/English dictionary parity (keys, list lengths, placeholders), crisis phrase check, audio MIME handling, redirect safety, error mapping, **profile picture processing** (re-encoding, EXIF stripping, rejecting SVG/HTML/executables/GIF/truncated files, size limits), **push message text** (generic, no names or content, both languages, correct links) |
| `npm run test:rls` | 66 integration tests (38 core + 15 roles/verification/admin/avatars + 11 feed ranking/promotions/push + 2 push delivery) **against the Supabase project in `.env.local`** using four throwaway accounts: profile isolation, drafts, feed privacy, reactions/counts/uniqueness, replies and threading, notifications, bookmarks, journal, private sessions & messages, blocking, reporting, moderator-only tools, storage permissions, account deletion. The admin suite calls every admin RPC directly as members, moderators and Super Admins (no UI), checks the last-Super-Admin guard, the bootstrap lock, audit visibility and picture write paths. The feed suite checks Top vs Latest ordering and offset paging; that only Super Admins can boost or add free likes (members and moderators get `not_allowed` even when calling the database directly); that members never see promotion details; auditing; and that push subscriptions and the delivery queue are unreachable from clients. The delivery suite runs the real queue → claim → send path with only the push-service call mocked. Deletes its users, roles and records afterwards. **Run it against a development project only.** |
| `npm run test:e2e` | 20 Playwright browser tests of the signed-in flows, including boosting and free likes (Top vs Latest, nothing visible to members), installability (manifest, icons, service worker, offline page), the 12-second notifications offer, turning push on and off, and signing out (push tests run in full Chromium; only `PushManager.subscribe` is stubbed because headless browsers can't reach a real push service), the admin area (members and moderators blocked by URL, a Super Admin promoting, verifying, suspending and restoring) and the profile picture upload/crop/remove flow, plus: onboarding (including the language switch), text posts with preview and the crisis notice, drafts, the discard guard, **voice recording with Chromium's fake microphone** (pause/resume, upload, signed-URL playback), reactions, threaded replies and edits, live notification badge, bookmarks, reporting, and live private conversations (request, accept, decline, withdraw, messages both ways, end). Builds the app and starts it on port 3100 (`E2E_BASE_URL=…` to use a running server). Each test signs in throwaway users by injecting real `@supabase/ssr` session cookies, then deletes them. First run: `npx playwright install chromium`. |
| `npm run test:smoke` | With `npm run dev` running: signs in two throwaway users through `@supabase/ssr`, seeds content and checks 45 routes render (including every admin URL as a member, the manifest, the service worker and the offline page) (and that private content does not leak between users). Check the dev-server log for `⨯` lines as well. |
| `npm run typecheck` · `npm run lint` · `npm run build` | Static checks and the production build |

---

## 9. Deployment

Any Node.js host that runs Next.js 16 works (Vercel is simplest).

1. Set the environment variables from the table above in the host's dashboard. **Use a fresh service role key and database password** (see the note below).
2. Set `NEXT_PUBLIC_SITE_URL` to the public URL and add `https://<domain>/auth/callback` to Supabase redirect URLs.
3. Configure custom SMTP in Supabase.
4. Schedule the audio cleanup (`vercel.json` already does this on Vercel; elsewhere use any cron that sends the bearer token).
5. Bootstrap the first Super Admin (`npm run admin:bootstrap -- <handle>`), then grant moderators from `/admin/users`.
6. For push notifications, set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (generate a new pair for production). Installing and push both require HTTPS.

> **Credentials:** the service role key and database password used during setup were shared in a chat conversation. They are stored only in `.env.local` (git-ignored), but rotating both in the Supabase dashboard before launch is recommended.

---

## 10. Project structure

```
src/
  app/                    routes (App Router)
    (app)/                signed-in area: home, explore, post, listening, sessions, saved,
                          journal, profile, settings, notifications
    admin/                staff area: overview, users, verification, moderation, analytics, audit
    (info)/               community-guidelines, safety, privacy, about
    auth/                 sign-in, sign-up, forgot/reset password, callback, error
    actions/              server actions (all validate input and re-check the session)
    api/                  account export, audio cleanup cron
  components/             UI (ui/ = design-system primitives)
  lib/                    supabase clients, auth helpers, data loaders, validation, i18n
  proxy.ts                session refresh + route gating (Next 16's renamed middleware)
  app/manifest.ts         PWA manifest
  lib/push/               push: message text, server delivery, browser subscription helpers
public/                   sw.js (offline page + push), offline.html, icons/
supabase/migrations/      SQL migrations
docs/                     admin-and-roles.md (roles, permissions, bootstrap, verification, pictures)
scripts/                  migrate, admin:bootstrap, cleanup (audio + orphaned pictures)
tests/                    unit/, rls/, e2e/ (Playwright), smoke/, support/ (shared test-user helpers)
```

### Design system

Tokens live in `src/app/globals.css` (`:root` and `.dark`). White is the dominant surface; green marks actions, selection and reassurance. White text on `#16A34A` is only ~3.3:1, so filled buttons and green text use the deep green `#15803D` (~5:1, WCAG AA). `#16A34A` is used for icons, indicators, focus rings and the waveform. Red is reserved for destructive actions and emergency guidance.

The green accent is deliberately more visible on *interactive* states (primary buttons, the active navigation pill and indicator, selected chips, focus glow, menu highlights, page-title accent) while surfaces stay white. The verified badge uses `--verified` (#1D9BF0: 3.0:1 on white, 5.5:1 on the dark surface, and always paired with an accessible "Verified account" label) and charts use `--chart-mark` (#16A34A), validated against the light and dark surfaces.

### Adding a language

Add `src/lib/i18n/dictionaries/<code>.ts` typed as `Dictionary`, register it in `src/lib/i18n/index.ts` and `LOCALES` in `src/lib/constants.ts`, and extend the `profiles_language` check constraint. `npm test` fails if any key, list length or placeholder is missing.

> The Somali copy was written for natural everyday Somali, but it has **not** been reviewed by a native speaker yet.

### Rendering model

`cacheComponents` (on in the Next 16 template) is intentionally disabled: almost every page is personalised and cookie-authenticated, so standard dynamic rendering is simpler and safer here.
