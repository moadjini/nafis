"use client";

import { useState, useTransition } from "react";
import { Popover } from "radix-ui";
import { SmilePlus } from "lucide-react";
import { toast } from "sonner";
import { setReactionAction } from "@/app/actions/community";
import { REACTIONS, REACTION_EMOJI, type ReactionKey } from "@/lib/constants";
import { errorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n/client";
import type { ReactionCounts } from "@/lib/types";
import { cn, interpolate } from "@/lib/utils";

type Props = {
  targetType: "post" | "reply";
  targetId: string;
  initialCounts: ReactionCounts;
  initialMine: ReactionKey | null;
  disabled?: boolean;
  compact?: boolean;
};

function applyChange(counts: ReactionCounts, from: ReactionKey | null, to: ReactionKey | null): ReactionCounts {
  const next = { ...counts };
  if (from) next[from] = Math.max(0, (next[from] ?? 0) - 1);
  if (to) next[to] = (next[to] ?? 0) + 1;
  return next;
}

/**
 * One reaction per person per post/reply. Updates optimistically, then
 * replaces local state with the counts persisted in the database (or rolls
 * back on failure).
 */
export function ReactionBar({ targetType, targetId, initialCounts, initialMine, disabled, compact }: Props) {
  const { t } = useI18n();
  const [counts, setCounts] = useState<ReactionCounts>(initialCounts ?? {});
  const [mine, setMine] = useState<ReactionKey | null>(initialMine);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function choose(next: ReactionKey | null) {
    setOpen(false);
    if (disabled || pending) return;
    const previous = { counts, mine };
    const target = next === mine ? null : next;
    setCounts(applyChange(counts, mine, target));
    setMine(target);

    startTransition(async () => {
      const result = await setReactionAction({ targetType, targetId, reaction: target });
      if (result.ok) {
        setCounts(result.data.reactions);
        setMine(result.data.my_reaction);
      } else {
        setCounts(previous.counts);
        setMine(previous.mine);
        toast.error(errorMessage(t, result.error));
      }
    });
  }

  const visible = REACTIONS.filter((r) => (counts[r.key] ?? 0) > 0);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((r) => {
        const selected = mine === r.key;
        const count = counts[r.key] ?? 0;
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => choose(r.key)}
            disabled={disabled}
            aria-pressed={selected}
            aria-label={interpolate(t.reactions.count, { label: t.reactions[r.key], count })}
            title={t.reactions[r.key]}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border transition-colors disabled:opacity-60",
              compact ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm",
              selected
                ? "border-primary/60 bg-primary-faint font-medium text-primary-text"
                : "border-border bg-surface text-foreground hover:border-primary/40",
            )}
          >
            <span aria-hidden>{r.emoji}</span>
            <span className="tabular-nums">{count}</span>
          </button>
        );
      })}

      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={mine ? interpolate(t.reactions.yours, { label: t.reactions[mine] }) : t.reactions.open}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-full text-muted-foreground transition-colors hover:bg-primary-faint hover:text-primary-text disabled:opacity-50",
              compact ? "size-8" : "size-9",
            )}
          >
            <SmilePlus className="size-[1.1rem]" aria-hidden />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="top"
            align="start"
            sideOffset={8}
            className="z-50 rounded-full border border-border bg-surface p-1.5 shadow-float"
          >
            <div role="group" aria-label={t.reactions.open} className="flex items-center gap-0.5">
              {REACTIONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => choose(r.key)}
                  aria-pressed={mine === r.key}
                  aria-label={t.reactions[r.key]}
                  title={t.reactions[r.key]}
                  className={cn(
                    "flex size-11 items-center justify-center rounded-full text-[1.35rem] transition-transform hover:scale-110 hover:bg-primary-faint motion-reduce:hover:scale-100",
                    mine === r.key && "bg-primary-soft",
                  )}
                >
                  <span aria-hidden>{REACTION_EMOJI[r.key]}</span>
                </button>
              ))}
            </div>
            {mine ? (
              <button
                type="button"
                onClick={() => choose(null)}
                className="mt-1 w-full rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              >
                {t.reactions.remove}
              </button>
            ) : null}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
