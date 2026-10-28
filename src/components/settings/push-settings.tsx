"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { disablePush, enablePush, isPushEnabledHere, pushSupport, type PushSupport } from "@/lib/push/client";
import { useI18n } from "@/lib/i18n/client";
import { Switch } from "@/components/ui/switch";

type State = { support: PushSupport; permission: NotificationPermission | null; enabled: boolean };

/** Push notifications for this browser/device only (each device opts in). */
export function PushSettings({ userId }: { userId: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<State | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const support = pushSupport();
    const permission = support === "supported" ? Notification.permission : null;
    void (support === "supported" ? isPushEnabledHere(userId) : Promise.resolve(false)).then((enabled) => {
      if (!cancelled) setState({ support, permission, enabled });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function toggle(next: boolean) {
    if (!state) return;
    setPending(true);
    if (next) {
      const result = await enablePush(userId);
      const permission = Notification.permission;
      setState({ ...state, permission, enabled: result === "enabled" });
      if (result === "enabled") toast.success(t.settings.pushEnabled);
      else if (result === "failed") toast.error(t.settings.pushFailed);
    } else {
      await disablePush();
      setState({ ...state, enabled: false });
      toast.success(t.settings.pushDisabled);
    }
    setPending(false);
  }

  if (!state) return <div className="h-[4.5rem] rounded-2xl border border-border" aria-hidden />;

  const blocked = state.support === "supported" && state.permission === "denied";
  const note =
    state.support === "ios-needs-install"
      ? t.settings.pushIosHint
      : state.support === "unsupported"
        ? t.settings.pushUnsupported
        : blocked
          ? t.settings.pushDenied
          : state.enabled
            ? t.settings.pushOn
            : t.settings.pushOff;

  return (
    <div className="rounded-2xl border border-border p-4">
      <label className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium">{t.settings.pushTitle}</span>
        <Switch
          checked={state.enabled}
          onCheckedChange={(v) => void toggle(v)}
          disabled={pending || state.support !== "supported" || blocked}
          aria-label={t.settings.pushTitle}
        />
      </label>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{note}</p>
    </div>
  );
}
