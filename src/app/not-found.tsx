import Link from "next/link";
import { Compass } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo />
      <div className="mt-10 flex size-14 items-center justify-center rounded-full bg-primary-faint">
        <Compass className="size-6 text-primary" aria-hidden />
      </div>
      <h1 className="mt-4 text-2xl font-semibold">{t.errors.notFoundTitle}</h1>
      <p className="mt-2 max-w-sm text-muted-foreground">{t.errors.notFoundBody}</p>
      <Button asChild className="mt-6">
        <Link href="/">{t.errors.goHome}</Link>
      </Button>
    </main>
  );
}
