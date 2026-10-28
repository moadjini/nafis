# Nafis — delivery checklist

Status as of 2026-10-28. "Verified" means exercised by an automated test or an actual run, as noted.

Legend: ✅ completed and verified · 🟡 implemented, not verified end-to-end · ⬜ not implemented

Test suites referenced below: **unit** (`npm test`, 37), **RLS** (`npm run test:rls`, 66, live Supabase), **E2E** (`npm run test:e2e`, 20 Playwright browser tests on a production build), **smoke** (`npm run test:smoke`, 45 routes).

## Foundation

| Item | Status | Evidence |
| --- | --- | --- |
| Next.js 16 + TypeScript strict + Tailwind 4 + Radix/shadcn-style UI | ✅ | `npm run build`, `npm run typecheck`, `npm run lint` all pass |
| White-and-green design tokens, light + dark themes | ✅ | Viewed landing, auth and safety pages (light, dark, mobile, desktop) |
| English + Somali, switchable, extensible | ✅ | Dictionary parity unit tests; E2E switches language during onboarding |
| Somali copy reviewed by a native speaker | ⬜ | Not yet; please arrange a review |
| Landing page (hero, CTAs, pseudonymity, text/voice preview, reaction demo, safety, disclaimer, footer) | ✅ | Rendered and checked at mobile and desktop widths; demo content labelled "Example" |
| Environment validation, `.env.example` with placeholders only | ✅ | |

## Authentication & onboarding

| Item | Status | Evidence |
| --- | --- | --- |
| Email/password sign-up, sign-in, sign-out | ✅ | RLS suite (sign-in, wrong password, sign-out); sign-in form validation checked in the browser |
| Email verification and password-reset emails | 🟡 | Code paths done (`/auth/callback` handles `code` and `token_hash`). No real email was sent: requires redirect URLs and custom SMTP in Supabase |
| Password update (final reset step) | ✅ | RLS suite |
| Typing credentials into the sign-in form in a browser | 🟡 | E2E tests sign in by injecting real session cookies, so the form's submit path itself is not exercised by a browser test |
| OAuth providers | ⬜ | Optional per spec; none configured, so no buttons are shown |
| Protected routes (proxy + server checks) | ✅ | Smoke test (guest → sign-in; signed-in away from auth pages); E2E (un-onboarded user → `/onboarding`, onboarded → `/home`) |
| 7-step onboarding (language, pseudonym, avatar, listening, privacy, guidelines, enter) | ✅ | E2E: full wizard, validation, suggestion button, persisted profile and listening preferences |

## Community

| Item | Status | Evidence |
| --- | --- | --- |
| Home feed, filters (all/text/voice, topic, language), "Show more" pagination | ✅ | Smoke test renders filtered feeds; E2E finds new posts in the feed; keyset pagination via `get_posts` |
| Explore (recent, waiting for a reply, voice, text, topic/language, daily prompt, hide topics) | ✅ | Smoke test |
| Text composer (caption, topic, language, response preference, preview, draft, cancel guard, privacy reminder) | ✅ | E2E: publish with preview, draft → publish, discard dialog |
| Crisis support notice in composer (non-blocking) | ✅ | Unit tests + E2E (appears for crisis language, disappears otherwise, posting still possible) |
| Voice recording (permission on tap, pause/resume, timer, level meter, preview, re-record, publish) | ✅ | E2E with Chromium's fake microphone, including the browser XHR upload to private storage |
| Voice recording with a real microphone, Safari (MP4) and Firefox | 🟡 | Only Chromium with a fake device was automated |
| Uploading an existing audio file instead of recording | 🟡 | Implemented; not covered by a test |
| Voice playback via short-lived signed URLs, re-checked per viewer | ✅ | RLS suite (owner, other member, anonymous, blocked, drafts); E2E plays back and checks the URL has no user id |
| Edit/delete own posts; moderated posts locked; no unpublishing | ✅ | RLS suite; E2E publishes a draft from the edit page |
| Reactions (7 types, one per user, change/remove, persisted counts, optimistic UI) | ✅ | RLS suite + E2E (picker, change, remove, second member, reload persistence) |
| Replies, edit own, depth-2 threading, supportive prompts, author badge | ✅ | RLS suite + E2E |
| Reply reactions, deleting replies from the UI | 🟡 | DB rules verified by the RLS suite; not clicked in E2E |
| Bookmarks (private, author not notified) | ✅ | RLS suite + E2E |
| Report from the post menu | ✅ | E2E; reports for other targets verified at the DB level (RLS suite) |
| Block from the UI | 🟡 | Blocking behaviour verified by the RLS suite; the dialog is not clicked in E2E |
| Mute notifications for a conversation | 🟡 | Implemented; not covered by a test |

## Listening & personal spaces

