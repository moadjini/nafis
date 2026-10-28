import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MessageSquareOff } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getMessages, getSession } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";
import { isUuid } from "@/lib/utils";
import { SessionChat } from "@/components/sessions/session-chat";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.sessions.title };
}

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { t }] = await Promise.all([params, getI18n()]);
  const profile = await requireProfile(`/sessions/${id}`);

  // list_my_sessions only returns sessions the viewer belongs to.
  const session = isUuid(id) ? await getSession(id) : null;
  if (!session) {
    return (
      <EmptyState
        icon={MessageSquareOff}
        title={t.sessions.notFoundTitle}
        body={t.sessions.notFoundBody}
        action={
          <Button asChild variant="secondary">
            <Link href="/listening?view=private">{t.listening.sessionsTitle}</Link>
          </Button>
        }
      />
    );
  }

  const messages = session.status === "requested" ? [] : await getMessages(session.id);

  return (
    <>
      <Link href="/listening?view=private" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary-text">
        <ArrowLeft className="size-4" aria-hidden /> {t.listening.sessionsTitle}
      </Link>
      <SessionChat session={session} initialMessages={messages} viewerId={profile.id} />
    </>
  );
}
