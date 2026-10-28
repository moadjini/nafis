"use client";

import { useId, useState } from "react";
import type { Locale } from "@/lib/constants";
import { formatDate } from "@/lib/i18n";
import { useAdminI18n } from "@/lib/i18n/client";
import { cn, interpolate } from "@/lib/utils";

const HEIGHT = 150;
const PAD_TOP = 10;
const PAD_LEFT = 34;
const PAD_BOTTOM = 24;
const WIDTH = 560;

function niceMax(value: number) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value / 4)! * magnitude;
  return Math.ceil(value / step) * step;
}

function compact(n: number) {
  return n >= 1000 ? `${Math.round(n / 100) / 10}K` : String(n);
}

/**
 * One measure over time as a single-series column chart (small multiples:
 * each measure gets its own chart and axis — never two scales on one chart).
 * Hover or arrow keys reveal each day's value; the table view lists them all.
 */
export function ActivityChart({ title, points, locale }: { title: string; points: { day: string; value: number }[]; locale: Locale }) {
  const { t } = useAdminI18n();
  const id = useId();
  const [active, setActive] = useState<number | null>(null);

  const total = points.reduce((sum, p) => sum + p.value, 0);
  const peak = points.reduce((best, p, i) => (p.value > points[best]!.value ? i : best), 0);
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const plotW = WIDTH - PAD_LEFT;
  const plotH = HEIGHT - PAD_BOTTOM - PAD_TOP;
  const slot = plotW / Math.max(1, points.length);
  const barW = Math.max(2, Math.min(24, slot - 2)); // 2px surface gap between bars, <= 24px thick
  const y = (v: number) => PAD_TOP + plotH - (v / max) * plotH;
  const day = (iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
    formatDate(`${iso}T12:00:00Z`, locale, { ...opts, timeZone: "UTC" });

  const activePoint = active !== null ? points[active] : null;

  return (
    <figure className="rounded-2xl border border-border bg-surface p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">
          {interpolate(t.admin.analytics.total, { count: total })}
          {total > 0 ? ` · ${interpolate(t.admin.analytics.peak, { count: points[peak]!.value, date: day(points[peak]!.day) })}` : ""}
        </span>
      </figcaption>

      {total === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t.admin.analytics.empty}</p>
      ) : (
        <div className="relative mt-3">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-auto w-full touch-pan-y outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            role="img"
            aria-label={`${title}: ${interpolate(t.admin.analytics.total, { count: total })}`}
            aria-describedby={`${id}-readout`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              setActive((i) => {
                const current = i ?? points.length - 1;
                return Math.min(points.length - 1, Math.max(0, current + (e.key === "ArrowRight" ? 1 : -1)));
              });
            }}
            onFocus={() => setActive((i) => i ?? points.length - 1)}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
          >
            {/* Recessive hairline grid: baseline, middle, top */}
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={PAD_LEFT} x2={WIDTH} y1={y(max * f)} y2={y(max * f)} stroke="var(--chart-grid)" strokeWidth={1} />
                <text x={PAD_LEFT - 6} y={y(max * f) + 4} textAnchor="end" className="fill-muted-foreground text-[12px]">
                  {compact(max * f)}
                </text>
              </g>
            ))}

            {points.map((p, i) => {
              const x = PAD_LEFT + i * slot + (slot - barW) / 2;
              const top = y(p.value);
              const h = PAD_TOP + plotH - top;
              const r = Math.min(4, barW / 2, h);
              return (
                <g key={p.day} onPointerEnter={() => setActive(i)}>
                  {/* Hit target: the whole column slot, larger than the mark */}
                  <rect x={PAD_LEFT + i * slot} y={PAD_TOP} width={slot} height={plotH} fill="transparent" />
                  {h > 0 ? (
                    <path
                      d={`M${x},${PAD_TOP + plotH} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + barW - r},${top} Q${x + barW},${top} ${x + barW},${top + r} L${x + barW},${PAD_TOP + plotH} Z`}
                      fill="var(--chart-mark)"
                      opacity={active === null || active === i ? 1 : 0.45}
                    />
                  ) : null}
                </g>
              );
            })}

            {[0, Math.floor((points.length - 1) / 2), points.length - 1].map((i) => (
              <text
                key={i}
                x={PAD_LEFT + i * slot + slot / 2}
                y={HEIGHT - 6}
                textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
                className="fill-muted-foreground text-[12px]"
              >
                {day(points[i]!.day)}
              </text>
            ))}
          </svg>

          <p
            id={`${id}-readout`}
            aria-live="polite"
            className={cn("pointer-events-none absolute right-0 top-0 rounded-lg px-2 py-0.5 text-xs", activePoint && "bg-surface shadow-soft ring-1 ring-border")}
          >
            {activePoint ? (
              <>
                <strong className="font-semibold tabular-nums text-foreground">{activePoint.value}</strong>{" "}
                <span className="text-muted-foreground">{day(activePoint.day, { weekday: "short", day: "numeric", month: "short" })}</span>
              </>
            ) : null}
          </p>
        </div>
      )}
    </figure>
  );
}