| Item | Status | Evidence |
| --- | --- | --- |
| Listening availability, languages, topics, note | ✅ | RLS suite + smoke test + E2E (set during onboarding) |
| Private requests to a specific listener; accept, decline, withdraw, end | ✅ | RLS suite (state machine, permissions) + E2E (all four transitions in the browser) |
| Open requests to "anyone available" | 🟡 | DB path implemented; not covered by E2E |
| Private chat with persisted messages; outsiders blocked | ✅ | RLS suite + E2E (third member opening the URL sees nothing) |
| Live updates via Realtime (chat messages, session status, notification badge) | ✅ | E2E: messages both ways, acceptance and ending appear without reloading, badge updates live. **Bug found and fixed:** subscriptions were joining before the session token loaded (rejected as anonymous) |
| Journal (create/edit/delete, drafts, browse by month, strictly private) | ✅ DB / 🟡 UI | RLS suite + smoke test; the editor is not clicked in E2E |
| Saved posts page | ✅ | Smoke test + E2E |
| Pseudonymous profiles (no ids/emails, listening badge and note, own drafts, block/report/unblock) | ✅ | RLS suite + smoke test + E2E (drafts section) |
| In-app notifications, mark read / all read, preferences | ✅ | RLS suite + smoke test + E2E (reply notification) |
| Email notifications | ⬜ | Preference is stored; nothing is sent (no email provider configured). The settings page says so |
| Browser push notifications | ⬜ | Intentionally not enabled (requires a provider and consent) |

## Safety, moderation & account

