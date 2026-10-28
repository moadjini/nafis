"use client";

import { useState } from "react";
import Image from "next/image";
import { Cloud, Droplet, Leaf, Moon, Mountain, Sprout, Star, Sun, Waves, type LucideIcon } from "lucide-react";
import { avatarUrl } from "@/lib/avatar-url";
import type { AvatarKey } from "@/lib/constants";
import { cn } from "@/lib/utils";

const ICONS: Record<Exclude<AvatarKey, "initials">, LucideIcon> = {
  leaf: Leaf,
  sprout: Sprout,
  wave: Waves,
  sun: Sun,
  moon: Moon,
  cloud: Cloud,
  drop: Droplet,
  stone: Mountain,
  star: Star,
};

const TONES: Record<AvatarKey, string> = {
  leaf: "bg-[#dcfce7] text-[#166534] dark:bg-[#1c4a2d] dark:text-[#bbf7d0]",
  sprout: "bg-[#ecfdf3] text-[#15803d] dark:bg-[#183d27] dark:text-[#86efac]",
  wave: "bg-[#e0f2ec] text-[#14614a] dark:bg-[#173c33] dark:text-[#a7f3d0]",
  sun: "bg-[#f3f9e8] text-[#4d6b1d] dark:bg-[#2e3a1a] dark:text-[#d9f99d]",
  moon: "bg-[#eef3ef] text-[#2f4a37] dark:bg-[#243329] dark:text-[#d1e7d6]",
  cloud: "bg-[#f0fdf4] text-[#166534] dark:bg-[#1a3324] dark:text-[#bbf7d0]",
  drop: "bg-[#e3f4ee] text-[#0f6b4f] dark:bg-[#163a30] dark:text-[#99f6d0]",
  stone: "bg-[#eceeea] text-[#3f4b42] dark:bg-[#2a302b] dark:text-[#d6ddd7]",
  star: "bg-[#e7f6d9] text-[#3f6212] dark:bg-[#2b3d19] dark:text-[#d9f99d]",
  initials: "bg-[#15803d] text-white dark:bg-[#15803d] dark:text-white",
};

/** Pixel sizes: xs 24 · sm 32 · md 40 · lg 56 · xl 80 · 2xl 112 */
const SIZES = {
  xs: { box: "size-6 text-[0.6rem] [&_svg]:size-3.5", px: 24 },
  sm: { box: "size-8 text-[0.7rem] [&_svg]:size-4", px: 32 },
  md: { box: "size-10 text-xs [&_svg]:size-5", px: 40 },
  lg: { box: "size-14 text-base [&_svg]:size-7", px: 56 },
  xl: { box: "size-20 text-xl [&_svg]:size-9", px: 80 },
  "2xl": { box: "size-28 text-2xl [&_svg]:size-12", px: 112 },
} as const;

export type AvatarSize = keyof typeof SIZES;

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]![0]}${parts[1]![0]}` : (parts[0] ?? "?").slice(0, 2)).toUpperCase();
}

/**
 * Circular avatar. Shows the processed profile picture when there is one, and
 * falls back to the abstract avatar while it loads or if it fails to load.
 * Decorative: the name next to it carries the meaning.
 */
export function Avatar({
  avatarKey,
  avatarPath,
  name,
  size = "md",
  className,
}: {
  avatarKey: AvatarKey | string | null | undefined;
  avatarPath?: string | null;
  name: string;
  size?: AvatarSize;
  className?: string;
}) {
  const key = (avatarKey && avatarKey in TONES ? avatarKey : "leaf") as AvatarKey;
  const url = avatarUrl(avatarPath);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const showImage = Boolean(url) && failedUrl !== url;
  const Icon = key === "initials" ? null : ICONS[key];
  const { box, px } = SIZES[size];

  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold",
        TONES[key],
        box,
        className,
      )}
    >
      {Icon ? <Icon strokeWidth={1.7} /> : initialsOf(name)}
      {showImage ? (
        <Image
          src={url!}
          alt=""
          width={px}
          height={px}
          unoptimized
          loading="lazy"
          onLoad={() => setLoadedUrl(url)}
          onError={() => setFailedUrl(url)}
          className={cn(
            "absolute inset-0 size-full rounded-full bg-muted object-cover ring-1 ring-black/5 transition-opacity duration-200 dark:ring-white/10",
            loadedUrl === url ? "opacity-100" : "opacity-0",
          )}
        />
      ) : null}
    </span>
  );
}
