import { describe, expect, it } from "vitest";
import type { ComplaintRecord, Status } from "./complaint";
import { applyAction, isOverdue, LifecycleError, type WorkflowAction } from "./lifecycle";

const H = 3600_000;
const NOW = 100 * H;
const ctx = { now: NOW, ts: (ms: number) => ms, toMs: (t: number) => t };

function complaint(over: Partial<ComplaintRecord<number>> = {}): ComplaintRecord<number> {
  return {
    ticketId: "CR-000001",
    title: "Leak",
    description: "Leaking tap",
    categoryId: "infrastructure",
    categoryLabel: "Infrastructure",
    subcategoryId: null,
    subcategoryLabel: null,
    location: { blockId: "b", floorId: null, type: "room", roomReference: null, description: null },
    locationLabel: ["Block B", "Room"],
    priority: "normal",
    priorityRule: "infrastructure",
    urgentFlag: false,
    reporterUid: "u1",
    reporterLabel: "Quiet Heron",
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
    activeSince: 0,
    firstActionDeadline: 48 * H,
    firstActionAt: null,
    resolvedAt: null,
    resolutionNote: null,
    confirmationDeadline: null,
    closedAt: null,
    closureReason: null,
    feedback: null,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

const assign: WorkflowAction = { type: "assign", contactId: "maint", contactName: "Maintenance" };
const resolve: WorkflowAction = {
  type: "resolve",
  note: "Replaced washer",
  closureWindowHours: 72,
};
const run = (c: ComplaintRecord<number>, a: WorkflowAction) => applyAction(c, a, ctx);
const statusAfter = (s: Status, a: WorkflowAction, over = {}) =>
  run(complaint({ status: s, assignedContactId: "maint", ...over }), a).patch.status;

describe("allowed transitions", () => {
  it("follows Submitted → Assigned → In progress → Resolved → Closed", () => {
    let c = complaint();
    for (const [a, expected] of [
      [assign, "assigned"],
      [{ type: "start", note: null }, "in_progress"],
      [resolve, "resolved"],
      [{ type: "confirm" }, "closed"],
    ] as [WorkflowAction, Status][]) {
      const { patch } = run(c, a);
      expect(patch.status).toBe(expected);
      c = { ...c, ...patch };
    }
    expect(c).toMatchObject({ open: false, closureReason: "student_confirmed", closedAt: NOW });
  });

  it("reassigning keeps progress", () => {
    expect(statusAfter("in_progress", { ...assign, contactId: "other" })).toBe("in_progress");
  });

  it("records the first handling action once", () => {
    const first = run(complaint(), assign).patch;
    expect(first.firstActionAt).toBe(NOW);
    const later = run(
      complaint({ status: "assigned", assignedContactId: "maint", firstActionAt: 5 }),
      {
        type: "note",
        note: "Plumber called",
      },
    ).patch;
    expect(later.firstActionAt).toBe(5);
  });

  it("sets the confirmation deadline from the category window on resolve", () => {
    expect(
      run(complaint({ status: "in_progress", assignedContactId: "maint" }), resolve).patch,
    ).toMatchObject({
      resolutionNote: "Replaced washer",
      resolvedAt: NOW,
      confirmationDeadline: NOW + 72 * H,
    });
  });
});

describe("forbidden transitions (FR-07)", () => {
  const forbidden: [Status, WorkflowAction][] = [
    ["submitted", { type: "start", note: null }],
    ["submitted", resolve],
    ["submitted", { type: "confirm" }],
    ["assigned", { type: "confirm" }],
    ["in_progress", { type: "reopen", note: null }],
    ["closed", assign],
    ["closed", resolve],
    ["closed", { type: "note", note: "late" }],
    ["resolved", { type: "start", note: null }],
    ["resolved", { type: "auto_close" }], // no deadline yet
  ];
  for (const [s, a] of forbidden)
    it(`${a.type} from ${s}`, () => {
      expect(() => statusAfter(s, a)).toThrow(LifecycleError);
    });

  it("won't re-escalate, re-hide or set the same priority", () => {
    expect(() =>
      run(complaint({ escalated: true }), { type: "escalate", reason: "x", by: "committee" }),
    ).toThrow();
    expect(() => run(complaint({ hidden: true }), { type: "hide", reason: "spam" })).toThrow();
    expect(() => run(complaint(), { type: "priority", priority: "normal", reason: "x" })).toThrow();
  });
});

describe("reopen (FR-12)", () => {
  it("starts a fresh cycle and keeps nothing from the old resolution", () => {
    const closed = complaint({
      status: "closed",
      open: false,
      assignedContactId: "maint",
      firstActionAt: 10,
      resolvedAt: 20,
      resolutionNote: "done",
      confirmationDeadline: 30,
      closedAt: 40,
      closureReason: "confirmation_window_expired",
      feedback: { rating: 4, comment: null },
    });
    const { patch, event } = run(closed, { type: "reopen", note: null });
    expect(patch).toMatchObject({
      status: "reopened",
      open: true,
      activeSince: NOW,
      firstActionDeadline: NOW + 48 * H,
      firstActionAt: null,
      resolvedAt: null,
      resolutionNote: null,
      confirmationDeadline: null,
      closedAt: null,
      closureReason: null,
      feedback: null,
    });
    expect(event).toMatchObject({ type: "reopened", internal: false });
    // The assignee stays, so work can resume without reassigning.
    expect(run({ ...closed, ...patch }, { type: "start", note: null }).patch.status).toBe(
      "in_progress",
    );
  });
});

describe("closure (FR-11)", () => {
  const resolved = complaint({ status: "resolved", open: false, confirmationDeadline: NOW - 1 });
  it("auto-closes only after the confirmation deadline", () => {
    expect(run(resolved, { type: "auto_close" }).patch).toMatchObject({
      status: "closed",
      closureReason: "confirmation_window_expired",
    });
    expect(() =>
      run({ ...resolved, confirmationDeadline: NOW + 1 }, { type: "auto_close" }),
    ).toThrow();
  });
  it("distinguishes student confirmation from expiry", () => {
    expect(run(resolved, { type: "confirm" }).patch.closureReason).toBe("student_confirmed");
  });
});

describe("priority override", () => {
  it("recomputes the deadline from the current cycle start and keeps the reason internal", () => {
    const { patch, event } = run(complaint({ activeSince: 10 * H }), {
      type: "priority",
      priority: "high",
      reason: "Whole floor affected",
    });
    expect(patch).toMatchObject({
      priority: "high",
      priorityRule: "override",
      firstActionDeadline: 18 * H,
    });
    expect(event).toMatchObject({ internal: true, note: "Normal → High: Whole floor affected" });
  });
});

describe("isOverdue", () => {
  it("is true only for open complaints with no action past the deadline", () => {
    const due = complaint({ firstActionDeadline: NOW - 1 });
    expect(isOverdue(due, NOW, ctx.toMs)).toBe(true);
    expect(isOverdue({ ...due, firstActionAt: 1 }, NOW, ctx.toMs)).toBe(false);
    expect(isOverdue({ ...due, status: "resolved" }, NOW, ctx.toMs)).toBe(false);
    expect(isOverdue(complaint({ firstActionDeadline: NOW + 1 }), NOW, ctx.toMs)).toBe(false);
  });
});
