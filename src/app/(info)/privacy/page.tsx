import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.pages.privacy.title };
}

export default async function PrivacyPage() {
  const { t } = await getI18n();
  const page = t.pages.privacy;
  return (
    <article>
      <h1 className="text-3xl font-semibold tracking-tight">{page.title}</h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{page.intro}</p>
      <div className="mt-10 space-y-8">
        {page.sections.map((section) => (
          <section key={section.title}>
            <h2 className="font-semibold">{section.title}</h2>
            <p className="mt-1.5 leading-relaxed text-muted-foreground">{section.body}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
