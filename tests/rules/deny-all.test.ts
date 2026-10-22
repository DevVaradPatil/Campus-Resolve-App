import { readFileSync } from "node:fs";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-campusresolve",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

afterAll(() => testEnv.cleanup());

const collections = [
  "users",
  "accounts",
  "roster",
  "activationCodes",
  "rateLimits",
  "complaints",
  "auditLogs",
  "notifications",
  "categories",
  "locations",
  "contacts",
  "routingRules",
  "systemSettings",
];

describe("default-deny rules", () => {
  for (const name of collections) {
    it(`blocks unauthenticated read/write on ${name}`, async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, name, "x")));
      await assertFails(setDoc(doc(db, name, "x"), { a: 1 }));
    });

    it(`blocks authenticated admin-claimed client write on ${name}`, async () => {
      const db = testEnv.authenticatedContext("u1", { role: "admin" }).firestore();
      await assertFails(setDoc(doc(db, name, "x"), { a: 1 }));
    });
  }
});
