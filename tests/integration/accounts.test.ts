import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as importRoute } from "@/app/api/admin/roster/import/route";
import {
  activate,
  changePassword,
  changeRoom,
  importRoster,
  issueCodes,
  login,
  setActive,
  setRole,
} from "@/lib/server/accounts";
import type { SessionUser } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import {
  ADMIN_PASSWORD,
  authedRequest,
  requireUser,
  resetEmulators,
  ROSTER_CSV,
  seedAdmin,
  sessionFor,
} from "./helpers";

const IP = "10.0.0.1";
const PW = "a-long-password";
let admin: SessionUser;

async function activateStudent(roll: string, password = PW) {
  const { issued } = await issueCodes(admin, [roll]);
  const { token } = await activate({ rollNumber: roll, code: issued[0].code, password }, IP);
  return token;
}

const uidOf = async (roll: string) =>
  (await adminDb.doc(`roster/${roll}`).get()).get("uid") as string;
const auditActions = async () =>
  (await adminDb.collection("auditLogs").get()).docs.map((d) => d.get("action"));

beforeEach(async () => {
  await resetEmulators();
  admin = await seedAdmin();
  await importRoster(admin, { csv: ROSTER_CSV, removeMissing: false }, true);
});

describe("roster import", () => {
  it("previews without writing, then applies and audits", async () => {
    const csv = ROSTER_CSV + "\n231005,New Person,C,3,301,yes";
    const preview = await importRoster(admin, { csv, removeMissing: false }, false);
    expect(preview).toMatchObject({ applied: false, summary: { add: 1, unchanged: 4 } });
    expect((await adminDb.doc("roster/231005").get()).exists).toBe(false);
    await importRoster(admin, { csv, removeMissing: false }, true);
    expect((await adminDb.doc("roster/231005").get()).exists).toBe(true);
    expect(await auditActions()).toContain("roster.import");
  });

  it("refuses to apply a file with errors", async () => {
    const csv = ROSTER_CSV + "\nxx,Bad,A,1,1,yes";
    const r = await importRoster(admin, { csv, removeMissing: false }, true);
    expect(r.applied).toBe(false);
    expect(r.errors).toHaveLength(1);
  });

  it("deactivates students missing from a replacing import", async () => {
    await activateStudent("231003");
    const csv = ROSTER_CSV.split("\n")
      .filter((l) => !l.startsWith("231003"))
      .join("\n");
    await importRoster(admin, { csv, removeMissing: true }, true);
    expect((await adminDb.doc(`users/${await uidOf("231003")}`).get()).get("active")).toBe(false);
  });
});

