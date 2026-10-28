import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, CloudOff, ShieldOff, type LucideIcon } from "lucide-react";
import type { AdminDictionary } from "@/lib/i18n";
import { cn, interpolate } from "@/lib/utils";
import { EmptyState } from "@/components/ui/misc";

// Small server-renderable building blocks shared by the admin pages.

export function AdminHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function NotAllowed({ t, body }: { t: AdminDictionary; body?: string }) {
  return (
    <div className="rounded-3xl border border-border bg-surface">
      <EmptyState icon={ShieldOff} title={t.admin.notAllowedTitle} body={body ?? t.admin.notAllowedBody} />
    </div>
  );
}

export function LoadError({ t }: { t: AdminDictionary }) {
  return (
    <div role="alert" className="rounded-3xl border border-border bg-surface">
      <EmptyState icon={CloudOff} title={t.admin.loadErrorTitle} body={t.admin.loadErrorBody} />
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  hint,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  detail?: string;
  hint?: string;
  tone?: "default" | "attention";
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4" title={hint}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-xl",
            tone === "attention" ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-primary-faint text-primary-text",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {detail ? <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p> : null}
      {hint ? <p className="sr-only">{hint}</p> : null}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-surface", className)}>
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Query-string pagination that keeps the other filters. */
export function Pagination({
  t,
  page,
  total,
  pageSize,
  basePath,
  params,
}: {
  t: AdminDictionary;
  page: number;
  total: number;
  pageSize: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const linkClass = "inline-flex h-9 items-center gap-1 rounded-full border border-border bg-surface px-3 text-sm hover:border-primary/40 hover:text-primary-text";
  const disabledClass = "inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm text-muted-foreground/60";

  return (
    <nav aria-label={interpolate(t.admin.pageOf, { page, pages })} className="flex items-center justify-between gap-3 px-1 pt-4 text-sm">
      <span className="text-muted-foreground">
        {interpolate(t.admin.results, { count: total })} · {interpolate(t.admin.pageOf, { page, pages })}
      </span>
      <span className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={linkClass}>
            <ChevronLeft className="size-4" aria-hidden /> {t.admin.previous}
          </Link>
        ) : (
          <span className={disabledClass} aria-disabled>
            <ChevronLeft className="size-4" aria-hidden /> {t.admin.previous}
          </span>
        )}
        {page < pages ? (
          <Link href={href(page + 1)} className={linkClass}>
            {t.admin.next} <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <span className={disabledClass} aria-disabled>
            {t.admin.next} <ChevronRight className="size-4" aria-hidden />
          </span>
        )}
      </span>
    </nav>
  );
}

export function RoleBadge({ t, role }: { t: AdminDictionary; role: "member" | "moderator" | "super_admin" }) {
  if (role === "member") return <span className="text-sm text-muted-foreground">{t.roles.member}</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        role === "super_admin" ? "bg-primary-strong text-primary-foreground" : "bg-primary-soft text-primary-text",
      )}
    >
      {t.roles[role]}
    </span>
  );
}
