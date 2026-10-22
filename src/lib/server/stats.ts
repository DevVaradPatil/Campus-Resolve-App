import "server-only";
import { FieldValue, type Transaction } from "firebase-admin/firestore";
import type { StatsDoc, StatsWrite } from "@/lib/domain/stats";
import { adminDb } from "./firebase-admin";

const db = adminDb;

/** Dotted counter paths → nested merge object, so concurrent increments never clobber. */
function nest(w: StatsWrite) {
  const out: Record<string, unknown> = {};
  const put = (path: string, value: unknown) => {
    const parts = path.split(".");
    let o = out;
    for (const p of parts.slice(0, -1)) o = (o[p] ??= {}) as Record<string, unknown>;
    o[parts[parts.length - 1]] = value;
  };
  for (const [k, v] of Object.entries(w.inc)) put(k, FieldValue.increment(v));
  for (const [k, v] of Object.entries(w.set ?? {})) put(k, v);
  return out;
}

/** In the caller's transaction, after its reads. */
export function writeStats(tx: Transaction, writes: StatsWrite[]) {
  for (const w of writes) tx.set(db.doc(`stats/${w.day}`), nest(w), { merge: true });
}

/** Reads the given days; missing days (nothing happened) come back empty. */
export async function readStats(days: string[]): Promise<StatsDoc[]> {
  if (!days.length) return [];
  const snaps = await db.getAll(...days.map((d) => db.doc(`stats/${d}`)));
  return snaps.map((s) => (s.data() as StatsDoc | undefined) ?? {});
}
