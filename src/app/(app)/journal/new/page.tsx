import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { JournalEditor } from "@/components/journal/journal-editor";
import { PageHeader } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.journal.newTitle };
}

export default async function NewJournalEntryPage() {
  const [, { t }] = await Promise.all([requireProfile(), getI18n()]);
  return (
    <>
      <PageHeader title={t.journal.newTitle} />
      <JournalEditor entry={null} />
    </>
  );
}
