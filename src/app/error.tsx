"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CloudOff } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    // Logged to the browser console only; no third-party error tracking.
    console.error(error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-primary-faint">
        <CloudOff className="size-6 text-primary" aria-hidden />
      </div>
      <h1 className="mt-4 text-xl font-semibold">{t.errors.pageTitle}</h1>
      <p className="mt-2 max-w-sm text-muted-foreground">{t.errors.pageBody}</p>
      <div className="mt-6 flex gap-2">
        <Button onClick={reset}>{t.common.retry}</Button>
        <Button asChild variant="ghost">
          <Link href="/home">{t.errors.goHome}</Link>
        </Button>
      </div>
    </div>
  );
}
