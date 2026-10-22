import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, limit, query, setDoc } from "firebase/firestore";
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
    await setDoc(doc(db, "users/active"), { active: true });
    await setDoc(doc(db, "users/inactive"), { active: false });
    await setDoc(doc(db, "publicComplaints/c1"), { title: "Leak" });
  });
});

afterAll(() => testEnv.cleanup());

describe("publicComplaints read allowlist", () => {
  it("lets an active user get a doc and list pages of up to 20", async () => {
    const db = testEnv.authenticatedContext("active").firestore();
    await assertSucceeds(getDoc(doc(db, "publicComplaints/c1")));
    await assertSucceeds(getDocs(query(collection(db, "publicComplaints"), limit(20))));
  });

  it("rejects unbounded or oversized pages", async () => {
    const db = testEnv.authenticatedContext("active").firestore();
    await assertFails(getDocs(collection(db, "publicComplaints")));
    await assertFails(getDocs(query(collection(db, "publicComplaints"), limit(21))));
  });

  it("rejects deactivated, unknown and signed-out users", async () => {
    for (const ctx of [
      testEnv.authenticatedContext("inactive"),
      testEnv.authenticatedContext("nobody"),
      testEnv.unauthenticatedContext(),
    ])
      await assertFails(getDoc(doc(ctx.firestore(), "publicComplaints/c1")));
  });

  it("never allows client writes", async () => {
    const db = testEnv.authenticatedContext("active", { role: "admin" }).firestore();
    await assertFails(setDoc(doc(db, "publicComplaints/c1"), { title: "x" }));
  });
});
