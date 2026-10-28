"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Download, Share, X } from "lucide-react";
import { toast } from "sonner";
import { enablePush, isIos, isStandalone, pushSupport, syncPush } from "@/lib/push/client";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type Card = "install" | "ios" | "push";

declare global {
  interface Window {
    __nafisInstall?: InstallEvent | null;
  }
}

/** Seconds of visible use before offering to install / turn on notifications. */
export const ENGAGED_SECONDS = 12;
const SNOOZE_DAYS = 14;
const ENGAGED_KEY = "nafis:engaged-seconds";
const SHOWN_KEY = "nafis:prompt-shown";
const snoozeKey = (card: "install" | "push") => `nafis:prompt-snoozed:${card}`;

function read(store: "local" | "session", key: string) {
  try {
    return (store === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function write(store: "local" | "session", key: string, value: string) {
  try {
    (store === "local" ? localStorage : sessionStorage).setItem(key, value);
  } catch {
    // Storage may be unavailable (private mode); the prompt then just may reappear.
  }
}

function snooze(card: "install" | "push") {
  write("local", snoozeKey(card), String(Date.now()));
}

function snoozed(card: "install" | "push") {
  const at = Number(read("local", snoozeKey(card)) ?? 0);
  return at > 0 && Date.now() - at < SNOOZE_DAYS * 86_400_000;
}

function nextCard(): Card | null {
  if (!isStandalone() && !snoozed("install")) {
    if (window.__nafisInstall) return "install";
    if (isIos()) return "ios";
  }
  if (pushSupport() === "supported" && Notification.permission === "default" && !snoozed("push")) return "push";
  return null;
}

/**
 * After ~12 seconds of visible use (counted across pages in this tab), offers
 * once per session to install Nafis, then to turn on notifications. Declining
 * hides each offer for two weeks. Permission is only requested from a click.
 */
export function EngagementPrompt({ userId }: { userId: string }) {
  const { t } = useI18n();
  const [card, setCard] = useState<Card | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void syncPush(userId).catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    if (read("session", SHOWN_KEY)) return;
    let seconds = Number(read("session", ENGAGED_KEY) ?? 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      seconds += 1;
      write("session", ENGAGED_KEY, String(seconds));
      if (seconds < ENGAGED_SECONDS) return;
      window.clearInterval(timer);
      const next = nextCard();
      if (next) {
        write("session", SHOWN_KEY, "1");
        setCard(next);
      }
    }, 1000);
    const onInstalled = () => setCard((c) => (c === "install" || c === "ios" ? null : c));
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    if (card === "install" || card === "ios") snooze("install");
    if (card === "push") snooze("push");
    setCard(null);
  }, [card]);

  async function install() {
    const offer = window.__nafisInstall;
    if (!offer) return setCard(null);
    setBusy(true);
    try {
      await offer.prompt();
      const { outcome } = await offer.userChoice;
      window.__nafisInstall = null;
      if (outcome === "accepted") {
        toast.success(t.pwa.installed);
        setCard(pushSupport() === "supported" && Notification.permission === "default" && !snoozed("push") ? "push" : null);
      } else dismiss();
    } finally {
      setBusy(false);
    }
  }

  async function turnOn() {
    setBusy(true);
    const result = await enablePush(userId);
    setBusy(false);
    setCard(null);
    if (result === "enabled") toast.success(t.settings.pushEnabled);
    else if (result === "denied") snooze("push");
    else toast.error(t.settings.pushFailed);
  }

  if (!card) return null;

  const content = {
    install: { icon: Download, title: t.pwa.installTitle, body: t.pwa.installBody, action: t.pwa.install, run: install },
    ios: { icon: Share, title: t.pwa.iosTitle, body: t.pwa.iosBody, action: t.pwa.gotIt, run: dismiss },
    push: { icon: BellRing, title: t.pwa.pushTitle, body: t.pwa.pushBody, action: t.pwa.turnOn, run: turnOn },
  }[card];
  const Icon = content.icon;

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="engagement-title"
      aria-describedby="engagement-body"
      className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-3xl border border-primary/20 bg-surface p-4 shadow-lg md:inset-x-auto md:bottom-6 md:right-6 md:mx-0 md:w-96"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-text">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="engagement-title" className="font-semibold">
            {content.title}
          </h2>
          <p id="engagement-body" className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {content.body}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void content.run()} loading={busy}>
              {content.action}
            </Button>
            {card !== "ios" ? (
              <Button size="sm" variant="ghost" onClick={dismiss} disabled={busy}>
                {t.pwa.notNow}
              </Button>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t.pwa.close}
          className="-mr-1 -mt-1 inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </section>
  );
}
