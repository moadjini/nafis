import type { Metadata } from "next";
import Link from "next/link";
import { isSuperAdmin, requireProfile } from "@/lib/auth";
import { adminActivitySeries } from "@/lib/data";
import { formatDate, toAdminDictionary } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import { ActivityChart } from "@/components/admin/activity-chart";
import { AdminHeader, LoadError, NotAllowed, Panel } from "@/components/admin/admin-ui";

const PERIODS = [7, 30, 90] as const;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.admin.analytics.title };
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const [profile, { t: dict, locale }, params] = await Promise.all([requireProfile("/admin/analytics"), getI18n(), searchParams]);
  const t = toAdminDictionary(dict);
  if (!isSuperAdmin(profile)) return <NotAllowed t={t} />;

  const days = PERIODS.find((d) => String(d) === params.days) ?? 30;
  const result = await adminActivitySeries(days);
  if (!result.ok) return result.error === "not_allowed" ? <NotAllowed t={t} /> : <LoadError t={t} />;
  const series = result.data;
  const periodLabel = { 7: t.admin.overview.periods.d7, 30: t.admin.overview.periods.d30, 90: t.admin.overview.periods.d90 } as const;

  const measures = [
    { key: "registrations", title: t.admin.analytics.registrations },
    { key: "contributors", title: t.admin.analytics.contributors },
    { key: "posts", title: t.admin.analytics.posts },
    { key: "replies", title: t.admin.analytics.replies },
  ] as const;

  return (
    <>
      <AdminHeader
        title={t.admin.analytics.title}
        subtitle={t.admin.analytics.subtitle}
        action={
          <nav aria-label={t.admin.overview.period} className="inline-flex rounded-full border border-border bg-surface p-1">
            {PERIODS.map((d) => (
              <Link
                key={d}
                href={d === 30 ? "/admin/analytics" : `/admin/analytics?days=${d}`}
                aria-current={d === days ? "true" : undefined}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs transition-colors",
                  d === days ? "bg-primary-strong font-medium text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {periodLabel[d]}
              </Link>
            ))}
          </nav>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {measures.map((m) => (
          <ActivityChart key={m.key} title={m.title} locale={locale} points={series.map((p) => ({ day: p.day, value: p[m.key] }))} />
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t.admin.analytics.note}</p>

      <Panel className="mt-6">
        <details>
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-primary-text">{t.admin.analytics.tableCaption}</summary>
          <div className="max-h-96 overflow-auto border-t border-border">
            <table className="w-full text-sm tabular-nums">
              <caption className="sr-only">{t.admin.analytics.tableCaption}</caption>
              <thead className="sticky top-0 bg-surface text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left font-medium">{t.admin.analytics.date}</th>
                  {measures.map((m) => (
                    <th key={m.key} scope="col" className="px-4 py-2 text-right font-medium">{m.title}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...series].reverse().map((p) => (
                  <tr key={p.day}>
                    <th scope="row" className="px-4 py-2 text-left font-normal">
                      {formatDate(`${p.day}T12:00:00Z`, locale, { dateStyle: "medium", timeZone: "UTC" })}
                    </th>
                    {measures.map((m) => (
                      <td key={m.key} className="px-4 py-2 text-right">{p[m.key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Panel>
    </>
  );
}
