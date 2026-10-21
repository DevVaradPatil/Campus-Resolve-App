import { signInWithCustomToken } from "firebase/auth";
import { describe, expect, it } from "vitest";
import { auth } from "@/lib/client/firebase";
import { adminAuth, adminDb } from "@/lib/server/firebase-admin";

// Proves the core of the roll-number login (PRD §9.1): server mints a custom token,
// client exchanges it, server verifies the resulting ID token.
describe("custom token round trip", () => {
  it("mints, signs in and verifies", async () => {
    const uid = "spike-user";
    const token = await adminAuth.createCustomToken(uid, { role: "student" });
    const cred = await signInWithCustomToken(auth, token);
    const decoded = await adminAuth.verifyIdToken(await cred.user.getIdToken());
    expect(decoded.uid).toBe(uid);
    expect(decoded.role).toBe("student");
  });

  it("runs an Admin SDK transaction", async () => {
    const ref = adminDb.doc("systemSettings/ticketCounter");
    await ref.delete();
    const next = () =>
      adminDb.runTransaction(async (tx) => {
        const n = ((await tx.get(ref)).get("value") ?? 0) + 1;
        tx.set(ref, { value: n });
        return n;
      });
    const results = await Promise.all([next(), next(), next()]);
    expect(results.sort()).toEqual([1, 2, 3]);
  });
});
