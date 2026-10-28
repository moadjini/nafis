"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ExternalLink, Inbox } from "lucide-react";
import { toast } from "sonner";
import { moderateContentAction, suspendUserAction, updateReportAction } from "@/app/actions/safety";
import { errorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n/client";
import type { ModReportRow } from "@/lib/types";
import { cn, interpolate } from "@/lib/utils";
import { AudioPlayer } from "@/components/posts/audio-player";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { Badge, EmptyState } from "@/components/ui/misc";

export function ModerationQueue({ reports, maxSuspensionDays }: { reports: ModReportRow[]; maxSuspensionDays: number }) {
  const { t } = useI18n();
  if (reports.length === 0) return <EmptyState icon={Inbox} title={t.moderation.empty} />;
  return (
    <ul className="space-y-4">
      {reports.map((r) => (
        <li key={r.id}>
          <ReportCard report={r} maxDays={maxSuspensionDays} />
        </li>
      ))}
    </ul>
  );
}

function ReportCard({ report, maxDays }: { report: ModReportRow; maxDays: number }) {
  const { t, relative } = useI18n();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [days, setDays] = useState(7);
  const [pending, startTransition] = useTransition();
  const urgent = report.reason === "self_harm_concern" || report.reason === "threat";
  const contentTarget = report.target_type === "post" || report.target_type === "reply";

  function run(action: () => Promise<{ ok: boolean; error?: Parameters<typeof errorMessage>[1] }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(t.moderation.done);
        router.refresh();
      } else toast.error(errorMessage(t, result.error ?? "generic"));
    });
  }

  const setStatus = (status: "active" | "hidden" | "removed") =>
    run(() =>
      moderateContentAction({ targetType: report.target_type, targetId: report.target_id, status, reason: note || undefined }),
    );
  const setReport = (status: "reviewing" | "resolved" | "dismissed") =>
    run(() => updateReportAction({ reportId: report.id, status, note: note || undefined }));

  return (
    <article className={cn("rounded-3xl border p-5", urgent ? "border-destructive/40" : "border-border")}>
      <header className="flex flex-wrap items-center gap-2">
        {urgent ? <AlertTriangle className="size-4 text-destructive" aria-hidden /> : null}
        <span className="font-medium">{t.safety.reasons[report.reason as keyof typeof t.safety.reasons] ?? report.reason}</span>
        <Badge>{interpolate(t.moderation.target, { type: t.moderation.targetTypes[report.target_type] })}</Badge>
        <Badge tone={report.status === "open" ? "warning" : "neutral"}>{t.moderation.reportStatus[report.status]}</Badge>
        <span className="ml-auto text-xs text-muted-foreground">{relative(report.created_at)}</span>
      </header>

      <dl className="mt-3 space-y-1 text-sm text-muted-foreground">
        {report.target_author_handle ? <div>{interpolate(t.moderation.author, { handle: `@${report.target_author_handle}` })}</div> : null}
        {report.target_status ? (
          <div>{interpolate(t.moderation.statusLabel, { status: t.moderation.contentStatus[report.target_status] })}</div>
        ) : null}
        {report.open_reports_on_target > 1 ? <div>{interpolate(t.moderation.reportsOnTarget, { count: report.open_reports_on_target })}</div> : null}
      </dl>

      {report.target_excerpt ? (
        <blockquote className="prose-nafis mt-3 rounded-2xl bg-background-secondary p-4 text-sm">{report.target_excerpt}</blockquote>
      ) : null}
      {report.target_is_voice && report.target_post_id ? (
        <div className="mt-3">
          <AudioPlayer postId={report.target_post_id} durationSeconds={0} />
        </div>
      ) : null}
      {report.details ? (
        <p className="mt-3 text-sm">
          <span className="font-medium">{t.moderation.details}: </span>
          {report.details}
        </p>
      ) : null}
      {report.target_post_id ? (
        <Link href={`/post/${report.target_post_id}`} target="_blank" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary-text hover:underline">
          {t.moderation.viewPost} <ExternalLink className="size-3.5" aria-hidden />
        </Link>
      ) : null}

      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <label className="block">
          <span className="sr-only">{t.moderation.note}</span>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.moderation.note} className="h-10 text-sm" maxLength={1000} />
        </label>
        <div className="flex flex-wrap gap-2">
          {contentTarget ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setStatus("hidden")} disabled={pending}>
                {t.moderation.hide}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setStatus("removed")} disabled={pending}>
                {t.moderation.remove}
              </Button>
              {report.target_status && report.target_status !== "active" ? (
                <Button size="sm" variant="ghost" onClick={() => setStatus("active")} disabled={pending}>
                  {t.moderation.restore}
                </Button>
              ) : null}
            </>
          ) : null}
          <span className="mx-1 hidden w-px bg-border sm:block" aria-hidden />
          <Button size="sm" variant="ghost" onClick={() => setReport("reviewing")} disabled={pending}>
            {t.moderation.reviewing}
          </Button>
          <Button size="sm" variant="soft" onClick={() => setReport("resolved")} disabled={pending}>
            {t.moderation.resolve}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setReport("dismissed")} disabled={pending}>
            {t.moderation.dismiss}
          </Button>
        </div>
        {report.target_author_handle ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              {t.moderation.suspendDays}
              <Input
                type="number"
                min={1}
                max={maxDays}
                value={days}
                onChange={(e) => setDays(Number(e.target.value) || 1)}
                className="h-9 w-20 text-sm"
              />
            </label>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                run(() => suspendUserAction({ handle: report.target_author_handle, days: Math.min(Math.max(1, days), maxDays), reason: note || undefined }))
              }
              disabled={pending}
            >
              {t.moderation.suspend}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => run(() => suspendUserAction({ handle: report.target_author_handle, days: 0, reason: note || undefined }))}
              disabled={pending}
            >
              {t.moderation.liftSuspension}
            </Button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
