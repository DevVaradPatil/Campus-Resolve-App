import "server-only";
import { CONFIG_SCHEMAS, type Block, type Category, type ConfigKind } from "@/lib/domain/schemas";
import type { Contact, RoutingRule } from "@/lib/domain/schemas";
import { writeAudit } from "./audit";
import type { SessionUser } from "./auth";
import { adminDb } from "./firebase-admin";

// Hostel configuration lives in four small collections, one doc per item, keyed by slug id.
// Items are deactivated rather than deleted so old complaints keep resolving their labels.

export type HostelConfig = {
  categories: Category[];
  locations: Block[];
  contacts: Contact[];
  routingRules: RoutingRule[];
};

const KINDS = Object.keys(CONFIG_SCHEMAS) as ConfigKind[];
const byOrder = (a: { order?: number }, b: { order?: number }) => (a.order ?? 0) - (b.order ?? 0);

export async function loadConfig(): Promise<HostelConfig> {
  const snaps = await Promise.all(KINDS.map((k) => adminDb.collection(k).get()));
  const [categories, locations, contacts, routingRules] = snaps.map((s) =>
    s.docs.map((d) => d.data()).sort(byOrder),
  );
  return { categories, locations, contacts, routingRules } as HostelConfig;
}

/** Upserts one item after validating it against its schema. Audited. */
export async function saveConfigItem(actor: SessionUser, kind: ConfigKind, body: unknown) {
  const item = CONFIG_SCHEMAS[kind].parse(body);
  const b = adminDb.batch();
  b.set(adminDb.doc(`${kind}/${item.id}`), item);
  writeAudit(b, {
    actorUid: actor.uid,
    action: "config.update",
    target: { type: "config", id: `${kind}/${item.id}` },
    outcome: "success",
  });
  await b.commit();
  return item;
}

/** Writes a full set of config items (dev seed, tests, Phase 8 production seed). */
export async function seedConfig(data: HostelConfig, actorUid: string | null = null) {
  const b = adminDb.batch();
  for (const kind of KINDS)
    for (const item of data[kind])
      b.set(adminDb.doc(`${kind}/${item.id}`), CONFIG_SCHEMAS[kind].parse(item));
  writeAudit(b, {
    actorUid,
    action: "config.seed",
    target: { type: "system", id: "config" },
    outcome: "success",
    meta: Object.fromEntries(KINDS.map((k) => [k, data[k].length])),
  });
  await b.commit();
}
