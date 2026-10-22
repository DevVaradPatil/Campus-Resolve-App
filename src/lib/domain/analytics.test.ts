import { describe, expect, it } from "vitest";
import { median, publicSummary, reportingRange, summarize } from "./analytics";
import type { ComplaintRecord } from "./complaint";
import { applyAction } from "./lifecycle";
import { dayKey, statsDelta, type StatsDoc, type StatsWrite } from "./stats";

const H = 3600_000;
// 2026-10-20 10:00 IST
const T0 = Date.UTC(2026, 9, 20, 4, 30);

/** Applies StatsWrites to in-memory day docs the way Firestore increments would. */
function apply(days: Map<string, StatsDoc>, writes: StatsWrite[]) {
  for (const w of writes) {
    const doc = (days.get(w.day) ?? {}) as Record<string, unknown>;
    const put = (path: string, f: (old: number) => number) => {
      const parts = path.split(".");
      let o = doc;
      for (const p of parts.slice(0, -1)) o = (o[p] ??= {}) as Record<string, unknown>;
      const last = parts[parts.length - 1];
      o[last] = f((o[last] as number) ?? 0);
    };
    for (const [k, v] of Object.entries(w.inc)) put(k, (old) => old + v);
    for (const [k, v] of Object.entries(w.set ?? {})) put(k, () => v);
    days.set(w.day, doc as StatsDoc);
  }
}

function record(over: Partial<ComplaintRecord<number>> = {}): ComplaintRecord<number> {
  return {
    ticketId: "CR-1",
    title: "t",
    description: "d",
    categoryId: "mess",
    categoryLabel: "Mess",
    subcategoryId: null,
    subcategoryLabel: null,
    location: { blockId: "b", floorId: null, type: "mess", roomReference: null, description: null },
    locationLabel: [],
    priority: "normal",
    priorityRule: "mess",
    urgentFlag: false,
    reporterUid: "u",
    reporterLabel: "x",
    visibility: "public",
    status: "submitted",
    open: true,
    escalated: false,
    hidden: false,
    hiddenReason: null,
    routing: { contactId: null, ruleId: null },
    assignedContactId: null,
    supportCount: 0,
    attachmentCount: 0,
    activeSince: T0,
    firstActionDeadline: T0 + 48 * H,
    firstActionAt: null,
    resolvedAt: null,
    resolutionNote: null,
    confirmationDeadline: null,
    closedAt: null,
    closureReason: null,
    feedback: null,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

/** Drives a complaint through the real lifecycle, recording stats as the server would. */
function simulate(days: Map<string, StatsDoc>, id: string, start: ComplaintRecord<number>) {
  let c = start;
  apply(days, statsDelta(id, null, c, "created", toMs(c.createdAt), toMs));
  return {
    step(type: Parameters<typeof applyAction<number>>[1], at: number) {
      const { patch, event } = applyAction(c, type, { now: at, ts: (m) => m, toMs });
      const next = { ...c, ...patch };
      apply(days, statsDelta(id, c, next, event.type, at, toMs));
      c = next;
      return this;
    },
  };
}
const toMs = (t: number) => t;

describe("stats and analytics (FR-14, fixed fixture)", () => {
  // Three complaints created on 20 Oct:
  //  A: assigned in 2h (on time), resolved after 10h, confirmed. Rated 4.
  //  B: assigned after 50h (late, target 48h), resolved at 30h... then reopened.
  //  C: merged as a duplicate of A.
  const days = new Map<string, StatsDoc>();
  simulate(days, "A", record())
    .step({ type: "assign", contactId: "maint", contactName: "M" }, T0 + 2 * H)
    .step({ type: "resolve", note: "ok", closureWindowHours: 48 }, T0 + 10 * H)
    .step({ type: "confirm" }, T0 + 12 * H);
  simulate(days, "B", record({ categoryId: "water-utilities" }))
    .step({ type: "assign", contactId: "maint", contactName: "M" }, T0 + 50 * H)
    .step({ type: "resolve", note: "ok", closureWindowHours: 48 }, T0 + 70 * H)
    .step({ type: "reopen", note: null }, T0 + 72 * H);
  simulate(days, "C", record()).step(
    { type: "duplicate", primaryId: "A", primaryLabel: "CR-1" },
    T0 + 5 * H,
  );
  const s = summarize([...days.values()]);

  it("reports the cohort resolution rate, excluding merged duplicates", () => {
    // Eligible: A and B (C merged). Resolved now: A only (B reopened).
    expect(s.resolutionRate).toEqual({ resolved: 1, eligible: 2, rate: 0.5 });
    expect(s.created).toBe(3);
  });

  it("counts first actions within target", () => {
    expect(s.onTimeRate).toEqual({ onTime: 1, total: 2, rate: 0.5 });
  });

  it("gives median and average resolution time from submission", () => {
    expect(s.resolutionHours).toEqual({ count: 2, median: 40, average: 40 });
  });

  it("computes the recurring-issue rate from linked duplicates", () => {
    expect(s.recurringRate).toEqual({ duplicates: 1, created: 3, rate: 1 / 3 });
    expect(s.closed).toEqual({ student_confirmed: 1, duplicate: 1 });
    expect(s.reopened).toBe(1);
  });

  it("splits by category and records workload as assignments and updates", () => {
    expect(s.byCategory).toEqual({ mess: 2, "water-utilities": 1 });
    expect(s.workload.maint).toEqual({ assigned: 2, updates: 2 });
  });

  it("keeps per-team workload and feedback out of the public summary", () => {
    const pub = publicSummary(s);
    expect(Object.keys(pub)).not.toContain("workload");
    expect(Object.keys(pub)).not.toContain("feedback");
  });

  it("puts cohort counters on the creation day, events on the day they happen", () => {
    expect(days.get("2026-10-20")?.cohort).toEqual({ eligible: 2, resolved: 1 });
    expect(days.get("2026-10-23")?.reopened).toBe(1); // T0 + 72h
  });
});

describe("helpers", () => {
  it("uses India's calendar day", () => {
    expect(dayKey(Date.UTC(2026, 9, 20, 19, 0))).toBe("2026-10-21"); // 00:30 IST
  });
  it("builds a range and the period before it", () => {
    const r = reportingRange(7, Date.UTC(2026, 9, 22, 6));
    expect(r).toMatchObject({ from: "2026-10-16", to: "2026-10-22", days: 7 });
    expect(r.previous[0]).toBe("2026-10-09");
    expect(r.previous[6]).toBe("2026-10-15");
  });
  it("median handles even, odd and empty", () => {
    expect([median([3, 1, 2]), median([4, 1, 2, 3]), median([])]).toEqual([2, 2.5, null]);
  });
  it("returns null rates instead of dividing by zero", () => {
    expect(summarize([]).resolutionRate.rate).toBeNull();
  });
});
