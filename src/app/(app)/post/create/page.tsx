import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { getDrafts } from "@/lib/data";
import { env } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";
import { Composer } from "@/components/composer/composer";
import { PageHeader } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.composer.title };
}

export default async function CreatePostPage({ searchParams }: { searchParams: Promise<{ type?: string; prompt?: string }> }) {
  const [profile, { t }, params, drafts] = await Promise.all([requireProfile(), getI18n(), searchParams, getDrafts()]);
  const prompt = typeof params.prompt === "string" ? params.prompt.slice(0, 200) : null;

  return (
    <>
      <PageHeader title={t.composer.title} subtitle={t.composer.subtitle} />
      <Composer
        initialMode={params.type === "voice" ? "voice" : "text"}
        defaultLanguage={profile.preferred_language}
        maxRecordingSeconds={env.maxRecordingSeconds}
        prompt={prompt}
        draftCount={drafts.length}
      />
    </>
  );
}
