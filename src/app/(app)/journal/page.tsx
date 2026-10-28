import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Lock, Plus } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getJournalEntries } from "@/lib/data";
import { formatDate } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.journal.title };
}

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const [, { t, locale }, { month }] = await Promise.all([requireProfile(), getI18n(), searchParams]);
  const entries = await getJournalEntries();

  // Month keys like "2026-10", newest first.
  const months = [...new Set(entries.map((e) => e.created_at.slice(0, 7)))];
  const selected = month && months.includes(month) ? month : null;
  const shown = selected ? entries.filter((e) => e.created_at.startsWith(selected)) : entries;

  const groups = new Map<string, typeof entries>();
  for (const entry of shown) {
    const key = entry.created_at.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const monthLabel = (key: string) => formatDate(`${key}-15T12:00:00Z`, locale, { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader
        title={t.journal.title}
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5" aria-hidden /> {t.journal.subtitle}
          </span>
        }
        action={
          <Button asChild>
            <Link href="/journal/new">
              <Plus aria-hidden /> {t.journal.new}
            </Link>
          </Button>
        }
      />

      {entries.length === 0 ? (
        <EmptyState icon={BookOpen} title={t.journal.empty} body={t.journal.emptyBody} />
      ) : (
        <>
          {months.length > 1 ? (
            <nav aria-label={t.journal.filterMonth} className="-mx-1 mb-6 flex gap-1.5 overflow-x-auto px-1 pb-1">
              <MonthLink href="/journal" active={!selected} label={t.journal.allMonths} />
              {months.map((m) => (
                <MonthLink key={m} href={`/journal?month=${m}`} active={selected === m} label={monthLabel(m)} />
              ))}
            </nav>
          ) : null}

          <div className="space-y-8">
            {[...groups.entries()].map(([key, list]) => (
              <section key={key} aria-labelledby={`month-${key}`}>
                <h2 id={`month-${key}`} className="mb-3 text-sm font-medium text-muted-foreground">
                  {monthLabel(key)}
                </h2>
                <ul className="space-y-2">
                  {list.map((entry) => (
                    <li key={entry.id}>
                      <Link
                        href={`/journal/${entry.id}`}
                        className="block rounded-2xl border border-border p-4 transition-colors hover:border-primary/40 hover:bg-primary-faint/40"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium">{entry.title || t.journal.titlePlaceholder}</p>
                          {entry.is_draft ? <Badge tone="warning">{t.journal.draft}</Badge> : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{entry.content}</p>
                        <time dateTime={entry.created_at} className="mt-2 block text-xs text-muted-foreground">
                          {formatDate(entry.created_at, locale, { weekday: "long", day: "numeric", month: "long" })}
                        </time>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function MonthLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-full px-4 text-sm transition-colors",
        active ? "bg-primary-strong font-medium text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}
