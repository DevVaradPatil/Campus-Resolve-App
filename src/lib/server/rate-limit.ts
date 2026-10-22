import "server-only";
import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";
import { HttpError } from "./http";

// Starting limits from PRD §12.2. IP limits are generous because campus traffic shares NAT.
export const LIMITS = {
  loginAccount: { limit: 5, windowSec: 15 * 60 },
  loginIp: { limit: 60, windowSec: 15 * 60 },
  activateAccount: { limit: 5, windowSec: 15 * 60 },
  activateIp: { limit: 40, windowSec: 15 * 60 },
  passwordChange: { limit: 3, windowSec: 60 * 60 },
  complaintCreate: { limit: 5, windowSec: 60 * 60 },
  upload: { limit: 10, windowSec: 60 * 60 },
  support: { limit: 30, windowSec: 10 * 60 },
  comment: { limit: 10, windowSec: 10 * 60 },
} as const;

type Limit = { limit: number; windowSec: number };

/** Pure fixed-window step, exported for unit tests. */
export function step(
  state: { count: number; windowStart: number } | undefined,
  now: number,
  { limit, windowSec }: Limit,
) {
  const fresh = !state || now - state.windowStart >= windowSec * 1000;
  const next = fresh
    ? { count: 1, windowStart: now }
    : { count: state.count + 1, windowStart: state.windowStart };
  const retryAfterSec = Math.ceil((next.windowStart + windowSec * 1000 - now) / 1000);
  return { next, allowed: next.count <= limit, retryAfterSec };
}

/**
 * Counts one attempt against `key` and throws 429 once over the limit. Transactional, so
 * concurrent requests can't slip past. Docs carry `expiresAt` for a Firestore TTL policy.
 */
export async function consume(key: string, l: Limit) {
  const ref = adminDb.doc(
    `rateLimits/${createHash("sha256").update(key).digest("hex").slice(0, 40)}`,
  );
  const res = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const s = step(snap.data() as { count: number; windowStart: number } | undefined, now, l);
    tx.set(ref, {
      ...s.next,
      expiresAt: Timestamp.fromMillis(s.next.windowStart + l.windowSec * 1000),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return s;
  });
  if (!res.allowed) {
    const mins = Math.max(1, Math.ceil(res.retryAfterSec / 60));
    throw new HttpError(
      429,
      `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
      {
        retryAfterSec: res.retryAfterSec,
      },
    );
  }
}
