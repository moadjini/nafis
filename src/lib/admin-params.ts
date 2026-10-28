import type { AdminUserFilters } from "@/lib/data";

type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Parses /admin/users style query strings, ignoring anything invalid. */
export function parseUserFilters(params: Params): AdminUserFilters & { raw: Record<string, string | undefined> } {
  const q = one(params.q)?.trim().slice(0, 60) || undefined;
  const role = one(params.role);
  const verified = one(params.verified);
  const status = one(params.status);
  const sort = one(params.sort);
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(params.page) ?? "1", 10) || 1));

  return {
    search: q ?? null,
    role: role === "member" || role === "moderator" || role === "super_admin" ? role : null,
    verified: verified === "yes" ? true : verified === "no" ? false : null,
    restricted: status === "suspended" ? true : status === "active" ? false : null,
    sort: sort === "oldest" || sort === "name" || sort === "verified" ? sort : "newest",
    page,
    raw: { q, role: one(params.role), verified: one(params.verified), status: one(params.status), sort: one(params.sort) },
  };
}
