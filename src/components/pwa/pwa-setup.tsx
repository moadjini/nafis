"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/push/client";

/**
 * Captures the browser's install offer as early as possible (it can fire
 * before React hydrates) so the app can show its own prompt later.
 */
export const installCaptureScript = `window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__nafisInstall=e;window.dispatchEvent(new Event('nafis:installable'))});window.addEventListener('appinstalled',function(){window.__nafisInstall=null});`;

/** Registers the service worker (offline page + push) on every page. */
export function PwaSetup() {
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  return null;
}
