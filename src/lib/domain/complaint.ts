// Core complaint vocabulary shared by UI and server. Lifecycle rules land in lifecycle.ts (Phase 4).

export const STATUSES = [
  "submitted",
  "assigned",
  "in_progress",
  "resolved",
  "closed",
  "reopened",
] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITIES = ["critical", "high", "normal", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];
