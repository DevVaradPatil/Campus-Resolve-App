import { requirePermission, requireUser } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { route } from "@/lib/server/http";
import type { ActivationCodeDoc, RosterDoc, UserDoc } from "@/lib/server/types";

const PAGE = 50;

export type RosterEntry = Omit<RosterDoc, "importedAt"> & {
  account: { active: boolean; role: string } | null;
  code: { expiresAt: string; used: boolean } | null;
};

/** Paginated roster with account and activation-code status. `q` is a roll-number prefix. */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  requirePermission(user, "roster.manage");
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
  const after = url.searchParams.get("after");

  let query = adminDb
    .collection("roster")
    .orderBy("rollNumber")
    .limit(PAGE + 1);
  if (q)
    query = query
      .where("rollNumber", ">=", q)
      .where("rollNumber", "<", q + String.fromCharCode(0xf8ff));
  if (after) query = query.startAfter(after);
  const docs = (await query.get()).docs.map((d) => d.data() as RosterDoc);
  const page = docs.slice(0, PAGE);

  const uids = page.map((r) => r.uid).filter((u): u is string => !!u);
  const [userSnaps, codeSnaps] = await Promise.all([
    uids.length ? adminDb.getAll(...uids.map((u) => adminDb.doc(`users/${u}`))) : [],
    page.length
      ? adminDb.getAll(...page.map((r) => adminDb.doc(`activationCodes/${r.rollNumber}`)))
      : [],
  ]);
  const users = new Map(userSnaps.map((s) => [s.id, s.data() as UserDoc | undefined]));

  const entries: RosterEntry[] = page.map(({ importedAt, ...r }, i) => {
    void importedAt; // internal only
    const u = r.uid ? users.get(r.uid) : undefined;
    const c = codeSnaps[i]?.data() as ActivationCodeDoc | undefined;
    return {
      ...r,
      account: u ? { active: u.active, role: u.role } : null,
      code: c ? { expiresAt: c.expiresAt.toDate().toISOString(), used: !!c.consumedAt } : null,
    };
  });
  return Response.json({
    entries,
    next: docs.length > PAGE ? page[page.length - 1].rollNumber : null,
  });
});
