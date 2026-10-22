import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-campusresolve",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/alice"), { active: true });
    await setDoc(doc(db, "users/bob"), { active: true });
    await setDoc(doc(db, "users/gone"), { active: false });
    await setDoc(doc(db, "notifications/n1"), { recipientUid: "alice", read: false });
    await setDoc(doc(db, "notifications/n2"), { recipientUid: "gone", read: false });
  });
});

afterAll(() => testEnv.cleanup());

const mine = (uid: string, n = 20) =>
  query(
    collection(testEnv.authenticatedContext(uid).firestore(), "notifications"),
    where("recipientUid", "==", uid),
    limit(n),
  );

describe("notifications read rules", () => {
  it("lets a user read their own, 20 at a time", async () => {
    await assertSucceeds(
      getDoc(doc(testEnv.authenticatedContext("alice").firestore(), "notifications/n1")),
    );
    await assertSucceeds(getDocs(mine("alice")));
    await assertFails(getDocs(mine("alice", 21)));
  });

  it("hides other people's notifications", async () => {
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertFails(getDoc(doc(bob, "notifications/n1")));
    await assertFails(getDocs(query(collection(bob, "notifications"), limit(20))));
    await assertFails(
      getDocs(
        query(collection(bob, "notifications"), where("recipientUid", "==", "alice"), limit(20)),
      ),
    );
  });

  it("refuses deactivated users and every client write", async () => {
    await assertFails(getDocs(mine("gone")));
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(updateDoc(doc(alice, "notifications/n1"), { read: true }));
    await assertFails(setDoc(doc(alice, "notifications/x"), { recipientUid: "alice" }));
  });
});
