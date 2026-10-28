import Link from "next/link";
import { LinkIcon } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { Button } from "@/components/ui/button";

export default async function AuthErrorPage() {
  const { t } = await getI18n();
  return (
    <div className="text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary-faint">
        <LinkIcon className="size-6 text-primary" aria-hidden />
      </div>
      <h1 className="mt-4 text-xl font-semibold">{t.auth.callbackErrorTitle}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.auth.callbackErrorBody}</p>
      <div className="mt-6 flex flex-col gap-2">
        <Button asChild>
          <Link href="/auth/sign-in">{t.common.signIn}</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/auth/forgot-password">{t.auth.sendReset}</Link>
        </Button>
      </div>
    </div>
  );
}
