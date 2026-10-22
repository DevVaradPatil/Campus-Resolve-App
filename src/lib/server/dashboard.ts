import "server-only";
import { Timestamp, type Query } from "firebase-admin/firestore";
import { publicSummary, reportingRange, summarize, type Summary } from "@/lib/domain/analytics";
import { isOverdue } from "@/lib/domain/lifecycle";
import { can } from "@/lib/domain/permissions";
import type { SessionUser } from "./auth";
import { loadConfig } from "./config";
import { adminDb } from "./firebase-admin";
import { readStats } from "./stats";
import type { ComplaintDoc } from "./types";

const db = adminDb;
const complaints = db.collection("complaints");
const count = async (q: Query) => (await q.count().get()).data().count;

/** The caller's own complaints by state (PRD §7.1). Students have few; capped anyway. */
export async function mySummary(user: SessionUser) {
  const snap = await complaints
    .where("reporterUid", "==", user.uid)
    .select("status", "firstActionAt", "firstActionDeadline")
    .limit(200)
    .get();
  const out = {
    submitted: 0,
    inProgress: 0,
    awaitingConfirmation: 0,
    reopened: 0,
    closed: 0,
    overdue: 0,
  };
  const now = Date.now();
  for (const d of snap.docs) {
    const c = d.data() as ComplaintDoc;
    if (c.status === "submitted") out.submitted++;
    else if (c.status === "assigned" || c.status === "in_progress") out.inProgress++;
    else if (c.status === "resolved") out.awaitingConfirmation++;
    else if (c.status === "reopened") out.reopened++;
    else out.closed++;
    if (isOverdue(c, now, (t) => t.toMillis())) out.overdue++;
  }
  return out;
}

/** Current state, from count queries (cheap: one read per 1,000 matches). */
async function live(publicOnly: boolean) {
  const base: Query = publicOnly ? complaints.where("visibility", "==", "public") : complaints;
  const now = Timestamp.now();
  const reports = db.collection("reports").where("status", "==", "open");
  const statuses = ["submitted", "assigned", "in_progress", "reopened", "resolved"] as const;
  const [byStatus, overdue, escalated, openReports] = await Promise.all([
    Promise.all(statuses.map((s) => count(base.where("status", "==", s)))),
    count(base.where("firstActionAt", "==", null).where("firstActionDeadline", "<=", now)),
    count(base.where("open", "==", true).where("escalated", "==", true)),
    count(publicOnly ? reports.where("confidential", "==", false) : reports),
  ]);
  return {
    byStatus: Object.fromEntries(statuses.map((s, i) => [s, byStatus[i]])),
    overdue,
    escalated,
    openReports,
  };
}

const comparable = (s: Summary) => ({
  created: s.created,
  resolutionRate: s.resolutionRate,
  onTimeRate: s.onTimeRate,
  resolutionHours: s.resolutionHours,
  recurringRate: s.recurringRate,
});

/**
 * GET /api/dashboard: one response, shaped by role. Residents get hostel-wide aggregates and
 * their own counts; staff get the full summary and the previous period; committee gets public
 * live counts and escalation outcomes. Nothing here identifies a reporter.
 */
export async function dashboard(user: SessionUser, days: number) {
  const range = reportingRange(days, Date.now());
  const staff = can(user, "complaints.manage");
  const committee = can(user, "complaints.escalate");
  const [cur, prev, my, cfg] = await Promise.all([
    readStats(range.current),
    staff || committee ? readStats(range.previous) : [],
    mySummary(user),
    loadConfig(),
  ]);
  const s = summarize(cur);
  const labels = {
    categories: Object.fromEntries(cfg.categories.map((c) => [c.id, c.label])),
    blocks: {
      ...Object.fromEntries(cfg.locations.map((b) => [b.id, b.label])),
      none: "Hostel-wide",
    },
  };
  const base = {
    range: { from: range.from, to: range.to, days },
    hostel: publicSummary(s),
    mine: my,
    labels,
  };
  const previous = comparable(summarize(prev));
  if (staff) {
    const contacts = Object.fromEntries(cfg.contacts.map((c) => [c.id, c.name]));
    return {
      ...base,
      staff: {
        previous,
        live: await live(!can(user, "confidential.view")),
        closed: s.closed,
        reopened: s.reopened,
        escalations: s.escalations,
        byPriority: s.byPriority,
        feedback: s.feedback,
        // Recorded assignments and updates, not a measure of staff performance (PRD §7.2).
        workload: Object.entries(s.workload)
          .map(([id, w]) => ({ name: contacts[id] ?? id, ...w }))
          .sort((a, b) => b.assigned - a.assigned),
      },
    };
  }
  if (committee)
    return {
      ...base,
      committee: { previous, live: await live(true), escalations: s.escalations, closed: s.closed },
    };
  return base;
}
type Full = Awaited<ReturnType<typeof dashboard>>;
/** Client view of the response: base fields plus whichever role section applies. */
export type DashboardData = Omit<Extract<Full, { staff: unknown }>, "staff"> & {
  staff?: Extract<Full, { staff: unknown }>["staff"];
  committee?: Extract<Full, { committee: unknown }>["committee"];
};
