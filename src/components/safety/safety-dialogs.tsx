"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { blockUserAction, reportAction } from "@/app/actions/safety";
import { LIMITS, REPORT_REASONS, type ReportReason, type ReportTarget } from "@/lib/constants";
import { errorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n/client";
import { cn, interpolate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form-controls";

export type ReportTargetRef = { type: ReportTarget; id?: string; handle?: string };

export function ReportDialog({
  open,
  onOpenChange,
  target,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ReportTargetRef;
  title?: string;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!reason) return;
    startTransition(async () => {
      const result = await reportAction({
        targetType: target.type,
        targetId: target.id,
        targetHandle: target.handle,
        reason,
        details: details || undefined,
      });
      if (result.ok) {
        toast.success(t.safety.reported);
        onOpenChange(false);
        setReason(null);
        setDetails("");
      } else {
        toast.error(errorMessage(t, result.error));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t.common.close}>
        <DialogHeader title={title ?? t.safety.reportTitle} description={t.safety.reportBody} />
        <fieldset>
          <legend className="text-sm font-medium">{t.safety.reasonLabel}</legend>
          <div className="mt-3 grid gap-2" role="radiogroup">
            {REPORT_REASONS.map((r) => (
              <label
                key={r}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3.5 text-sm transition-colors",
                  reason === r ? "border-primary bg-primary-faint" : "border-border hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="size-4 accent-[var(--primary-strong)]"
                />
                {t.safety.reasons[r]}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={t.safety.detailsLabel} htmlFor="report-details" optional={t.common.optional} className="mt-5">
          <Textarea
            id="report-details"
            value={details}
            maxLength={LIMITS.reportDetails}
            onChange={(e) => setDetails(e.target.value)}
            className="min-h-20"
          />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button onClick={submit} disabled={!reason} loading={pending}>
            {t.safety.submitReport}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BlockDialog({
  open,
  onOpenChange,
  handle,
  name,
  onBlocked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  handle: string;
  name: string;
  onBlocked?: () => void;
}) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await blockUserAction(handle);
      if (result.ok) {
        toast.success(interpolate(t.safety.blocked, { name }));
        onOpenChange(false);
        onBlocked?.();
      } else {
        toast.error(errorMessage(t, result.error));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t.common.close}>
        <DialogHeader title={interpolate(t.safety.blockTitle, { name })} description={t.safety.blockBody} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button variant="destructive" onClick={confirm} loading={pending}>
            {t.safety.block}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  pending,
  destructive = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body?: string;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
  destructive?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t.common.close}>
        <DialogHeader title={title} description={body} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button variant={destructive ? "destructive" : "primary"} onClick={onConfirm} loading={pending}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
