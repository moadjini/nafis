"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { deleteJournalEntryAction, saveJournalEntryAction } from "@/app/actions/personal";
import { LIMITS } from "@/lib/constants";
import { errorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n/client";
import type { JournalEntry } from "@/lib/types";
import { journalSchema } from "@/lib/validation";
import { interpolate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form-controls";
import { Badge } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/safety/safety-dialogs";

export function JournalEditor({ entry }: { entry: JournalEntry | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm({
    resolver: zodResolver(journalSchema),
    defaultValues: { id: entry?.id, title: entry?.title ?? "", content: entry?.content ?? "", isDraft: entry?.is_draft ?? false },
  });
  const content = useWatch({ control: form.control, name: "content" }) ?? "";

  function save(isDraft: boolean) {
    form.setValue("isDraft", isDraft);
    void form.handleSubmit((values) => {
      startTransition(async () => {
        const result = await saveJournalEntryAction({ ...values, isDraft });
        if (!result.ok) { toast.error(errorMessage(t, result.error)); return; }
        toast.success(isDraft ? t.journal.draftToast : t.journal.savedToast);
        if (!entry) router.replace(`/journal/${result.data.id}`);
        else router.refresh();
      });
    })();
  }

  function remove() {
    if (!entry) return;
    startTransition(async () => {
      const result = await deleteJournalEntryAction(entry.id);
      if (!result.ok) { toast.error(errorMessage(t, result.error)); return; }
      toast.success(t.journal.deleted);
      router.push("/journal");
    });
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
      <Badge tone="green" className="gap-1.5">
        <Lock className="size-3" aria-hidden /> {t.journal.privateBadge}
      </Badge>
      <div>
        <label htmlFor="journal-title" className="sr-only">
          {t.journal.titleLabel}
        </label>
        <Input
          id="journal-title"
          placeholder={t.journal.titlePlaceholder}
          maxLength={LIMITS.journalTitle}
          className="h-14 border-0 bg-transparent px-0 text-xl font-semibold focus-visible:outline-none"
          {...form.register("title")}
        />
      </div>
      <div>
        <label htmlFor="journal-content" className="sr-only">
          {t.journal.contentLabel}
        </label>
        <Textarea
          id="journal-content"
          placeholder={t.journal.contentPlaceholder}
          maxLength={LIMITS.journalContent}
          className="min-h-[50dvh] rounded-3xl bg-background-secondary px-5 py-4 text-base leading-relaxed"
          aria-invalid={Boolean(form.formState.errors.content)}
          {...form.register("content")}
        />
        <p className="mt-2 text-right text-xs tabular-nums text-muted-foreground">
          {interpolate(t.common.characters, { count: content.length, max: LIMITS.journalContent })}
        </p>
        {form.formState.errors.content ? (
          <p role="alert" className="text-sm text-destructive">
            {t.composer.emptyError}
          </p>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{t.journal.shareNote}</p>
      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
        {entry ? (
          <Button type="button" variant="destructive-ghost" onClick={() => setConfirmDelete(true)} disabled={pending}>
            <Trash2 aria-hidden /> {t.journal.delete}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="secondary" onClick={() => save(true)} disabled={pending}>
            {t.journal.saveDraft}
          </Button>
          <Button type="button" onClick={() => save(false)} loading={pending}>
            {t.journal.saveEntry}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t.journal.deleteTitle}
        body={t.journal.deleteBody}
        confirmLabel={t.common.delete}
        onConfirm={remove}
        pending={pending}
      />
    </form>
  );
}
