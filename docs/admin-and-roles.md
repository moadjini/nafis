# Roles, verification, avatars and the admin dashboard — design

This document records the schema and authorization decisions behind the
Super Admin upgrade (migration `20261028001100_roles_verification_avatars.sql`).

## What existed before

- `public.user_roles (user_id, role ∈ {moderator, admin}, granted_at, granted_by)` with RLS
  "owner can read own role" and **no client write policies**.
- `private.is_moderator(uid)` returned true for `moderator` *or* `admin`; it is
  referenced by RLS policies on profiles, posts, replies, restrictions, audit logs
  and storage, and by every `mod_*` RPC.
- `scripts/grant-moderator.mjs` wrote `user_roles` directly over the database
  connection, with no audit entry.
- `public.moderation_audit_logs` (append-only) recorded content and report actions.
- Avatars were abstract icons (`profiles.avatar_key`); there were no uploads.

At the time of the upgrade the database held one real account, a `moderator`, and
no `admin` rows.

## Decisions

### 1. One roles table, three effective roles

`user_roles` stays the single source of truth. A missing row means **member**;
allowed values become `moderator` and `super_admin`. The old `admin` value
(which only ever had moderator powers) is migrated to `moderator`, which is
least privilege, so the upgrade can never silently create a Super Admin. No
`role` column is added to `profiles`.

| Capability | Member | Moderator | Super Admin |
| --- | :-: | :-: | :-: |
| Use the community | ✓ | ✓ | ✓ |
| Moderation center (reports, hide/remove/restore content, remove avatars) | | ✓ | ✓ |
| Suspend members (≤ 30 days) | | ✓ | ✓ |
| Suspend members > 30 days, suspend moderators | | | ✓ |
| Suspend a Super Admin | | | ✗ (demote first) |
| Read moderation audit entries | | ✓ | ✓ |
| Read role / verification / promotion audit entries | | | ✓ |
| Overview, analytics, user management | | | ✓ |
| Grant / revoke roles, grant / revoke verification | | | ✓ |
| Boost posts, give free likes, read promotion audit entries (added later; see README §5) | | | ✓ |

Helpers (all `SECURITY DEFINER`, in the unexposed `private` schema):

- `private.role_of(uid)` → `member | moderator | super_admin`
- `private.is_moderator(uid)` → moderator **or** super admin, **and not suspended**
  (same signature, so existing policies keep working)
- `private.is_super_admin(uid)` → super admin and not suspended

Every admin RPC re-checks these in the database. The dashboard hides navigation
for convenience only.

### 2. Changing roles

- Only `public.admin_set_role(handle, role, reason)` changes roles, and only for
  Super Admins. Suspended accounts cannot be promoted.
- Clients still have no write privileges on `user_roles`.
- A `BEFORE UPDATE OR DELETE` trigger refuses any change that would leave **no
  active Super Admin**. That covers demotion, deleting the role row, and deleting
  the account itself. It takes an advisory lock, so two Super Admins cannot
  demote each other at the same moment.
- `account deletion` checks this first and explains instead of failing.

### 3. Bootstrapping the first Super Admin

`private.bootstrap_super_admin(handle)` runs only while **no Super Admin
exists**, and only for the database owner. Authenticated users cannot execute
it, and the `private` schema is not exposed through the Data API. It is run with
`npm run admin:bootstrap -- <handle>`, which needs `SUPABASE_DB_URL` (database
owner credentials), and it writes a `bootstrap_super_admin` audit entry. After
that, roles are managed only in the dashboard. `scripts/grant-moderator.mjs` is
removed because it bypassed the audit log.

### 4. Verification is separate from roles

- New table `public.account_verifications (user_id, verified_at, verified_by, reason)`.
- RLS: the owner and Super Admins can read rows; **no client write policies**.
- Changes go only through `public.admin_set_verification(handle, verified, reason)`.
- Promoting someone never verifies them, and verification is never inferred from
  names, emails, roles or client state.
- Public reads (`get_posts`, replies, profiles, listeners, sessions, blocked list)
  return `*_verified` booleans so the badge renders everywhere from the same data.

### 5. Audit log

`moderation_audit_logs` becomes the single audit trail:

- New column `affected_user_id`, the account an action concerns.
- New actions: `set_role`, `bootstrap_super_admin`, `grant_verification`,
  `revoke_verification`, `remove_avatar`.
- It stays append-only. The guard trigger now also allows the FK action that
  nulls `affected_user_id` when an account is deleted.
- Moderators can read moderation actions only; Super Admins can read everything.

### 6. Profile pictures

- **Upload path:** the browser crops to a square and sends the image to a server
  action. The server checks size (≤ 2 MB) and decodes it with `sharp`; anything
  that is not a real JPEG, PNG or WebP image is rejected (SVG, HTML and
  executables included). It then re-encodes to a 512×512 WebP, which **strips
  EXIF and GPS metadata**, and stores it under a random `<uuid>.webp` name.
- **Storage:** new bucket `avatars`. It is **public-read**, so images load fast
  and can be cached. There are **no client insert, update, delete or list
  policies**, and only `image/webp` up to 1 MB is accepted. Only the server
  writes, using the service role after verifying the session. This is the third
  documented service-role use; account deletion and the cleanup job are the
  other two.
- **Trade-off:** anyone holding the URL can view an uploaded picture. The URL is
  random and contains no account id, and the upload screen warns users to avoid
  identifying photos. Abstract avatars remain the default.
- `profiles.avatar_path` is not client-writable (no column privilege) and must
  match the random-name format.
- Moderators can remove a picture (`mod_remove_avatar`); orphaned files are
  deleted by the existing cleanup job.

## Not included

- A "platform settings" editor, since the dashboard sections requested did not
  include one.
- Showing staff roles publicly.
- Exposing email addresses in the dashboard: admins work with pseudonyms only.
