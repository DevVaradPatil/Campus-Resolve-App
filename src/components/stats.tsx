"use client";

import clsx from "clsx";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { formatDay } from "@/lib/format";

/** "16 Oct – 22 Oct, last 7 days". Every stat block names its range (PRD §7.4). */
export function RangeLabel({ range }: { range: { from: string; to: string; days: number } }) {
  return (
    <span>
      {formatDay(range.from)} – {formatDay(range.to)}, last {range.days} days
    </span>
  );
}

export function RangePicker({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Reporting period"
      className="inline-flex rounded-control border border-line-strong p-0.5"
    >
      {[7, 30, 90].map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={value === d}
          onClick={() => onChange(d)}
          className={clsx(
            "h-10 min-w-14 rounded-[8px] px-3 text-sm font-semibold",
            value === d ? "bg-ink text-on-ink" : "text-ink hover:bg-ink-soft",
          )}
        >
          {d} days
        </button>
      ))}
    </div>
  );
}

const pct = (r: number | null) => (r === null ? "–" : `${Math.round(r * 100)}%`);

/**
 * One headline number with the counts behind it, and the change from the previous period said
 * in words as well as an arrow (never color alone).
 */
export function StatTile({
  label,
  value,
  detail,
  change,
}: {
  label: string;
  value: string;
  detail?: string;
  /** Signed change vs the previous period, already formatted ("+12 pts", "−3"). */
  change?: { text: string; direction: "up" | "down" | "same" } | null;
}) {
  const Icon =
    change?.direction === "up" ? ArrowUp : change?.direction === "down" ? ArrowDown : Minus;
  return (
    <div className="flex flex-col gap-1 rounded-control border border-rule bg-sheet p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {detail && <p className="text-sm text-muted tabular-nums">{detail}</p>}
      {change && (
        <p className="inline-flex items-center gap-1 text-xs text-muted tabular-nums">
          <Icon aria-hidden className="size-3.5" />
          {change.text} vs previous period
        </p>
      )}
    </div>
  );
}

/** Rate tile: "62%" with "31 of 50", and the change in percentage points. */
export function RateTile({
  label,
  now,
  before,
  of,
}: {
  label: string;
  now: { part: number; whole: number; rate: number | null };
  before?: { rate: number | null } | null;
  /** e.g. "resolved" → "31 of 50 resolved" */
  of: string;
}) {
  const delta =
    before && now.rate !== null && before.rate !== null
      ? Math.round((now.rate - before.rate) * 100)
      : null;
  return (
    <StatTile
      label={label}
      value={pct(now.rate)}
      detail={now.whole ? `${now.part} of ${now.whole} ${of}` : "No data in this period"}
      change={
        delta === null
          ? null
          : {
              text: `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)} pts`,
              direction: delta > 0 ? "up" : delta < 0 ? "down" : "same",
            }
      }
    />
  );
}

/**
 * Horizontal bars for one measure across categories: a single hue (magnitude, not identity),
 * sorted, each row labelled with its count. The list itself is the table view.
 */
export function BarList({
  label,
  rows,
  empty = "Nothing in this period.",
}: {
  label: string;
  rows: { key: string; label: string; value: number }[];
  empty?: string;
}) {
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...sorted.map((r) => r.value));
  if (!sorted.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <dl aria-label={label} className="flex flex-col gap-2">
      {sorted.map((r) => (
        <div
          key={r.key}
          className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-3"
        >
          <dt className="truncate text-sm">{r.label}</dt>
          <dd aria-hidden className="h-3">
            <span
              className="block h-full rounded-r-[4px] bg-ink"
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
            />
          </dd>
          <dd className="text-right text-sm font-semibold tabular-nums">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export const hoursLabel = (h: number | null) =>
  h === null
    ? "–"
    : h < 1
      ? "under 1 h"
      : h < 48
        ? `${Math.round(h)} h`
        : `${Math.round((h / 24) * 10) / 10} days`;
