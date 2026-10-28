"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ear, Flag, MoreHorizontal, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { unblockUserAction } from "@/app/actions/safety";
import { errorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BlockDialog, ReportDialog } from "@/components/safety/safety-dialogs";

export function ProfileActions({
  handle,
  name,
  blocked,
  listening,
}: {
  handle: string;
  name: string;
  blocked: boolean;
  listening: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [dialog, setDialog] = useState<"report" | "block" | null>(null);
  const [pending, startTransition] = useTransition();

  function unblock() {
    startTransition(async () => {
      const result = await unblockUserAction(handle);
      if (result.ok) {
        toast.success(interpolate(t.settings.unblocked, { name }));
        router.refresh();
      } else toast.error(errorMessage(t, result.error));
    });
  }

  return (
    <div className="flex items-center gap-2">
      {listening && !blocked ? (
        <Button asChild size="sm">
          <Link href={`/listening?view=private&to=${handle}`}>
            <Ear aria-hidden /> {t.profile.requestToTalk}
          </Link>
        </Button>
      ) : null}
      {blocked ? (
        <Button size="sm" variant="outline" onClick={unblock} loading={pending}>
          <UserCheck aria-hidden /> {t.profile.unblock}
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={t.common.more} className="inline-flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted">
          <MoreHorizontal className="size-4" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("report")}>
            <Flag aria-hidden /> {t.profile.report}
          </DropdownMenuItem>
          {!blocked ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setDialog("block")}>
                <UserX aria-hidden /> {interpolate(t.post.blockAuthor, { name })}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ReportDialog open={dialog === "report"} onOpenChange={(o) => setDialog(o ? "report" : null)} target={{ type: "user", handle }} title={t.profile.report} />
      <BlockDialog open={dialog === "block"} onOpenChange={(o) => setDialog(o ? "block" : null)} handle={handle} name={name} onBlocked={() => router.refresh()} />
    </div>
  );
}
