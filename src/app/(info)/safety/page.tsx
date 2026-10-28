import type { Metadata } from "next";
import { ExternalLink, Phone, ShieldCheck } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.pages.safety.title };
}

export default async function SafetyPage() {
  const { t } = await getI18n();
  const page = t.pages.safety;
  return (
    <article>
      <h1 className="text-3xl font-semibold tracking-tight">{page.title}</h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{page.intro}</p>

      <section className="mt-10 rounded-3xl border-2 border-destructive/30 bg-destructive-soft p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Phone className="size-5 text-destructive" aria-hidden /> {page.emergencyTitle}
        </h2>
        <p className="mt-2 leading-relaxed">{page.emergencyBody}</p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{page.resourcesTitle}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{page.resourcesBody}</p>
        <ul className="mt-4 space-y-3">
          {page.resources.map((r) => (
            <li key={r.url} className="rounded-2xl border border-border p-4">
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-primary-text hover:underline">
                {r.name} <ExternalLink className="size-3.5" aria-hidden />
              </a>
              <p className="mt-1 text-sm text-muted-foreground">{r.detail}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-2xl bg-background-secondary p-4 text-sm leading-relaxed">{page.somaliaNote}</p>
      </section>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="size-5 text-primary-text" aria-hidden /> {page.toolsTitle}
        </h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 leading-relaxed text-muted-foreground marker:text-primary">
          {page.tools.map((tool) => (
            <li key={tool}>{tool}</li>
          ))}
        </ul>
      </section>

      <section className="mt-10 rounded-3xl bg-background-secondary p-6">
        <h2 className="font-semibold">{page.limitsTitle}</h2>
        <p className="mt-2 leading-relaxed text-muted-foreground">{page.limits}</p>
      </section>
    </article>
  );
}
