import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.pages.guidelines.title };
}

export default async function GuidelinesPage() {
  const { t } = await getI18n();
  const page = t.pages.guidelines;
  return (
    <article>
      <h1 className="text-3xl font-semibold tracking-tight">{page.title}</h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{page.intro}</p>
      <ol className="mt-10 space-y-8">
        {page.sections.map((section, i) => (
          <li key={section.title} className="flex gap-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-faint text-sm font-semibold text-primary-text">
              {i + 1}
            </span>
            <div>
              <h2 className="font-semibold">{section.title}</h2>
              <p className="mt-1.5 leading-relaxed text-muted-foreground">{section.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <section className="mt-12 rounded-3xl bg-background-secondary p-6">
        <h2 className="font-semibold">{page.enforcementTitle}</h2>
        <p className="mt-2 leading-relaxed text-muted-foreground">{page.enforcement}</p>
      </section>
    </article>
  );
}
