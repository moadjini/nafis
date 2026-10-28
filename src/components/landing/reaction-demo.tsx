"use client";

import { useState } from "react";
import { REACTIONS, type ReactionKey } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

// Local-only demonstration for the landing page. Clearly labelled as an
// example; nothing is persisted and the starting counts are illustrative.
const START: Record<ReactionKey, number> = { heart: 12, hug: 8, support: 4, here: 3, peace: 2, care: 5, hear_you: 6 };

export function ReactionDemo() {
  const { t } = useI18n();
  const [mine, setMine] = useState<ReactionKey | null>(null);

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t.reactions.open}>
        {REACTIONS.map((r) => {
          const selected = mine === r.key;
          const count = START[r.key] + (selected ? 1 : 0);
          const label = t.reactions[r.key];
          return (
            <button
              key={r.key}
              type="button"
              aria-pressed={selected}
              aria-label={`${label}: ${count}`}
              onClick={() => setMine(selected ? null : r.key)}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm transition-all",
                selected
                  ? "border-primary bg-primary-faint font-medium text-primary-text"
                  : "border-border bg-surface text-foreground hover:border-primary/40",
              )}
            >
              <span aria-hidden className={cn("text-base transition-transform", selected && "scale-110")}>
                {r.emoji}
              </span>
              <span className="tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t.landing.reactionsTry}</p>
    </div>
  );
}
