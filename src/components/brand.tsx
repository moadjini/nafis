import Link from "next/link";
import { cn } from "@/lib/utils";

/** The Nafis mark: a leaf carried on a breath. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden focusable="false">
      <rect width="32" height="32" rx="10" fill="var(--primary-strong)" />
      <path
        d="M16 6.5c5.6 2.2 8.2 6.6 7.4 11.6-.6 3.9-3.6 6.9-7.4 7.4-3.8-.5-6.8-3.5-7.4-7.4-.8-5 1.8-9.4 7.4-11.6Z"
        fill="#ffffff"
        opacity="0.96"
      />
      <path
        d="M16 10.5v13M16 15.2c1.6-1 2.8-1.3 3.8-1.2M16 19c-1.6-1-2.8-1.3-3.8-1.2"
        stroke="var(--primary-strong)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function Logo({ href = "/", className, label = "Nafis" }: { href?: string; className?: string; label?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 rounded-xl", className)} aria-label={label}>
      <LogoMark />
      <span className="text-[1.3rem] font-semibold tracking-tight text-foreground">nafis</span>
    </Link>
  );
}

// Avatars live in ./avatar (client component: image loading and fallback).
export { Avatar } from "./avatar";
