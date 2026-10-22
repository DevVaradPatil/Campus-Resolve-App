// PRD §7.4 metric definitions, computed from per-day stats docs. Pure and unit-tested.
// Every figure carries its counts so screens can show "n of N" next to any rate.

import { dayKey, type StatsDoc } from "./stats";

const DAY = 86_400_000;

/** `days` calendar days ending today (IST), oldest first, plus the same-length period before. */
export function reportingRange(days: number, nowMs: number) {
  const keys = (end: number) =>
    Array.from({ length: days }, (_, i) => dayKey(end - (days - 1 - i) * DAY));
  const current = keys(nowMs);
  const previous = keys(nowMs - days * DAY);
  return { from: current[0], to: current[days - 1], days, current, previous };
}

const sum = (xs: (number | undefined)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
const rate = (part: number, whole: number) => (whole ? part / whole : null);

function addMaps(docs: StatsDoc[], pick: (d: StatsDoc) => Record<string, number> | undefined) {
  const out: Record<string, number> = {};
  for (const d of docs)
    for (const [k, v] of Object.entries(pick(d) ?? {})) out[k] = (out[k] ?? 0) + v;
  return out;
}

export function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type Summary = ReturnType<typeof summarize>;

export function summarize(docs: StatsDoc[]) {
  const created = sum(docs.map((d) => d.created));
  const eligible = sum(docs.map((d) => d.cohort?.eligible));
  const cohortResolved = sum(docs.map((d) => d.cohort?.resolved));
  const onTime = sum(docs.map((d) => d.firstAction?.onTime));
  const late = sum(docs.map((d) => d.firstAction?.late));
  const hours = docs.flatMap((d) => Object.values(d.resolutionHours ?? {}));
  const duplicates = sum(docs.map((d) => d.duplicates));
  const fbCount = sum(docs.map((d) => d.feedback?.count));
  const fbSum = sum(docs.map((d) => d.feedback?.sum));
  const workload: Record<string, { assigned: number; updates: number }> = {};
  for (const d of docs)
    for (const [k, w] of Object.entries(d.workload ?? {})) {
      workload[k] ??= { assigned: 0, updates: 0 };
      workload[k].assigned += w.assigned ?? 0;
      workload[k].updates += w.updates ?? 0;
    }

  return {
    created,
    /** Of the complaints created in the period (the cohort), how many are resolved now. */
    resolutionRate: { resolved: cohortResolved, eligible, rate: rate(cohortResolved, eligible) },
    /** First documented action within the target, among first actions recorded in the period. */
    onTimeRate: { onTime, total: onTime + late, rate: rate(onTime, onTime + late) },
    /** Submission → recorded resolution, for resolutions recorded in the period. */
    resolutionHours: {
      count: hours.length,
      median: median(hours),
      average: hours.length ? sum(hours) / hours.length : null,
    },
    /** Linked duplicates relative to all complaints in the period. */
    recurringRate: { duplicates, created, rate: rate(duplicates, created) },
    reopened: sum(docs.map((d) => d.reopened)),
    resolved: sum(docs.map((d) => d.resolved)),
    closed: addMaps(docs, (d) => d.closed),
    escalations: addMaps(docs, (d) => d.escalations),
    byCategory: addMaps(docs, (d) => d.byCategory),
    byBlock: addMaps(docs, (d) => d.byBlock),
    byPriority: addMaps(docs, (d) => d.byPriority),
    feedback: {
      count: fbCount,
      average: fbCount ? fbSum / fbCount : null,
      distribution: [1, 2, 3, 4, 5].map((r) => sum(docs.map((d) => d.feedback?.[`r${r}`]))),
    },
    workload,
  };
}

/** The parts every signed-in resident may see: counts and rates, nothing per person or team. */
export const publicSummary = (s: Summary) => ({
  created: s.created,
  resolutionRate: s.resolutionRate,
  onTimeRate: s.onTimeRate,
  resolutionHours: s.resolutionHours,
  recurringRate: s.recurringRate,
  byCategory: s.byCategory,
  byBlock: s.byBlock,
});
