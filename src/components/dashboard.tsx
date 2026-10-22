"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  BarList,
  RangeLabel,
  RangePicker,
  RateTile,
  StatTile,
  hoursLabel,
} from "@/components/stats";
import { Sparkline, TrendChart } from "@/components/charts";
import { ServiceUnavailable } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/spinner";
import { DataTable, Panel } from "@/components/ui/surface";
import { api } from "@/lib/client/api";
import { RESOLUTION_BUCKETS } from "@/lib/domain/analytics";
import { PRIORITIES, type Priority } from "@/lib/domain/complaint";
import type { DashboardData } from "@/lib/server/dashboard";

export function useDashboard(days: number) {
  const [state, setState] = useState<{ data?: DashboardData; error?: boolean; days?: number }>({});
  useEffect(() => {
    let live = true;
    api<DashboardData>(`/api/dashboard?days=${days}`).then(
      (data) => live && setState({ data, days }),
      () => live && setState({ error: true, days }),
    );
    return () => {
      live = false;
    };
  }, [days]);
  return state.days === days ? state : {};
}

export function DashboardState({
  state,
  children,
}: {
  state: { data?: DashboardData; error?: boolean };
  children: (d: DashboardData) => ReactNode;
}) {
  if (state.error) return <ServiceUnavailable />;
  if (!state.data) return <Skeleton className="h-64" />;
  return <>{children(state.data)}</>;
}

const Grid = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
);

/** Hostel-wide figures every resident may see (PRD §7.1): counts and rates only. */
export function HostelStats({ d }: { d: DashboardData }) {
  const h = d.hostel;
  const prev = d.staff?.previous ?? d.committee?.previous;
  const rows = (m: Record<string, number>, labels: Record<string, string>) =>
    Object.entries(m).map(([key, value]) => ({ key, label: labels[key] ?? key, value }));
  const daily = d.daily;
  // 7-point smoothing keeps the tile sparklines readable over 30–90 days.
  const smooth = (xs: number[]) =>
    xs.length > 14
      ? xs.map((_, i) => xs.slice(Math.max(0, i - 6), i + 1).reduce((a, b) => a + b, 0))
      : xs;
  const delta = prev ? h.created - prev.created : null;
  return (
    <>
      <Grid>
        <StatTile
          label="Complaints reported"
          value={String(h.created)}
          spark={<Sparkline values={smooth(daily.map((x) => x.created))} />}
          change={
            delta === null
              ? null
              : {
                  text: `${delta >= 0 ? "+" : "−"}${Math.abs(delta)}`,
                  direction: delta > 0 ? "up" : delta < 0 ? "down" : "same",
                }
          }
        />
        <RateTile
          label="Resolved so far"
          of="resolved"
          spark={<Sparkline values={smooth(daily.map((x) => x.resolved))} />}
          now={{
            part: h.resolutionRate.resolved,
            whole: h.resolutionRate.eligible,
            rate: h.resolutionRate.rate,
          }}
          before={prev?.resolutionRate}
        />
        <RateTile
          label="First response on time"
          of="on time"
          now={{ part: h.onTimeRate.onTime, whole: h.onTimeRate.total, rate: h.onTimeRate.rate }}
          before={prev?.onTimeRate}
        />
        <StatTile
          label="Typical time to resolve"
          value={hoursLabel(h.resolutionHours.median)}
          detail={
            h.resolutionHours.count
              ? `Median of ${h.resolutionHours.count}; average ${hoursLabel(h.resolutionHours.average)}`
              : "No resolutions yet"
          }
        />
      </Grid>

      <Panel title="Reported and resolved, day by day">
        <div className="px-4 pb-4">
          <TrendChart data={daily} />
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="What residents report">
          <div className="px-4 pb-4">
            <BarList
              share
              label="Complaints by category"
              rows={rows(h.byCategory, d.labels.categories)}
            />
          </div>
        </Panel>
        <Panel title="How long fixes take">
          <div className="flex flex-col gap-3 px-4 pb-4">
            <BarList
              ordered
              label="Time from report to resolution"
              rows={RESOLUTION_BUCKETS.map((b, i) => ({
                key: b.label,
                label: b.label,
                value: h.resolutionHours.buckets[i],
              }))}
              empty="Nothing was resolved in this period."
            />
            <p className="text-xs text-muted">From the report to the recorded fix.</p>
          </div>
        </Panel>
        <Panel title="Where">
          <div className="px-4 pb-4">
            <BarList share label="Complaints by block" rows={rows(h.byBlock, d.labels.blocks)} />
          </div>
        </Panel>
        <Panel title="How urgent">
          <div className="flex flex-col gap-3 px-4 pb-4">
            <BarList
              ordered
              share
              label="Complaints by priority"
              rows={PRIORITIES.map((p) => ({
                key: p,
                label: PRIORITY_LABEL[p],
                value: h.byPriority[p] ?? 0,
              }))}
            />
            <p className="text-xs text-muted">
              Set by category rules, not by how loudly it was reported.
            </p>
          </div>
        </Panel>
      </div>

      <details className="rounded-surface border border-rule bg-sheet px-4 py-3 text-sm">
        <summary className="min-h-11 cursor-pointer content-center font-semibold">
          About these numbers · <RangeLabel range={d.range} />
        </summary>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted">
          <li>
            &ldquo;Resolved so far&rdquo; counts complaints reported in this period that are
            resolved now. Merged duplicates are left out ({h.recurringRate.duplicates} this period).
          </li>
          <li>
            Response targets are pilot targets (1 h critical, 8 h high, 2 days normal, 5 days low),
            not promises from hostel staff.
          </li>
          <li>Counts include confidential complaints, which are never shown individually.</li>
        </ul>
      </details>
    </>
  );
}

