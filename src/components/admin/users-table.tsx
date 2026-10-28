import type { Locale } from "@/lib/constants";
import { formatDate, type AdminDictionary } from "@/lib/i18n";
import type { AdminUserRow } from "@/lib/types";
import { interpolate } from "@/lib/utils";
import { Avatar } from "@/components/avatar";
import { UserName } from "@/components/user-name";
import { VerifiedBadge } from "@/components/verified-badge";
import { Badge } from "@/components/ui/misc";
import { RoleBadge } from "./admin-ui";
import { UserActionsMenu, VerificationToggle } from "./user-actions";

/** Account table for Super Admins. Never shows email addresses. */
export function UsersTable({
  t,
  locale,
  rows,
  viewerHandle,
  variant = "users",
}: {
  t: AdminDictionary;
  locale: Locale;
  rows: AdminUserRow[];
  viewerHandle: string;
  /** "verification" swaps the menu for a single grant/revoke button. */
  variant?: "users" | "verification";
}) {
  if (rows.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{variant === "users" ? t.admin.users.empty : t.admin.verificationPage.empty}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">{t.admin.users.colUser}</th>
            <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">{t.admin.users.colRole}</th>
            <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">{t.admin.users.colVerification}</th>
            <th scope="col" className="hidden px-4 py-2.5 font-medium lg:table-cell">{t.admin.users.colJoined}</th>
            <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">{t.admin.users.colStatus}</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              <span className="sr-only">{t.admin.users.colActions}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((u) => {
            const target = {
              handle: u.handle,
              displayName: u.display_name,
              role: u.role,
              isVerified: u.is_verified,
              suspendedUntil: u.suspended_until,
              hasPicture: Boolean(u.avatar_path),
            };
            return (
              <tr key={u.handle} className="align-middle hover:bg-primary-faint/40">
                <td className="px-4 py-3">
                  <div className="flex min-w-[13rem] max-w-[22rem] items-center gap-3">
                    <Avatar avatarKey={u.avatar_key} avatarPath={u.avatar_path} name={u.display_name} size="md" />
                    <div className="min-w-0">
                      <UserName name={u.display_name} verified={u.is_verified} href={`/admin/users/${u.handle}`} className="flex" nameClassName="font-medium" />
                      <p className="truncate text-xs text-muted-foreground">
                        @{u.handle}
                        <span className="sm:hidden"> · {t.roles[u.role]}</span>
                      </p>
                      <p className="hidden text-xs text-muted-foreground xl:block">
                        {interpolate(t.admin.users.postsAndReports, { posts: u.post_count, reports: u.open_reports })}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  <RoleBadge t={t} role={u.role} />
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  {u.is_verified ? (
                    <span className="inline-flex items-center gap-1.5 text-foreground">
                      <VerifiedBadge /> {u.verified_at ? formatDate(u.verified_at, locale, { dateStyle: "medium" }) : t.admin.users.verified}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{t.admin.users.notVerified}</span>
                  )}
                </td>
                <td className="hidden px-4 py-3 tabular-nums text-muted-foreground lg:table-cell">
                  {formatDate(u.created_at, locale, { dateStyle: "medium" })}
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  {u.suspended_until ? (
                    <Badge tone="danger">{interpolate(t.admin.users.suspendedUntil, { date: formatDate(u.suspended_until, locale, { dateStyle: "medium" }) })}</Badge>
                  ) : !u.onboarding_completed ? (
                    <Badge>{t.admin.users.onboardingPending}</Badge>
                  ) : (
                    <Badge tone="green">{t.admin.users.active}</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {variant === "verification" ? (
                    <VerificationToggle target={target} />
                  ) : (
                    <UserActionsMenu target={target} viewerRole="super_admin" viewerHandle={viewerHandle} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

