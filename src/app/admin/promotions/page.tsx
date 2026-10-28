import type { Metadata } from "next";
import Link from "next/link";
import { Mic, Rocket } from "lucide-react";
import { isSuperAdmin, requireProfile } from "@/lib/auth";
import { adminListPromotions } from "@/lib/data";
import { formatDate, toAdminDictionary } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { interpolate } from "@/lib/utils";
import { AdminHeader, LoadError, NotAllowed, Panel } from "@/components/admin/admin-ui";
import { PromotionActions } from "@/components/admin/promotion-actions";
import { Badge, EmptyState } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.admin.promotions.title };
}

export default async function PromotionsPage() {
  const [profile, { t: dict, locale }] = await Promise.all([requireProfile("/admin/promotions"), getI18n()]);
  const t = toAdminDictionary(dict);
  if (!isSuperAdmin(profile)) return <NotAllowed t={t} />;

  const result = await adminListPromotions();
  if (!result.ok) return result.error === "not_allowed" ? <NotAllowed t={t} /> : <LoadError t={t} />;
  const rows = result.data;
  const p = t.admin.promotions;
  const date = (value: string) => formatDate(value, locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <>
      <AdminHeader title={p.title} subtitle={p.subtitle} />
      <p className="mb-4 text-sm text-muted-foreground">{p.howTo}</p>
      <Panel>
        {rows.length === 0 ? (
          <EmptyState icon={Rocket} title={p.empty} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.post_id} className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[minmax(0,1fr)_16rem_10.5rem] md:items-center">
                <div className="min-w-0">
                  <Link href={`/post/${row.post_id}`} className="line-clamp-2 font-medium hover:text-primary-text hover:underline">
                    {row.post_type === "voice" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Mic className="size-4" aria-hidden /> {row.excerpt || p.voicePost}
                      </span>
                    ) : (
                      row.excerpt
                    )}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <Link href={`/admin/users/${row.author_handle}`} className="hover:text-primary-text">
                      @{row.author_handle}
                    </Link>
                    {row.status !== "active" ? <> · {p.hidden}</> : null}
                  </p>
                </div>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">{p.boost}</dt>
                  <dd>
                    {row.boosted_until ? (
                      <Badge tone="green">{interpolate(p.until, { date: date(row.boosted_until) })}</Badge>
                    ) : (
                      <span className="text-muted-foreground">{p.notBoosted}</span>
                    )}
                    {row.boosted_until && row.boosted_by_handle ? (
                      <span className="mt-0.5 block truncate text-muted-foreground">{interpolate(p.by, { handle: row.boosted_by_handle })}</span>
                    ) : null}
                  </dd>
                  <dt className="text-muted-foreground">{p.freeLikes}</dt>
                  <dd className="tabular-nums">{row.bonus_likes}</dd>
                  <dt className="text-muted-foreground">{p.realReactions}</dt>
                  <dd className="tabular-nums">{row.real_reactions}</dd>
                  <dt className="text-muted-foreground">{p.replies}</dt>
                  <dd className="tabular-nums">{row.reply_count}</dd>
                </dl>
                <PromotionActions postId={row.post_id} boosted={Boolean(row.boosted_until)} bonusLikes={row.bonus_likes} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