describe("activation (FR-01, FR-02)", () => {
  it("activates a roster student and the token authenticates API calls", async () => {
    const token = await activateStudent("231001");
    const user = await requireUser(await authedRequest(token));
    expect(user).toMatchObject({ rollNumber: "231001", role: "student", block: "B", active: true });
    expect(user.pseudonym).toMatch(/^\w+ \w+$/);
    expect(await auditActions()).toEqual(
      expect.arrayContaining(["activation.issue", "account.activate"]),
    );
  });

  it("rejects a replayed code", async () => {
    const { issued } = await issueCodes(admin, ["231001"]);
    const input = { rollNumber: "231001", code: issued[0].code, password: PW };
    await activate(input, IP);
    await expect(activate(input, IP)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an expired code", async () => {
    const { issued } = await issueCodes(admin, ["231001"]);
    await adminDb
      .doc("activationCodes/231001")
      .update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    await expect(
      activate({ rollNumber: "231001", code: issued[0].code, password: PW }, IP),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a code issued for a different roll number", async () => {
    const { issued } = await issueCodes(admin, ["231001"]);
    await issueCodes(admin, ["231002"]);
    await expect(
      activate({ rollNumber: "231002", code: issued[0].code, password: PW }, IP),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("won't issue codes off-roster or to ineligible students", async () => {
    const { issued, skipped } = await issueCodes(admin, ["999999", "231004", "x"]);
    expect(issued).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual([
      "Not a valid roll number",
      "Not on the roster",
      "Not eligible",
    ]);
  });

  it("gives the same error for unknown roll numbers and wrong codes", async () => {
    await issueCodes(admin, ["231001"]);
    const code = "AAAAA-AAAAA";
    const wrong = await activate({ rollNumber: "231001", code, password: PW }, IP).catch((e) => e);
    const unknown = await activate({ rollNumber: "999999", code, password: PW }, IP).catch(
      (e) => e,
    );
    expect(wrong.message).toBe(unknown.message);
  });

  it("rejects a password containing the roll number", async () => {
    const { issued } = await issueCodes(admin, ["231001"]);
    await expect(
      activate({ rollNumber: "231001", code: issued[0].code, password: "my231001pass" }, IP),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("login", () => {
  it("signs in with the right password and gives one generic error otherwise", async () => {
    await activateStudent("231001");
    expect((await login({ loginId: "231001", password: PW }, IP)).token).toBeTruthy();
    const wrong = await login({ loginId: "231001", password: "nope-nope-nope" }, IP).catch(
      (e) => e,
    );
    const unknown = await login({ loginId: "999999", password: PW }, IP).catch((e) => e);
    expect(wrong.status).toBe(401);
    expect(wrong.message).toBe(unknown.message);
  });

  it("locks the account after 5 attempts in 15 minutes, even with the right password", async () => {
    await activateStudent("231002");
    for (let i = 0; i < 5; i++)
      await login({ loginId: "231002", password: "wrong-password" }, IP).catch(() => {});
    await expect(login({ loginId: "231002", password: PW }, IP)).rejects.toMatchObject({
      status: 429,
    });
  });

  it("signs admins in through the admin namespace only", async () => {
    const ok = await login({ loginId: "admin:warden", password: ADMIN_PASSWORD }, IP);
    expect(ok.token).toBeTruthy();
    await expect(login({ loginId: "warden", password: ADMIN_PASSWORD }, IP)).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe("account management", () => {
  it("deactivation blocks the very next API call and future logins", async () => {
    const token = await activateStudent("231001");
    const req = await authedRequest(token);
    await setActive(admin, await uidOf("231001"), false);
    await expect(requireUser(req)).rejects.toMatchObject({ status: 401 });
    await expect(login({ loginId: "231001", password: PW }, IP)).rejects.toMatchObject({
      status: 401,
    });
    expect(await auditActions()).toContain("account.deactivate");
  });

  it("admin reset kills the old password and keeps the same UID", async () => {
    await activateStudent("231001");
    const uid = await uidOf("231001");
    const { issued } = await issueCodes(admin, ["231001"]);
    expect(issued[0].kind).toBe("reset");
    await expect(login({ loginId: "231001", password: PW }, IP)).rejects.toMatchObject({
      status: 401,
    });
    const password = "brand-new-password";
    await activate({ rollNumber: "231001", code: issued[0].code, password }, IP);
    expect(await uidOf("231001")).toBe(uid);
    expect((await login({ loginId: "231001", password }, IP)).token).toBeTruthy();
  });

  it("changes the password only with the current one", async () => {
    const token = await activateStudent("231001");
    const user = await requireUser(await authedRequest(token));
    await expect(
      changePassword(user, { currentPassword: "nope", newPassword: "another-password" }),
    ).rejects.toMatchObject({ status: 400 });
    await changePassword(user, { currentPassword: PW, newPassword: "another-password" });
    const res = await login({ loginId: "231001", password: "another-password" }, IP);
    expect(res.token).toBeTruthy();
  });

  it("room change updates the profile without changing the UID", async () => {
    await activateStudent("231001");
    const uid = await uidOf("231001");
    await changeRoom(admin, "231001", { block: "C", floor: "3", room: "301" });
    expect(await uidOf("231001")).toBe(uid);
    expect((await sessionFor(uid)).room).toBe("301");
  });

  it("roles: committee allowed, admin only on admin accounts, never on yourself", async () => {
    await activateStudent("231001");
    const uid = await uidOf("231001");
    await setRole(admin, uid, { role: "committee", grants: ["export"] });
    expect((await sessionFor(uid)).grants).toEqual(["export"]);
    await expect(setRole(admin, uid, { role: "admin", grants: [] })).rejects.toMatchObject({
      status: 400,
    });
    await expect(setRole(admin, admin.uid, { role: "student", grants: [] })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("route authorization", () => {
  const body = JSON.stringify({ csv: ROSTER_CSV });

  it("rejects students on admin routes with 403 and anonymous callers with 401", async () => {
    const token = await activateStudent("231001");
    const asStudent = await importRoute(
      await authedRequest(token, undefined, { method: "POST", body }),
      undefined,
    );
    expect(asStudent.status).toBe(403);
    const anon = await importRoute(
      new Request("http://localhost/x", { method: "POST", body }),
      undefined,
    );
    expect(anon.status).toBe(401);
  });

  it("lets admins call admin routes", async () => {
    const { token } = await login({ loginId: "admin:warden", password: ADMIN_PASSWORD }, IP);
    const res = await importRoute(
      await authedRequest(token, undefined, { method: "POST", body }),
      undefined,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).summary.unchanged).toBe(4);
  });
});
