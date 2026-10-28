"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, BadgeX, Ban, ImageOff, MoreHorizontal, ShieldCheck, ShieldPlus, ShieldX, Undo2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { removeAvatarAsModeratorAction, setRoleAction, setVerificationAction } from "@/app/actions/admin";
import { suspendUserAction } from "@/app/actions/safety";
import { LIMITS, MODERATOR_MAX_SUSPENSION_DAYS, type Role } from "@/lib/constants";
import { errorMessage, type ActionResult } from "@/lib/errors";
import { useAdminI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { Notice } from "@/components/ui/misc";

export type ActionTarget = {
  handle: string;
  displayName: string;
  role: Role;
  isVerified: boolean;
  suspendedUntil: string | null;
  hasPicture: boolean;
};

type PendingAction =
  | { kind: "role"; role: Role }
  | { kind: "verify"; verified: boolean }
  | { kind: "suspend" }
  | { kind: "lift" }
  | { kind: "avatar" };

/**
 * Admin actions for one account. Menu items reflect the viewer's role, but the
 * database decides: it rejects anything the caller is not allowed to do.
 */
export function UserActionsMenu({
  target,
  viewerRole,
  viewerHandle,
  showDetailsLink = true,
}: {
  target: ActionTarget;
  viewerRole: "moderator" | "super_admin";
  viewerHandle: string;
  showDetailsLink?: boolean;
}) {
  const { t } = useAdminI18n();
  const [action, setAction] = useState<PendingAction | null>(null);
  const superAdmin = viewerRole === "super_admin";
  const self = target.handle === viewerHandle;
  const canRestrict = !self && target.role !== "super_admin" && (superAdmin || target.role === "member");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${t.admin.users.manage}: ${target.displayName}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-sm hover:border-primary/40 hover:text-primary-text"
        >
          <MoreHorizontal className="size-4" aria-hidden /> <span className="hidden sm:inline">{t.admin.users.manage}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {showDetailsLink && superAdmin ? (
            <>
              <DropdownMenuItem asChild>
                <Link href={`/admin/users/${target.handle}`}>
                  <UserRound aria-hidden /> {t.admin.users.viewDetails}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          {superAdmin ? (
            <>
              {target.role !== "moderator" ? (
                <DropdownMenuItem onSelect={() => setAction({ kind: "role", role: "moderator" })}>
                  <ShieldCheck aria-hidden /> {t.admin.users.makeModerator}
                </DropdownMenuItem>
              ) : null}
              {target.role !== "super_admin" ? (
                <DropdownMenuItem onSelect={() => setAction({ kind: "role", role: "super_admin" })}>
                  <ShieldPlus aria-hidden /> {t.admin.users.makeSuperAdmin}
                </DropdownMenuItem>
              ) : null}
              {target.role !== "member" ? (
                <DropdownMenuItem destructive onSelect={() => setAction({ kind: "role", role: "member" })}>
                  <ShieldX aria-hidden /> {t.admin.users.makeMember}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              {target.isVerified ? (
                <DropdownMenuItem onSelect={() => setAction({ kind: "verify", verified: false })}>
                  <BadgeX aria-hidden /> {t.admin.users.unverify}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => setAction({ kind: "verify", verified: true })}>
                  <BadgeCheck aria-hidden /> {t.admin.users.verify}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
            </>
          ) : null}
          {canRestrict ? (
            target.suspendedUntil ? (
              <DropdownMenuItem onSelect={() => setAction({ kind: "lift" })}>
                <Undo2 aria-hidden /> {t.admin.users.lift}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem destructive onSelect={() => setAction({ kind: "suspend" })}>
                <Ban aria-hidden /> {t.admin.users.suspend}
              </DropdownMenuItem>
            )
          ) : null}
          {target.hasPicture && !self && (superAdmin || target.role === "member") ? (
            <DropdownMenuItem onSelect={() => setAction({ kind: "avatar" })}>
              <ImageOff aria-hidden /> {t.admin.users.removeAvatar}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {action ? <ConfirmActionDialog target={target} action={action} superAdmin={superAdmin} onClose={() => setAction(null)} /> : null}
    </>
  );
}

/** Stand-alone grant/revoke button for the verification page. */
export function VerificationToggle({ target }: { target: ActionTarget }) {
  const { t } = useAdminI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant={target.isVerified ? "outline" : "secondary"} onClick={() => setOpen(true)}>
        {target.isVerified ? <BadgeX aria-hidden /> : <BadgeCheck aria-hidden />}
        {target.isVerified ? t.admin.users.unverify : t.admin.users.verify}
      </Button>
      {open ? (
        <ConfirmActionDialog target={target} action={{ kind: "verify", verified: !target.isVerified }} superAdmin onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

/** Lift-suspension button for the moderation center's restrictions list. */
export function LiftSuspensionButton({ target, superAdmin }: { target: ActionTarget; superAdmin: boolean }) {
  const { t } = useAdminI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Undo2 aria-hidden /> {t.admin.users.lift}
      </Button>
      {open ? <ConfirmActionDialog target={target} action={{ kind: "lift" }} superAdmin={superAdmin} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ConfirmActionDialog({
  target,
  action,
  superAdmin,
  onClose,
}: {
  target: ActionTarget;
  action: PendingAction;
  superAdmin: boolean;
  onClose: () => void;
}) {
  const { t } = useAdminI18n();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(7);
  const [pending, startTransition] = useTransition();
  const name = target.displayName;
  const maxDays = superAdmin ? 3650 : MODERATOR_MAX_SUSPENSION_DAYS;

  const copy = (() => {
    switch (action.kind) {
      case "role":
        return {
          title: interpolate(t.admin.confirm.roleTitle, { name, role: t.roles[action.role] }),
          body: t.admin.confirm.roleBody,
          confirm: t.common.confirm,
          destructive: action.role === "member",
        };
      case "verify":
        return action.verified
          ? { title: interpolate(t.admin.confirm.verifyTitle, { name }), body: t.admin.confirm.verifyBody, confirm: t.admin.users.verify, destructive: false }
          : { title: interpolate(t.admin.confirm.unverifyTitle, { name }), body: t.admin.confirm.unverifyBody, confirm: t.admin.users.unverify, destructive: true };
      case "suspend":
        return { title: interpolate(t.admin.confirm.suspendTitle, { name }), body: t.admin.confirm.suspendBody, confirm: t.admin.users.suspend, destructive: true };
      case "lift":
        return { title: interpolate(t.admin.confirm.liftTitle, { name }), body: undefined, confirm: t.admin.users.lift, destructive: false };
      case "avatar":
        return { title: interpolate(t.admin.confirm.removeAvatarTitle, { name }), body: t.admin.confirm.removeAvatarBody, confirm: t.admin.users.removeAvatar, destructive: true };
    }
  })();

  function run() {
    const why = reason.trim() || undefined;
    startTransition(async () => {
      let result: ActionResult<unknown>;
      let done: string;
      switch (action.kind) {
        case "role":
          result = await setRoleAction({ handle: target.handle, role: action.role, reason: why });
          done = t.admin.done.role;
          break;
        case "verify":
          result = await setVerificationAction({ handle: target.handle, verified: action.verified, reason: why });
          done = action.verified ? t.admin.done.verified : t.admin.done.unverified;
          break;
        case "suspend":
          result = await suspendUserAction({ handle: target.handle, days: Math.min(Math.max(1, days), maxDays), reason: why });
          done = t.admin.done.suspended;
          break;
        case "lift":
          result = await suspendUserAction({ handle: target.handle, days: 0, reason: why });
          done = t.admin.done.lifted;
          break;
        case "avatar":
          result = await removeAvatarAsModeratorAction({ handle: target.handle, reason: why });
          done = t.admin.done.avatarRemoved;
          break;
      }
      if (result.ok) {
        toast.success(done);
        onClose();
        router.refresh();
      } else {
        toast.error(errorMessage(t, result.error));
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t.common.close}>
        <DialogHeader title={copy.title} description={copy.body} />
        <div className="space-y-4">
          {action.kind === "role" && action.role === "super_admin" ? (
            <Notice tone="danger">{t.admin.confirm.superAdminWarning}</Notice>
          ) : null}
          {action.kind === "suspend" ? (
            <Field
              label={t.admin.confirm.suspendDays}
              htmlFor="suspend-days"
              hint={superAdmin ? undefined : interpolate(t.admin.confirm.moderatorLimit, { days: MODERATOR_MAX_SUSPENSION_DAYS })}
            >
              <Input
                id="suspend-days"
                type="number"
                min={1}
                max={maxDays}
                value={days}
                onChange={(e) => setDays(Number(e.target.value) || 1)}
                className="h-11 w-28"
              />
            </Field>
          ) : null}
          <Field label={t.admin.reasonLabel} htmlFor="admin-reason">
            <Textarea
              id="admin-reason"
              value={reason}
              maxLength={LIMITS.moderationNote}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-20"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t.common.cancel}
          </Button>
          <Button variant={copy.destructive ? "destructive" : "primary"} onClick={run} loading={pending}>
            {copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
