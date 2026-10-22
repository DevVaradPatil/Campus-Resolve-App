"use client";

import { useCallback, useRef, useState } from "react";
import { DataTable } from "@/components/ui/surface";
import { formatDay } from "@/lib/format";

// Small hand-built SVG charts (dataviz rules: thin marks, one axis, recessive grid, legend for
// two series plus a direct label, hover tooltip, table view). Colours are the validated
// `series-1`/`series-2` tokens; text always uses text tokens, never the series colour.

/** Width of the element the returned callback ref is attached to; re-measures on resize and
 * whenever the element is (re)mounted, e.g. switching back from the table view. */
function useWidth() {
  const [width, setWidth] = useState(0);
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    ro.current?.disconnect();
    if (!el) return;
    // Measure now too: the observer may not fire until the page is laid out (hidden tabs).
    setWidth(Math.floor(el.getBoundingClientRect().width));
    ro.current = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.current.observe(el);
  }, []);
  return [ref, width] as const;
}

const niceMax = (v: number) => {
  if (v <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / step) * step;
};

export type DayPoint = { day: string; created: number; resolved: number };

/** Reported (columns) and resolved (line) per day. */
export function TrendChart({ data }: { data: DayPoint[] }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const H = 220;
  const pad = { top: 12, right: 64, bottom: 28, left: 32 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = H - pad.top - pad.bottom;
  const max = niceMax(Math.max(1, ...data.map((d) => Math.max(d.created, d.resolved))));
  const band = data.length ? innerW / data.length : 0;
  const x = (i: number) => pad.left + i * band + band / 2;
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const colW = Math.max(1, Math.min(18, band - 2)); // 2px surface gap between columns
  const ticks = [0, max / 2, max];
  // About one date label per 64px, so labels never collide on a phone.
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 64))));
  const totals = data.reduce(
    (a, d) => ({ created: a.created + d.created, resolved: a.resolved + d.resolved }),
    { created: 0, resolved: 0 },
  );
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.resolved)}`).join("");
  const last = data[data.length - 1];
  const h = hover === null ? null : data[hover];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Legend">
          <li className="inline-flex items-center gap-2">
            <span aria-hidden className="size-3 rounded-[3px] bg-series-1" />
            Reported <span className="font-semibold tabular-nums">{totals.created}</span>
          </li>
          <li className="inline-flex items-center gap-2">
            <span aria-hidden className="h-0.5 w-4 rounded-full bg-series-2" />
            Resolved <span className="font-semibold tabular-nums">{totals.resolved}</span>
          </li>
        </ul>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          className="min-h-11 text-sm text-ink underline underline-offset-2"
        >
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-80 overflow-y-auto rounded-control border border-rule">
          <DataTable
            caption="Complaints reported and resolved per day"
            rowKey={(r) => r.day}
            rows={[...data].reverse()}
            columns={[
              { key: "day", header: "Day", cell: (r) => formatDay(r.day) },
              { key: "created", header: "Reported", cell: (r) => r.created, numeric: true },
              { key: "resolved", header: "Resolved", cell: (r) => r.resolved, numeric: true },
            ]}
          />
        </div>
      ) : (
        <div ref={ref} className="relative w-full">
          {width > 0 && (
            <svg
              width={width}
              height={H}
              role="img"
              aria-label={`Complaints per day: ${totals.created} reported and ${totals.resolved} resolved over ${data.length} days. Use "Show as table" for the daily numbers.`}
              onMouseLeave={() => setHover(null)}
            >
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={pad.left}
                    x2={pad.left + innerW}
                    y1={y(t)}
                    y2={y(t)}
                    className="stroke-rule"
                    strokeWidth={1}
                  />
                  <text
                    x={pad.left - 8}
                    y={y(t)}
                    dy="0.32em"
                    textAnchor="end"
                    className="fill-muted text-[11px] tabular-nums"
                  >
                    {Math.round(t)}
                  </text>
                </g>
              ))}
              {data.map((d, i) =>
                d.created ? (
                  <path
                    key={d.day}
                    className="fill-series-1"
                    opacity={hover === null || hover === i ? 1 : 0.45}
                    // Column with a 4px rounded top, anchored to the baseline.
                    d={(() => {
                      const x0 = x(i) - colW / 2;
                      const top = y(d.created);
                      const r = Math.min(4, colW / 2, y(0) - top);
                      return `M${x0},${y(0)}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + colW - r}Q${x0 + colW},${top} ${x0 + colW},${top + r}V${y(0)}Z`;
                    })()}
                  />
                ) : null,
              )}
              <path
                d={line}
                fill="none"
                className="stroke-series-2"
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {last && (
                <text
                  x={pad.left + innerW + 6}
                  y={y(last.resolved)}
                  dy="0.32em"
                  className="fill-muted text-[11px]"
                >
                  Resolved
                </text>
              )}
              {data.map((d, i) =>
                (data.length - 1 - i) % labelEvery === 0 ? (
                  <text
                    key={d.day}
                    x={x(i)}
                    y={H - 8}
                    textAnchor="middle"
                    className="fill-muted text-[11px]"
                  >
                    {formatDay(d.day)}
                  </text>
                ) : null,
              )}
              {h && hover !== null && (
                <>
                  <line
                    x1={x(hover)}
                    x2={x(hover)}
                    y1={pad.top}
                    y2={y(0)}
                    className="stroke-line-strong"
                    strokeWidth={1}
                  />
                  <circle
                    cx={x(hover)}
                    cy={y(h.resolved)}
                    r={4}
                    className="fill-series-2 stroke-sheet"
                    strokeWidth={2}
                  />
                </>
              )}
              {/* Hit areas wider than the marks: the whole day band. */}
              {data.map((d, i) => (
                <rect
                  key={d.day}
                  x={pad.left + i * band}
                  y={pad.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onTouchStart={() => setHover(i)}
                />
              ))}
            </svg>
          )}
          {h && hover !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 rounded-control border border-rule bg-sheet px-3 py-2 text-sm shadow-overlay"
              style={{
                left: Math.min(Math.max(0, x(hover) - 70), Math.max(0, width - 150)),
              }}
            >
              <p className="font-semibold">{formatDay(h.day)}</p>
              <p className="flex items-center gap-2 tabular-nums">
                <span aria-hidden className="size-2.5 rounded-[2px] bg-series-1" />
                {h.created} reported
              </p>
              <p className="flex items-center gap-2 tabular-nums">
                <span aria-hidden className="h-0.5 w-3 rounded-full bg-series-2" />
                {h.resolved} resolved
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Tiny trend line for a stat tile, full tile width. Decorative: the tile's text has the numbers. */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 100;
  const h = 28;
  const max = Math.max(1, ...values);
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - (v / max) * (h - 4)}`)
    .join(" ");
  return (
    <svg aria-hidden viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-7 w-full">
      <polyline
        points={pts}
        fill="none"
        className="stroke-series-1"
        strokeWidth={2}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
