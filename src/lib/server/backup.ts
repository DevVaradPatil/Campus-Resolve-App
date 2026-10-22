import "server-only";
import {
  Timestamp,
  type CollectionReference,
  type DocumentData,
  type Firestore,
} from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";
import { objectExists } from "./storage";

// Zero-cost backup (PRD §14.3): a JSON dump of the collections needed to rebuild the service,
// plus a manifest of photo objects. scripts/export-backup.ts encrypts it with age;
// scripts/restore-backup.ts decrypts and calls restoreBackup(). docs/RECOVERY.md has the steps.

/**
 * What a backup holds. Left out on purpose: notifications, activation codes and rate-limit
 * counters (short-lived), and photo bytes (they stay in storage; the manifest lists them).
 */
export const BACKUP_COLLECTIONS = [
  "users",
  "accounts",
  "roster",
  "complaints",
  "publicComplaints",
  "reports",
  "auditLogs",
  "categories",
  "locations",
  "contacts",
  "routingRules",
  "systemSettings",
  "stats",
] as const;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type DocDump = { id: string; data: Json; sub?: Record<string, DocDump[]> };
export type Backup = {
  format: "campusresolve-backup/1";
  createdAt: string;
  projectId: string;
  collections: Record<string, DocDump[]>;
  counts: Record<string, number>;
  attachments: { complaintId: string; attachmentId: string; key: string; bytes: number }[];
};

// Timestamps survive the JSON round trip as {"__ts": millis}.
function toJson(v: unknown): Json {
  if (v instanceof Timestamp) return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(toJson);
  if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toJson(x)]));
  return v as Json;
}
function fromJson(v: Json): unknown {
  if (Array.isArray(v)) return v.map(fromJson);
  if (v && typeof v === "object") {
    if (typeof v.__ts === "number" && Object.keys(v).length === 1)
      return Timestamp.fromMillis(v.__ts);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fromJson(x)]));
  }
  return v;
}

async function dump(col: CollectionReference, counts: Record<string, number>, path: string) {
  const out: DocDump[] = [];
  for (const d of (await col.get()).docs) {
    const subs = await d.ref.listCollections();
    const entry: DocDump = { id: d.id, data: toJson(d.data()) };
    if (subs.length) {
      entry.sub = {};
      for (const s of subs) entry.sub[s.id] = await dump(s, counts, `${path}/${s.id}`);
    }
    out.push(entry);
  }
  counts[path] = (counts[path] ?? 0) + out.length;
  return out;
}

export async function exportBackup(db: Firestore = adminDb): Promise<Backup> {
  const collections: Record<string, DocDump[]> = {};
  const counts: Record<string, number> = {};
  for (const name of BACKUP_COLLECTIONS)
    collections[name] = await dump(db.collection(name), counts, name);
  const attachments = (collections.complaints ?? []).flatMap((c) =>
    (c.sub?.attachments ?? []).map((a) => {
      const data = a.data as { key: string; bytes: number };
      return { complaintId: c.id, attachmentId: a.id, key: data.key, bytes: data.bytes };
    }),
  );
  return {
    format: "campusresolve-backup/1",
    createdAt: new Date().toISOString(),
    projectId: process.env.FIREBASE_PROJECT_ID ?? "",
    collections,
    counts,
    attachments,
  };
}

/**
 * Loads a backup into an **empty** project (an emulator or the restore-test project), then
 * verifies document counts against the backup and checks every listed photo exists in storage.
 */
export async function restoreBackup(b: Backup, db: Firestore = adminDb) {
  if (b.format !== "campusresolve-backup/1") throw new Error("Not a CampusResolve backup.");
  if (!(await db.collection("complaints").limit(1).get()).empty)
    throw new Error("The target project already has complaints. Restore only into an empty one.");

  let batch = db.batch();
  let pending = 0;
  const write = async (ref: FirebaseFirestore.DocumentReference, data: Json) => {
    batch.set(ref, fromJson(data) as DocumentData);
    if (++pending === 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  };
  const load = async (col: CollectionReference, docs: DocDump[]) => {
    for (const d of docs) {
      await write(col.doc(d.id), d.data);
      for (const [name, sub] of Object.entries(d.sub ?? {}))
        await load(col.doc(d.id).collection(name), sub);
    }
  };
  for (const [name, docs] of Object.entries(b.collections)) await load(db.collection(name), docs);
  if (pending) await batch.commit();

  // Verify: count what's now there the same way the export counted.
  const counts: Record<string, number> = {};
  for (const name of Object.keys(b.collections)) await dump(db.collection(name), counts, name);
  const mismatches = Object.entries(b.counts)
    .filter(([k, n]) => (counts[k] ?? 0) !== n)
    .map(([k, n]) => `${k}: expected ${n}, found ${counts[k] ?? 0}`);

  const missing: string[] = [];
  for (const a of b.attachments)
    if (!(await objectExists(a.key).catch(() => false))) missing.push(a.key);
  return { counts, mismatches, attachments: b.attachments.length, missingAttachments: missing };
}