const PRIORITY_LABEL: Record<Priority, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
};

const CLOSED = {
  student_confirmed: "Confirmed fixed by reporter",
  confirmation_window_expired: "Closed automatically",
  duplicate: "Merged as duplicate",
};
const STATUS = {
  submitted: "Submitted",
  assigned: "Assigned",
  in_progress: "In progress",
  reopened: "Reopened",
  resolved: "Awaiting confirmation",
};

/** Admin view (PRD §7.2): live queue state, outcomes, feedback, recorded workload. */
export function StaffStats({ d }: { d: DashboardData }) {
  const s = d.staff!;
  return (
    <>
      <Grid>
        <StatTile
          label="Overdue now"
          value={String(s.live.overdue)}
          detail="No action recorded before the target"
        />
        <StatTile label="Escalated and open" value={String(s.live.escalated)} />
        <StatTile label="Reopened" value={String(s.reopened)} detail="In this period" />
        <StatTile
          label="Reporter feedback"
          value={s.feedback.average === null ? "–" : `${s.feedback.average.toFixed(1)} / 5`}
          detail={`${s.feedback.count} ratings`}
        />
      </Grid>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Open complaints by status">
          <div className="px-4 pb-4">
            <BarList
              label="Open complaints by status"
              rows={Object.entries(s.live.byStatus).map(([k, v]) => ({
                key: k,
                label: STATUS[k as keyof typeof STATUS],
                value: v,
              }))}
              empty="No open complaints."
            />
          </div>
        </Panel>
        <Panel title="How complaints closed">
          <div className="px-4 pb-4">
            <BarList
              label="Closures by reason"
              rows={Object.entries(s.closed).map(([k, v]) => ({
                key: k,
                label: CLOSED[k as keyof typeof CLOSED] ?? k,
                value: v,
              }))}
            />
          </div>
        </Panel>
      </div>
      <Panel title="Assignments recorded in the system">
        <p className="px-4 text-sm text-muted">
          Staff don&apos;t have accounts, so this counts what admins recorded, not how well anyone
          worked.
        </p>
        {s.workload.length ? (
          <DataTable
            caption="Assignments and recorded updates per contact"
            rowKey={(r) => r.name}
            rows={s.workload}
            columns={[
              { key: "name", header: "Contact", cell: (r) => r.name },
              { key: "assigned", header: "Assigned", cell: (r) => r.assigned, numeric: true },
              { key: "updates", header: "Updates recorded", cell: (r) => r.updates, numeric: true },
            ]}
          />
        ) : (
          <p className="px-4 pb-4 text-sm text-muted">Nothing assigned in this period.</p>
        )}
      </Panel>
    </>
  );
}

/** Committee view (PRD §7.3): public live counts and what happened to escalations. */
export function CommitteeStats({ d }: { d: DashboardData }) {
  const c = d.committee!;
  return (
    <Grid>
      <StatTile label="Overdue now" value={String(c.live.overdue)} detail="Public complaints" />
      <StatTile label="Escalated and open" value={String(c.live.escalated)} />
      <StatTile label="Reports to review" value={String(c.live.openReports)} />
      <StatTile
        label="Escalated complaints resolved"
        value={String(c.escalations.resolved ?? 0)}
        detail={`${c.escalations.raised ?? 0} escalations raised in this period`}
      />
    </Grid>
  );
}

/** Committee page header: live public counts, escalation outcomes, then hostel trends. */
export function CommitteeOverview() {
  const [days, setDays] = useState(30);
  const state = useDashboard(days);
  return (
    <section aria-label="Overview" className="flex flex-col gap-4">
      <div className="flex justify-end">
        <RangePicker value={days} onChange={setDays} />
      </div>
      <DashboardState state={state}>
        {(d) => (
          <>
            {d.committee && <CommitteeStats d={d} />}
            <HostelStats d={d} />
          </>
        )}
      </DashboardState>
    </section>
  );
}
