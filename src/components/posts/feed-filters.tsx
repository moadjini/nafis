"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CONTENT_LANGUAGES, TOPICS } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/form-controls";

export type FilterTab = { value: string; label: string };

/** "Top" (default, engagement-ranked) or "Latest". Keeps the other filters. */
export function FeedSortToggle() {
  const { t } = useI18n();
  const pathname = usePathname();
  const params = useSearchParams();
  const latest = params.get("sort") === "latest";

  function hrefFor(sort: "top" | "latest") {
    const next = new URLSearchParams(params.toString());
    if (sort === "latest") next.set("sort", "latest");
    else next.delete("sort");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const options = [
    { value: "top" as const, label: t.feed.sortTop, active: !latest },
    { value: "latest" as const, label: t.feed.sortLatest, active: latest },
  ];

  return (
    <nav aria-label={t.feed.sortLabel} className="inline-flex rounded-full border border-border bg-surface p-1">
      {options.map((o) => (
        <Link
          key={o.value}
          href={hrefFor(o.value)}
          scroll={false}
          aria-current={o.active ? "true" : undefined}
          className={cn(
            "rounded-full px-3 py-1 text-xs transition-colors",
            o.active ? "bg-primary-soft font-medium text-primary-text" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * URL-driven filters (shareable, back-button friendly). Changing a filter
 * navigates, and the server re-renders the first page.
 */
export function FeedFilters({ tabs, tabParam = "type", showTopic = true, showLanguage = true }: { tabs: FilterTab[]; tabParam?: string; showTopic?: boolean; showLanguage?: boolean }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const activeTab = params.get(tabParam) ?? tabs[0]?.value ?? "";

  function hrefWith(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div className="mb-5 space-y-3" role="search" aria-label={t.feed.filtersLabel}>
      <nav aria-label={t.feed.typeLabel} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {tabs.map((tab) => {
          const active = activeTab === tab.value;
          return (
            <Link
              key={tab.value}
              href={hrefWith(tabParam, tab.value === tabs[0]?.value ? null : tab.value)}
              aria-current={active ? "page" : undefined}
              scroll={false}
              className={cn(
                "inline-flex h-9 shrink-0 items-center rounded-full px-4 text-sm transition-colors",
                active ? "bg-primary-strong font-medium text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {showTopic || showLanguage ? (
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {showTopic ? (
            <Select
              aria-label={t.common.topic}
              value={params.get("topic") ?? ""}
              onChange={(e) => router.push(hrefWith("topic", e.target.value || null), { scroll: false })}
              className="h-10 text-sm sm:w-48"
            >
              <option value="">{t.common.anyTopic}</option>
              {TOPICS.map((topic) => (
                <option key={topic} value={topic}>
                  {t.topics[topic]}
                </option>
              ))}
            </Select>
          ) : null}
          {showLanguage ? (
            <Select
              aria-label={t.common.language}
              value={params.get("lang") ?? ""}
              onChange={(e) => router.push(hrefWith("lang", e.target.value || null), { scroll: false })}
              className="h-10 text-sm sm:w-44"
            >
              <option value="">{t.common.anyLanguage}</option>
              {CONTENT_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {t.languages[code]}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
