"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { boostPostAction, setBonusLikesAction } from "@/app/actions/admin";
import { errorMessage } from "@/lib/errors";
import { useAdminI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";

/** Quick removal from the promotions list (each call is audited in SQL). */
export function PromotionActions({ postId, boosted, bonusLikes }: { postId: string; boosted: boolean; bonusLikes: number }) {
  const { t } = useAdminI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(kind: "boost" | "likes") {
    startTransition(async () => {
      const result = kind === "boost" ? await boostPostAction({ postId, hours: 0 }) : await setBonusLikesAction({ postId, count: 0 });
      if (result.ok) {
        toast.success(kind === "boost" ? t.promote.unboosted : t.promote.likesSaved);
        router.refresh();
      } else toast.error(errorMessage(t, result.error));
    });
  }

  return (
    <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch">
      {boosted ? (
        <Button size="sm" variant="outline" onClick={() => run("boost")} disabled={pending}>
          {t.promote.removeBoost}
        </Button>
      ) : null}
      {bonusLikes > 0 ? (
        <Button size="sm" variant="outline" onClick={() => run("likes")} disabled={pending}>
          {t.promote.removeLikes}
        </Button>
      ) : null}
    </div>
  );
}
