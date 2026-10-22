// Core complaint vocabulary and pure rules shared by UI and server: priority, deadlines, routing,
// safe location labels and the public projection. Lifecycle transitions land in lifecycle.ts (Phase 4).

import type { Block, Category, Contact, RoutingRule } from "./schemas";

export const STATUSES = [
  "submitted",
  "assigned",
  "in_progress",
  "resolved",
  "closed",
  "reopened",
] as const;
export type Status = (typeof STATUSES)[number];
export const isOpen = (s: Status) => s !== "resolved" && s !== "closed";

export const PRIORITIES = ["critical", "high", "normal", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const VISIBILITIES = ["public", "confidential"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

// PRD §5.2. The type is public; the room reference and free-text description never are.
export const LOCATION_TYPES = {
  room: "Room",
  bathroom: "Bathroom",
  corridor: "Corridor",
  common_area: "Common area",
  garden: "Garden",
  mess: "Mess",
  canteen: "Canteen",
  utility_area: "Utility area",
  other: "Other",
} as const;
export type LocationType = keyof typeof LOCATION_TYPES;
export const LOCATION_TYPE_IDS = Object.keys(LOCATION_TYPES) as [LocationType, ...LocationType[]];

export const LIMITS = {
  title: 120,
  description: 2000,
  roomReference: 20,
  locationDescription: 120,
  photos: 3,
  photoMb: 5,
} as const;

/** Proposed first-action targets (PRD §6.2), pending owner approval. Not service commitments. */
export const FIRST_ACTION_HOURS: Record<Priority, number> = {
  critical: 1,
  high: 8,
  normal: 48,
  low: 120,
};

export const firstActionDeadline = (priority: Priority, fromMs: number) =>
  fromMs + FIRST_ACTION_HOURS[priority] * 3600_000;

/**
 * Category rule → priority. A subcategory override beats the category default. The student's
 * "urgent" flag is recorded separately and never changes priority (PRD §6.2).
 */
export function priorityFor(cat: Category, subcategoryId: string | null) {
  const sub = cat.subcategories.find((s) => s.id === subcategoryId);
  return sub?.priority
    ? { priority: sub.priority, rule: `${cat.id}/${sub.id}` }
    : { priority: cat.defaultPriority, rule: cat.id };
}

/**
 * Most specific enabled rule with an active contact wins: category+block > category > block >
 * catch-all. No match → `contactId: null`, the admin fallback queue (FR-06).
 */
export function routeComplaint(
  rules: RoutingRule[],
  contacts: Contact[],
  categoryId: string,
  blockId: string | null,
) {
  const live = new Set(contacts.filter((c) => c.active).map((c) => c.id));
  const score = (r: RoutingRule) => (r.categoryId ? 2 : 0) + (r.blockId ? 1 : 0);
  const match = rules
    .filter(
      (r) =>
        r.enabled &&
        live.has(r.contactId) &&
        (!r.categoryId || r.categoryId === categoryId) &&
        (!r.blockId || r.blockId === blockId),
    )
    .sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0];
  return { contactId: match?.contactId ?? null, ruleId: match?.id ?? null };
}

export type ComplaintLocation = {
  blockId: string | null;
  floorId: string | null;
  type: LocationType;
  roomReference: string | null; // private
  description: string | null; // private
};

/** e.g. ["Block B", "Second floor", "Bathroom"]. Built only from structured ids, never room/free text. */
export function safeLocationLabel(loc: ComplaintLocation, blocks: Block[]) {
  const block = blocks.find((b) => b.id === loc.blockId);
  const floor = block?.floors.find((f) => f.id === loc.floorId);
  return [block?.label ?? "Hostel-wide", floor?.label, LOCATION_TYPES[loc.type]].filter(
    (p): p is string => !!p,
  );
}

/** Lowercase title keywords for the feed's `array-contains` search. No full-text service (zero cost). */
export function searchTokens(text: string) {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  return [...new Set(words)].slice(0, 25);
}

/** Internal record, `complaints/{id}`. Never client-readable. `T` is the timestamp type. */
export type ComplaintRecord<T> = {
  ticketId: string;
  title: string;
  description: string;
  categoryId: string;
  categoryLabel: string;
  subcategoryId: string | null;
  subcategoryLabel: string | null;
  location: ComplaintLocation;
  locationLabel: string[];
  priority: Priority;
  priorityRule: string;
  urgentFlag: boolean;
  reporterUid: string;
  reporterLabel: string;
  visibility: Visibility;
  status: Status;
  escalated: boolean;
  hidden: boolean;
  routing: { contactId: string | null; ruleId: string | null };
  assignedContactId: string | null;
  supportCount: number;
  attachmentCount: number;
  firstActionDeadline: T;
  createdAt: T;
  updatedAt: T;
};

/**
 * The only way a `publicComplaints/{id}` doc is built (allowlist, not denylist). Confidential or
 * hidden complaints have no public doc: callers delete it when this returns null.
 */
export function toPublicComplaint<T>(c: ComplaintRecord<T>) {
  if (c.visibility !== "public" || c.hidden) return null;
  return {
    ticketId: c.ticketId,
    title: c.title,
    description: c.description,
    categoryId: c.categoryId,
    categoryLabel: c.categoryLabel,
    subcategoryLabel: c.subcategoryLabel,
    blockId: c.location.blockId,
    location: c.locationLabel,
    status: c.status,
    open: isOpen(c.status),
    priority: c.priority,
    escalated: c.escalated,
    supportCount: c.supportCount,
    reporterLabel: c.reporterLabel,
    searchTokens: searchTokens(c.title),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}
export type PublicComplaint<T> = NonNullable<ReturnType<typeof toPublicComplaint<T>>>;

/** Row shape for feed and "My complaints" lists. */
export type IssueSummary = {
  id: string;
  ticketId: string;
  title: string;
  category: string;
  status: Status;
  priority: Priority;
  escalated?: boolean;
  supportCount: number;
  location: string[];
  createdAt: string;
  confidential?: boolean;
  thumbUrl?: string;
};
