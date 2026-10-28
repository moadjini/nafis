import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookX } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getJournalEntry } from "@/lib/data";
import { formatDate } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { isUuid } from "@/lib/utils";
import { JournalEditor } from "@/components/journal/journal-editor";
import { EmptyState } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.journal.title };
}

export default async function JournalEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { t, locale }] = await Promise.all([params, getI18n()]);
  await requireProfile(`/journal/${id}`);
  // RLS returns nothing for other people's entries.
  const entry = isUuid(id) ? await getJournalEntry(id) : null;

  return (
    <>
      <Link href="/journal" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary-text">
        <ArrowLeft className="size-4" aria-hidden /> {t.journal.title}
      </Link>
      {entry ? (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {formatDate(entry.created_at, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          <JournalEditor entry={entry} />
        </>
      ) : (
        <EmptyState icon={BookX} title={t.journal.notFound} />
      )}
    </>
  );
}