| Item | Status | Evidence |
| --- | --- | --- |
| Reports (post, reply, user, session, message), confidential | ✅ | RLS suite + E2E (post report) |
| Moderation queue, hide/remove/restore, resolve/dismiss, suspensions, audit log | ✅ DB / 🟡 UI | RLS suites (member vs moderator vs Super Admin). E2E: a moderator reaches the moderation center and scoped audit log; a Super Admin suspends a member and lifts it from the restrictions view. Hide/remove/restore buttons in the queue are not clicked in E2E |
| Rate limits (DB-level) | ✅ / 🟡 | Enforcement code shared by all actions; limits not load-tested |
| Safety page with verified resources | 🟡 | 988 (US), Samaritans (UK/IE) and findahelpline.com are listed; **no Somali crisis lines** because none could be verified |
| Settings (profile, handle, avatar, language, theme, notifications, hidden topics, blocked accounts, privacy info, sign-out) | ✅ render / 🟡 UI | Smoke test; forms not clicked in E2E |
| Data export (JSON) | ✅ | Smoke test (includes own data, excludes other users' private data) |
| Account deletion with documented retention | ✅ logic / 🟡 UI | `deleteUserAccount` verified in the RLS suite; the settings button itself was not clicked |
| Abandoned-audio cleanup | 🟡 | Route, script and SQL done; the 24 h path was not exercised |
| Orphaned profile-picture cleanup | 🟡 | Added to the same job (files not referenced by any profile, older than 1 h); the SQL finder is service-role only and verified, the deletion run itself was not exercised |

## Roles, verification & administration

| Item | Status | Evidence |
| --- | --- | --- |
| Three roles (member / moderator / super_admin), legacy `admin` mapped to `moderator` | ✅ | Migration applied; the existing moderator role kept; RLS suite |
| Permissions enforced in SQL (every `mod_*` / `admin_*` RPC re-checks the caller; suspended staff have no powers) | ✅ | RLS admin suite calls each RPC directly as member, moderator and Super Admin, bypassing the UI |
| Users cannot grant themselves roles, verify themselves, or set `avatar_path` by editing requests | ✅ | RLS admin suite: direct table writes and RPC calls rejected; no client write grants or policies exist |
| Moderators: members only, ≤ 30-day suspensions; nobody suspends a Super Admin | ✅ | RLS admin suite |
| Last-active-Super-Admin protection (demote, delete row, delete account) | ✅ | RLS admin suite (DB trigger + account-deletion pre-check) |
| Secure one-time bootstrap (`npm run admin:bootstrap -- <handle>`) | ✅ logic / 🟡 real run | RLS suite: `authenticated` and `service_role` cannot execute it, it refuses when a Super Admin exists. **You have not bootstrapped your own account yet** |
| Audit log for role, verification, picture and moderation actions, append-only, scoped by role | ✅ | RLS admin suite (moderators see moderation actions only) + E2E |
| Blue verified badge everywhere a name appears (feed, replies, profile, menus, listeners, sessions, chat, admin) | ✅ | RLS suite (feed and profile data); E2E checks the badge on the post card, profile heading and admin lists, and that it disappears on revoke. Every name goes through one component (`UserName`) |
| Verification is never automatic for staff; grant/revoke by Super Admins with reason and notification | ✅ | RLS admin suite + E2E |
| `/admin`: Overview, Users (search, filters, sort, pagination, detail + history), Verification, Moderation, Analytics, Audit logs | ✅ | E2E (Super Admin flows; members and moderators blocked by URL) + smoke (all 7 admin URLs as a member) + viewed at mobile and desktop widths |
| Analytics charts (small multiples, table view, keyboard readout) | ✅ | Chart colour validated for light and dark surfaces; viewed in the browser |
| Platform settings editor | ⬜ | Not built; settings remain code/env based |

## Profile pictures

| Item | Status | Evidence |
| --- | --- | --- |
| Upload with crop/zoom (drag, keyboard, slider) and remove | ✅ | E2E: upload, crop, save, appears in header and profile, remove |
| Server-side validation (real JPEG/PNG/WebP only, size limits, re-encoded to 512×512 WebP, EXIF/GPS stripped, random file name) | ✅ | Unit tests (SVG, HTML, executable, GIF, truncated and oversized files rejected; metadata removed) |
| Storage: public-read `avatars` bucket with no client write policies; server writes after processing | ✅ | RLS admin suite (direct client upload rejected); bucket has 0 policies |
| Upload rate limit and suspension check in the database | ✅ / 🟡 | RLS admin suite verifies the suspension and sign-in checks; the 10-per-hour limit uses the shared rate-limit code but was not exhausted in a test |
| Moderators can remove a picture (audited) | ✅ | RLS admin suite |
| Picture upload in Safari/Firefox; iPhone HEIC photos | 🟡 | Only Chromium was automated. HEIC is not accepted ("Choose a JPEG, PNG or WebP image."); iPhones usually convert when picking from Photos, but this was not tested on a device |

## Visual refinement

| Item | Status | Evidence |
| --- | --- | --- |
| Softer, more visible green on interactive states (buttons, active nav pill, chips, focus glow, menus, page-title accent, toasts) with white surfaces | ✅ | Viewed in the browser (light and dark, mobile and desktop) |

## Feed ranking, promotions, install & push

| Item | Status | Evidence |
| --- | --- | --- |
| Top feed (boosted first, then engagement score with time decay) as the home default, with a Latest toggle | ✅ | RLS suite (Top vs Latest order, author's own replies ignored, offset paging without repeats); E2E (boosted post first in Top, newest first in Latest) |
| Super Admin boost (6 h–7 days) and free likes from the post menu, both audited | ✅ | RLS suite (members and moderators get `not_allowed` calling the database directly; validation; only visible community posts); E2E (boost, free likes, audit entries) |
| Promotions invisible to members (no label, no promotion data in responses) | ✅ | RLS suite (`promotion` is null for members and moderators); E2E (no badge or controls for a member) |
| `/admin/promotions` overview with quick removal | ✅ | E2E (remove boost) + smoke (blocked for members) + viewed at desktop width |
| Installable PWA: manifest, icons (incl. maskable), service worker, offline page | ✅ | E2E (manifest fields, icons served, worker active, offline page shown when the network is down) + smoke |
| Service worker never caches pages | ✅ | By design (network-only navigations, offline page only); E2E checks the offline page shows no feed content |
| Install prompt after ~12 s (Chrome/Edge/Android) and iPhone "Add to Home Screen" instructions | 🟡 | Built; the browser's install event can't be triggered in automated tests and it was not tried on a phone |
| Notifications offer after ~12 s of use, once per session, "Not now" remembered for 14 days | ✅ | E2E with a fake clock (not shown before 12 s, shown after, not shown again) + viewed at mobile width |
| Per-device opt-in in Settings, removal on sign-out, no inheritance when another account signs in on the same browser | ✅ | E2E in full Chromium with only `PushManager.subscribe` stubbed (headless browsers can't reach a real push service); RLS suite (subscriptions unreadable by clients, endpoint ownership) |
| Push delivery: queue, claim exactly once, generic localised text, stale/read ones dropped, gone endpoints deleted | ✅ server / 🟡 device | RLS delivery suite runs the real database path with the push-service call mocked; unit tests for the message text. **No notification was delivered to a real phone or desktop**; please try it once with HTTPS or on localhost in Chrome |
| iOS web push (Home Screen app, iOS 16.4+) | 🟡 | Not tested on a device |
| Retry when a delivery run fails | ⬜ | Delivery runs after each action; nothing retries a failed run, and queued notifications older than 1 hour are dropped |

## Quality

| Item | Status | Evidence |
| --- | --- | --- |
| Unit tests | ✅ | 37 passing |
| RLS / permission tests with separate users | ✅ | 65 passing + 1 skipped against the live project (four files). The skipped test ("refuses to lose the last active Super Admin") only runs when no other Super Admin exists; your account is now a Super Admin, and the guard was verified before that |
| Browser end-to-end tests of signed-in flows | ✅ | 20 passing (Playwright, Chromium, production build) |
| SSR smoke test of all signed-in routes | ✅ | 45/45 routes, no server render errors |
| Test data cleanup | ✅ | After every suite: 0 test accounts, roles, verifications, posts, recordings, pictures, reports or audit entries remain |
| No secrets in client bundles | ✅ | Production build scanned: no service-role key, database password, VAPID private key or admin copy in browser code |
| Accessibility (labels, focus states, keyboard, reduced motion, non-colour status) | 🟡 | Built in; E2E drives the app through accessible roles and labels; no automated axe audit or screen-reader pass yet |
| Content-Security-Policy header | ⬜ | Other security headers are set |
