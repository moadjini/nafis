import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { Notice } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.resetTitle };
}

// Reached from the email link via /auth/callback, which establishes a
// short-lived recovery session before redirecting here.
export default async function ResetPasswordPage() {
  const [{ t }, user] = await Promise.all([getI18n(), getCurrentUser()]);
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t.auth.resetTitle}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{t.auth.resetSubtitle}</p>
      <div className="mt-7">
        {user ? (
          <ResetPasswordForm />
        ) : (
          <div className="space-y-4">
            <Notice tone="danger" title={t.auth.errors.sessionMissing} />
            <Link href="/auth/forgot-password" className="text-sm font-medium text-primary-text hover:underline">
              {t.auth.sendReset}
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
