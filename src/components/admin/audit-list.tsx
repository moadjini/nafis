import Link from "next/link";
import type { Locale, Role } from "@/lib/constants";
import { formatDate, type AdminDictionary } from "@/lib/i18n";
import type { AuditLogRow } from "@/lib/types";
import { interpolate } from "@/lib/utils";

function describeMetadata(t: AdminDictionary, row: Pick<AuditLogRow, "action" | "metadata">) {
  const m = row.metadata ?? {};
  if (row.action === "set_role" && typeof m.from === "string" && typeof m.to === "string") {
    return `${t.roles[m.from as Role] ?? m.from} → ${t.roles[m.to as Role] ?? m.to}`;
  }
  if (typeof m.status === "string") {
    const status = m.status as keyof AdminDictionary["moderation"]["contentStatus"];
    const reportStatus = m.status as keyof AdminDictionary["moderation"]["reportStatus"];
    return t.moderation.contentStatus[status] ?? t.moderation.reportStatus[reportStatus] ?? m.status;
  }
  if (typeof m.days === "number") return `${m.days} ${t.moderation.suspendDays.toLowerCase()}`;
  if (row.action === "boost_post" && typeof m.hours === "number") return interpolate(t.admin.promotions.hoursDetail, { hours: m.hours });
  if (row.action === "set_bonus_likes" && typeof m.from === "number" && typeof m.to === "number") {
    return interpolate(t.admin.promotions.likesDetail, { from: m.from, to: m.to });
  }
  return null;
}

/** Audit entries as a responsive list (table-like on wide screens). */
export function AuditList({
  t,
  locale,
  rows,
  linkUsers,
}: {
  t: AdminDictionary;
  locale: Locale;
  rows: AuditLogRow[];
  /** Super Admins can open the affected account's admin page. */
  linkUsers: boolean;
}) {
  if (rows.length === 0) return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t.admin.audit.empty}</p>;

  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => {
        const detail = describeMetadata(t, row);
        return (
          <li key={row.id} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
            <div className="min-w-0">
              <p className="font-medium">{t.moderation.actionLabels[row.action] ?? row.action}</p>
              {detail ? <p className="text-xs text-primary-text">{detail}</p> : null}
              {row.target_type === "post" && row.target_id ? (
                <Link href={`/post/${row.target_id}`} className="text-xs text-muted-foreground hover:text-primary-text hover:underline">
                  {t.admin.audit.viewPost}
                </Link>
              ) : null}
              {row.reason ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.reason}</p> : null}
            </div>
            <p className="min-w-0 truncate text-muted-foreground">
              <span className="sr-only sm:not-sr-only sm:hidden">{t.admin.audit.affected}: </span>
              {row.affected_handle ? (
                linkUsers ? (
                  <Link href={`/admin/users/${row.affected_handle}`} className="text-foreground hover:text-primary-text hover:underline">
                    @{row.affected_handle}
                  </Link>
                ) : (
                  <span className="text-foreground">@{row.affected_handle}</span>
                )
              ) : (
                "—"
              )}
            </p>
            <p className="min-w-0 truncate text-muted-foreground">
              {t.admin.audit.by} {row.actor_handle ? `@${row.actor_handle}` : t.admin.system}
            </p>
            <time dateTime={row.created_at} className="text-xs tabular-nums text-muted-foreground sm:text-right">
              {formatDate(row.created_at, locale, { dateStyle: "medium", timeStyle: "short" })}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
