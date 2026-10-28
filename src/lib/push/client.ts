import { removePushSubscriptionAction, savePushSubscriptionAction } from "@/app/actions/push";
import { env } from "@/lib/env";

// Browser-side push helpers. The device's subscription is tied to the account
// that turned notifications on here; OWNER_KEY remembers which one, so another
// account signing in on the same browser never receives the first one's alerts.
const OWNER_KEY = "nafis:push-owner";
const SYNCED_KEY = "nafis:push-synced";

export type PushSupport = "supported" | "ios-needs-install" | "unsupported";

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function pushSupport(): PushSupport {
  if (typeof window === "undefined" || !env.vapidPublicKey) return "unsupported";
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return "supported";
  // iOS only offers web push to apps added to the Home Screen.
  if (isIos() && !isStandalone()) return "ios-needs-install";
  return "unsupported";
}

function storage(kind: "local" | "session") {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function getOwner() {
  return storage("local")?.getItem(OWNER_KEY) ?? null;
}

function setOwner(userId: string | null) {
  const store = storage("local");
  try {
    if (userId) store?.setItem(OWNER_KEY, userId);
    else store?.removeItem(OWNER_KEY);
  } catch {
    // Storage can be unavailable (private mode); the server copy still works.
  }
}

function keyBytes(base64url: string) {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  } catch {
    return null;
  }
}

async function currentSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

async function subscribeAndSave(userId: string) {
  const registration = (await navigator.serviceWorker.getRegistration()) ?? (await registerServiceWorker());
  if (!registration || !env.vapidPublicKey) return false;
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(env.vapidPublicKey) }));
  const result = await savePushSubscriptionAction(subscription.toJSON());
  if (!result.ok) return false;
  setOwner(userId);
  return true;
}

/** Must be called from a click: asks the browser for permission, then subscribes. */
export async function enablePush(userId: string): Promise<"enabled" | "denied" | "failed"> {
  if (pushSupport() !== "supported") return "failed";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  try {
    return (await subscribeAndSave(userId)) ? "enabled" : "failed";
  } catch {
    return "failed";
  }
}

/** Turns push off for this device (also used when signing out). */
export async function disablePush() {
  try {
    const subscription = await currentSubscription();
    if (subscription) {
      await removePushSubscriptionAction(subscription.endpoint).catch(() => null);
      await subscription.unsubscribe().catch(() => false);
    }
  } finally {
    setOwner(null);
  }
}

export async function isPushEnabledHere(userId: string) {
  if (pushSupport() !== "supported" || Notification.permission !== "granted") return false;
  return Boolean(await currentSubscription()) && getOwner() === userId;
}

/**
 * Keeps this device's subscription tied to the signed-in account: drops a
 * subscription left by another account, and quietly renews this account's
 * subscription if the browser replaced or expired it. Never prompts.
 */
export async function syncPush(userId: string) {
  if (pushSupport() !== "supported") return;
  const subscription = await currentSubscription();
  const owner = getOwner();

  if (owner !== userId) {
    if (subscription) await disablePush();
    return;
  }
  if (Notification.permission !== "granted") {
    await disablePush();
    return;
  }
  const session = storage("session");
  if (subscription && session?.getItem(SYNCED_KEY) === userId) return;
  if (await subscribeAndSave(userId).catch(() => false)) {
    try {
      session?.setItem(SYNCED_KEY, userId);
    } catch {
      // Best effort only.
    }
  }
}
