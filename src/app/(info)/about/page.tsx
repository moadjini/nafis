import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { LogoMark } from "@/components/brand";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.pages.about.title };
}

export default async function AboutPage() {
  const { t } = await getI18n();
  return (
    <article>
      <LogoMark className="size-12" />
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{t.pages.about.title}</h1>
      <p lang="so" className="mt-2 text-lg text-primary-text">
        {t.brand.tagline}
      </p>
      <div className="mt-8 space-y-5 text-lg leading-relaxed text-muted-foreground">
        {t.pages.about.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </article>
  );
}
