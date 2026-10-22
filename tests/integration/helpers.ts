import { signInWithCustomToken, signOut } from "firebase/auth";
import { auth } from "@/lib/client/firebase";
import { createAdmin } from "@/lib/server/accounts";
import { requireUser, type SessionUser } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";

const P = "demo-campusresolve";

/** Wipes Firestore and Auth emulator state between tests. */
export async function resetEmulators() {
  await signOut(auth).catch(() => {});
  await Promise.all([
    fetch(`http://127.0.0.1:8080/emulator/v1/projects/${P}/databases/(default)/documents`, {
      method: "DELETE",
    }),
    fetch(`http://127.0.0.1:9099/emulator/v1/projects/${P}/accounts`, { method: "DELETE" }),
  ]);
}

/** Exchanges a custom token like the browser does and returns a Bearer request. */
export async function authedRequest(
  token: string,
  url = "http://localhost/api/x",
  init: RequestInit = {},
) {
  const cred = await signInWithCustomToken(auth, token);
  const idToken = await cred.user.getIdToken();
  return new Request(url, {
    ...init,
    headers: {
      authorization: `Bearer ${idToken}`,
      ...(!(init.body instanceof FormData) && { "content-type": "application/json" }),
    },
  });
}

export async function sessionFor(uid: string): Promise<SessionUser> {
  const data = (await adminDb.doc(`users/${uid}`).get()).data();
  return { ...(data as SessionUser), uid };
}

export const ADMIN_PASSWORD = "admin-password-123";

export async function seedAdmin() {
  const { uid } = await createAdmin("warden", "Test Warden", ADMIN_PASSWORD);
  return sessionFor(uid);
}

export const ROSTER_CSV = [
  "rollNumber,name,block,floor,room,eligible",
  "231001,Asha Rao,B,2,214,yes",
  "231002,Ravi Kumar,B,2,215,yes",
  "231003,Meera Iyer,A,1,101,yes",
  "231004,Not Eligible,A,1,102,no",
].join("\n");

export { requireUser };
