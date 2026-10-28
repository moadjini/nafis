"use client";

import Link from "next/link";
import { useTransition } from "react";
import { BookOpen, Bookmark, Ear, LifeBuoy, LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { useI18n } from "@/lib/i18n/client";
import { disablePush } from "@/lib/push/client";
import { Avatar } from "@/components/brand";
import { UserName } from "@/components/user-name";
import { LanguageSwitcher } from "@/components/language-switcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Viewer } from "./app-shell";

export function UserMenu({ viewer }: { viewer: Viewer }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t.nav.account}
        className="inline-flex size-10 items-center justify-center rounded-full transition-shadow hover:ring-2 hover:ring-primary/20 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Avatar avatarKey={viewer.avatarKey} avatarPath={viewer.avatarPath} name={viewer.displayName} size="sm" className="size-9" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-3 pb-3">
          <Avatar avatarKey={viewer.avatarKey} avatarPath={viewer.avatarPath} name={viewer.displayName} />
          <span className="min-w-0">
            <UserName name={viewer.displayName} verified={viewer.isVerified} className="flex text-sm" nameClassName="font-medium text-foreground" />
            <span className="block truncate">@{viewer.handle}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/profile/${viewer.handle}`}>
            <UserRound aria-hidden /> {t.nav.profile}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/journal">
            <BookOpen aria-hidden /> {t.nav.journal}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/saved">
            <Bookmark aria-hidden /> {t.nav.saved}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/listening">
            <Ear aria-hidden /> {t.nav.listening}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden /> {t.nav.settings}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/safety">
            <LifeBuoy aria-hidden /> {t.nav.safety}
          </Link>
        </DropdownMenuItem>
        {viewer.isModerator ? (
          <DropdownMenuItem asChild>
            <Link href={viewer.isSuperAdmin ? "/admin" : "/admin/moderation"}>
              <ShieldCheck aria-hidden /> {viewer.isSuperAdmin ? t.nav.admin : t.nav.moderation}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          <LanguageSwitcher className="w-full justify-between" />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            // Stop this device's notifications first: the next person to use
            // this browser should never receive alerts meant for this account.
            startTransition(async () => {
              await disablePush().catch(() => undefined);
              await signOutAction();
            });
          }}
        >
          <LogOut aria-hidden /> {t.nav.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
