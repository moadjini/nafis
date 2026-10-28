"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { boostPostAction, setBonusLikesAction } from "@/app/actions/admin";
import { LIMITS, PROMOTION } from "@/lib/constants";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import type { PostPromotion } from "@/lib/types";
import { interpolate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";

export type PromoteMode = "boost" | "likes";

/**
 * Super Admin controls for one post. The UI is only shown to Super Admins;
 * admin_boost_post / admin_set_bonus_likes re-check the role and audit.
 */
export function PromotePostDialog({
  postId,
  promotion,
  mode,
  onClose,
}: {
  postId: string;
  promotion: PostPromotion;
  mode: PromoteMode;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [hours, setHours] = useState<number>(PROMOTION.boostOptions[1]);
  const [likes, setLikes] = useState(String(promotion.bonus_likes || ""));
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const boostedUntil = promotion.boosted_until;

  function finish(message: string) {
    toast.success(message);
    onClose();
    router.refresh();
  }

  function saveBoost(nextHours: number) {
    startTransition(async () => {
      const result = await boostPostAction({ postId, hours: nextHours, reason: reason.trim() || undefined });
      if (result.ok) finish(nextHours === 0 ? t.promote.unboosted : t.promote.boosted);
      else toast.error(errorMessage(t, result.error));
    });
  }

  function saveLikes() {
    const count = Math.min(Math.max(0, Math.floor(Number(likes) || 0)), PROMOTION.maxBonusLikes);
    startTransition(async () => {
      const result = await setBonusLikesAction({ postId, count, reason: reason.trim() || undefined });
      if (result.ok) finish(t.promote.likesSaved);
      else toast.error(errorMessage(t, result.error));
    });
  }

  const hourLabels: Record<number, string> = { 6: t.promote.hours.h6, 24: t.promote.hours.h24, 72: t.promote.hours.h72, 168: t.promote.hours.h168 };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t.common.close}>
        {mode === "boost" ? (
          <DialogHeader
            title={t.promote.boostTitle}
            description={
              <>
                {t.promote.boostBody}
                {boostedUntil ? (
                  <span className="mt-2 block font-medium text-primary-text">
                    {interpolate(t.promote.boostedUntil, { date: formatDate(boostedUntil, locale, { dateStyle: "medium", timeStyle: "short" }) })}
                  </span>
                ) : null}
              </>
            }
          />
        ) : (
          <DialogHeader
            title={t.promote.likesTitle}
            description={
              <>
                {t.promote.likesBody}
                <span className="mt-2 block font-medium text-primary-text">{interpolate(t.promote.currentLikes, { count: promotion.bonus_likes })}</span>
              </>
            }
          />
        )}
        <div className="space-y-4">
          {mode === "boost" ? (
            <Field label={t.promote.boostFor} htmlFor="boost-hours">
              <Select id="boost-hours" value={hours} onChange={(e) => setHours(Number(e.target.value))} className="h-11">
                {PROMOTION.boostOptions.map((h) => (
                  <option key={h} value={h}>
                    {hourLabels[h]}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label={t.promote.likesLabel} htmlFor="bonus-likes">
              <Input
                id="bonus-likes"
                type="number"
                inputMode="numeric"
                min={0}
                max={PROMOTION.maxBonusLikes}
                value={likes}
                onChange={(e) => setLikes(e.target.value)}
                className="h-11 w-36"
              />
            </Field>
          )}
          <Field label={t.promote.reason} htmlFor="promote-reason">
            <Textarea id="promote-reason" value={reason} maxLength={LIMITS.moderationNote} onChange={(e) => setReason(e.target.value)} className="min-h-20" />
          </Field>
        </div>
        <DialogFooter>
          {mode === "boost" && boostedUntil ? (
            <Button variant="ghost" onClick={() => saveBoost(0)} disabled={pending} className="sm:mr-auto">
              {t.promote.removeBoost}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t.common.cancel}
          </Button>
          <Button onClick={() => (mode === "boost" ? saveBoost(hours) : saveLikes())} loading={pending}>
            {mode === "boost" ? t.promote.boost : t.promote.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
