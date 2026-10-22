import "server-only";
import { can, type Permission } from "@/lib/domain/permissions";
import { adminAuth, adminDb } from "./firebase-admin";
import { forbidden, unauthorized } from "./http";
import type { UserDoc } from "./types";

export type SessionUser = UserDoc & { uid: string };

/**
 * Verifies the Firebase ID token and loads the user record on every request, so deactivation
 * and role changes take effect immediately rather than when the token expires (PRD §9.2).
 */
export async function requireUser(req: Request): Promise<SessionUser> {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw unauthorized();
  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(token)).uid;
  } catch {
    throw unauthorized();
  }
  const snap = await adminDb.doc(`users/${uid}`).get();
  const user = snap.data() as UserDoc | undefined;
  if (!user || !user.active) throw unauthorized();
  return { ...user, uid };
}

export function requirePermission(user: SessionUser, perm: Permission) {
  if (!can(user, perm)) throw forbidden();
}

/** What the client may know about the signed-in user. */
export const toMe = (u: SessionUser) => ({
  uid: u.uid,
  rollNumber: u.rollNumber,
  displayName: u.displayName,
  pseudonym: u.pseudonym,
  role: u.role,
  grants: u.grants,
  block: u.block,
  floor: u.floor,
  room: u.room,
  muteNonEssential: !!u.muteNonEssential,
});
export type Me = ReturnType<typeof toMe>;
