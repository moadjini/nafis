"use client";

import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Blue verified badge (a circle with a white check), sized relative to the
 * surrounding text so it lines up with any font size. Verification comes only
 * from the database (account_verifications), never from client state.
 */
export function VerifiedBadge({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label={t.verification.badge}
      className={cn("inline-block size-[1.05em] min-h-3.5 min-w-3.5 shrink-0 align-[-0.15em]", className)}
    >
      <title>{`${t.verification.badge} · ${t.verification.badgeHint}`}</title>
      <circle cx="12" cy="12" r="12" fill="var(--verified)" />
      <path
        d="M7.2 12.4l3.1 3.1 6.5-6.7"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
