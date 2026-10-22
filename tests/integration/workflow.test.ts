import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { GET as queueRoute } from "@/app/api/admin/complaints/route";
import { GET as committeeRoute } from "@/app/api/committee/complaints/route";
import { POST as actionRoute } from "@/app/api/complaints/[id]/actions/route";
import { GET as reporterRoute } from "@/app/api/complaints/[id]/reporter/route";
import { GET as viewRoute } from "@/app/api/complaints/[id]/route";
import { POST as createRoute } from "@/app/api/complaints/route";
import { POST as cronRoute } from "@/app/api/cron/sweep/route";
import { DEFAULT_CATEGORIES, DEV_BLOCKS, DEV_CONTACTS, DEV_ROUTING } from "@/lib/domain/defaults";
import { activate, importRoster, issueCodes, login, setRole } from "@/lib/server/accounts";
import type { SessionUser } from "@/lib/server/auth";
import { seedConfig } from "@/lib/server/config";
import { adminDb } from "@/lib/server/firebase-admin";
import { sweep } from "@/lib/server/sweep";
import { ADMIN_PASSWORD, authedRequest, resetEmulators, ROSTER_CSV, seedAdmin } from "./helpers";

let admin: SessionUser;
let adminToken: string, alice: string, bob: string, committee: string;

async function studentToken(roll: string) {
  const { issued } = await issueCodes(admin, [roll]);
  const pw = "a-long-password";
  return (await activate({ rollNumber: roll, code: issued[0].code, password: pw }, "10.0.0.1"))
    .token;
}

let keySeq = 0;
async function create(token: string, over: Record<string, unknown> = {}) {
  const res = await createRoute(
    await authedRequest(token, "http://localhost/api/complaints", {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey: `wf-key-${String(++keySeq).padStart(10, "0")}`,
        categoryId: "infrastructure",
        subcategoryId: "plumbing",
        title: "Tap leaking in the bathroom",
        description: "The tap has been leaking all night.",
        location: { blockId: "b", floorId: "2", type: "bathroom", roomReference: "214" },
        visibility: "public",
        ...over,
      }),
    }),
    undefined as never,
  );
  return ((await res.json()) as { id: string }).id;
}

async function act(token: string, id: string, body: Record<string, unknown>) {
  const res = await actionRoute(
    await authedRequest(token, "http://localhost/api/x", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, body: await res.json() };
}

const view = async (token: string, id: string) =>
  (await viewRoute(await authedRequest(token), { params: Promise.resolve({ id }) })).json();
const doc = async (id: string) => (await adminDb.doc(`complaints/${id}`).get()).data()!;
const pub = async (id: string) => (await adminDb.doc(`publicComplaints/${id}`).get()).data();
const audits = async () =>
  (await adminDb.collection("auditLogs").get()).docs.map((d) => d.get("action") as string);
const past = (h: number) => Timestamp.fromMillis(Date.now() - h * 3600_000);

beforeEach(async () => {
  await resetEmulators();
  admin = await seedAdmin();
  await importRoster(admin, { csv: ROSTER_CSV, removeMissing: false }, true);
  await seedConfig({
    categories: DEFAULT_CATEGORIES,
    locations: DEV_BLOCKS,
    contacts: DEV_CONTACTS,
    routingRules: DEV_ROUTING,
  });
  alice = await studentToken("231001");
  bob = await studentToken("231002");
  committee = await studentToken("231003");
  const cUid = (await adminDb.doc("roster/231003").get()).get("uid");
  await setRole(admin, cUid, { role: "committee", grants: [] });
  adminToken = (await login({ loginId: "admin:warden", password: ADMIN_PASSWORD }, "10.0.0.1"))
    .token;
});

describe("full lifecycle", () => {
  it("assign → start → note → resolve → confirm → feedback, with events, audits and projection", async () => {
    const id = await create(alice);
    expect((await act(adminToken, id, { type: "assign", contactId: "maintenance" })).status).toBe(
      200,
    );
    expect((await doc(id)).firstActionAt).toBeTruthy();
    expect((await pub(id))?.status).toBe("assigned");
    await act(adminToken, id, { type: "start", note: "Plumber booked" });
    await act(adminToken, id, { type: "note", note: "Part ordered" });
    await act(adminToken, id, { type: "resolve", note: "Washer replaced" });

    const resolved = await doc(id);
    expect(resolved.status).toBe("resolved");
    // Infrastructure closure window is 72h (PRD §6.3).
    const window = resolved.confirmationDeadline.toMillis() - resolved.resolvedAt.toMillis();
    expect(window).toBe(72 * 3600_000);

    expect((await act(alice, id, { type: "confirm" })).status).toBe(200);
    expect(await doc(id)).toMatchObject({ status: "closed", closureReason: "student_confirmed" });
    expect(
      (await act(alice, id, { type: "feedback", rating: 4, comment: "Quick fix" })).status,
    ).toBe(200);
    expect((await act(alice, id, { type: "feedback", rating: 5 })).status).toBe(409);
    expect(JSON.stringify(await pub(id))).not.toContain("Quick fix");

    const events = (await adminDb.collection(`complaints/${id}/events`).orderBy("at").get()).docs;
    expect(events.map((e) => e.get("type"))).toEqual([
      "created",
      "assigned",
      "started",
      "note",
      "resolved",
      "confirmed",
    ]);
    expect(await audits()).toEqual(
      expect.arrayContaining([
        "complaint.assign",
        "complaint.start",
        "complaint.note",
        "complaint.resolve",
        "complaint.confirm",
        "complaint.feedback",
      ]),
    );
    const v = await view(alice, id);
    expect(v.workflow).toMatchObject({
      assignee: "Hostel maintenance (dev placeholder)",
      resolutionNote: "Washer replaced",
      feedback: { rating: 4, comment: "Quick fix" },
    });
    expect(v.timeline.map((e: { byline: string }) => e.byline)).toContain("Recorded by admin");
  });

  it("refuses impossible transitions with 409", async () => {
    const id = await create(alice);
    expect((await act(alice, id, { type: "confirm" })).status).toBe(409);
    expect((await act(adminToken, id, { type: "resolve", note: "done already" })).status).toBe(409);
    expect((await act(adminToken, id, { type: "assign", contactId: "nobody" })).status).toBe(400);
  });
});

describe("permissions (FR-07)", () => {
  it("students and committee can't manage complaints; committee can escalate", async () => {
    const id = await create(alice);
    for (const body of [
      { type: "assign", contactId: "maintenance" },
      { type: "priority", priority: "critical", reason: "please hurry" },
      { type: "hide", reason: "test hide" },
    ]) {
      expect((await act(alice, id, body)).status).toBe(403);
      expect((await act(bob, id, body)).status).toBe(403);
      expect((await act(committee, id, body)).status).toBe(403);
    }
    expect((await act(alice, id, { type: "escalate", reason: "taking long" })).status).toBe(403);
    expect(
      (await act(committee, id, { type: "escalate", reason: "Floor-wide issue" })).status,
    ).toBe(200);
    expect((await doc(id)).escalated).toBe(true);
    // Nothing above changed priority or assignment.
    expect(await doc(id)).toMatchObject({ priority: "high", assignedContactId: null });
  });

  it("only the reporter can confirm or reopen", async () => {
    const id = await create(alice);
    await act(adminToken, id, { type: "assign", contactId: "maintenance" });
    await act(adminToken, id, { type: "resolve", note: "Fixed it" });
    expect((await act(bob, id, { type: "confirm" })).status).toBe(403);
    expect((await act(committee, id, { type: "reopen" })).status).toBe(403);
    expect((await act(adminToken, id, { type: "confirm" })).status).toBe(403);
  });

  it("confidential complaints don't exist for committee or other students", async () => {
    const id = await create(alice, { visibility: "confidential" });
    expect((await act(committee, id, { type: "escalate", reason: "seen it" })).status).toBe(404);
    expect((await act(bob, id, { type: "escalate", reason: "seen it" })).status).toBe(404);
    expect((await act(adminToken, id, { type: "assign", contactId: "maintenance" })).status).toBe(
      200,
    );
  });
});

describe("reopen (FR-12)", () => {
  it("returns the complaint to an active state with a fresh deadline and an audit event", async () => {
    const id = await create(alice);
    await act(adminToken, id, { type: "assign", contactId: "maintenance" });
    await act(adminToken, id, { type: "resolve", note: "Fixed it" });
    const before = await doc(id);
    expect((await act(alice, id, { type: "reopen", note: "Still dripping" })).status).toBe(200);
    const c = await doc(id);
    expect(c).toMatchObject({
      status: "reopened",
      open: true,
      firstActionAt: null,
      resolvedAt: null,
      resolutionNote: null,
      confirmationDeadline: null,
      assignedContactId: "maintenance",
    });
    expect(c.firstActionDeadline.toMillis()).toBeGreaterThan(before.firstActionDeadline.toMillis());
    expect((await pub(id))?.status).toBe("reopened");
    expect(await audits()).toContain("complaint.reopen");
  });
});

describe("moderation and internal notes", () => {
  it("hiding removes the public copy; unhiding restores it", async () => {
    const id = await create(alice);
    expect((await act(adminToken, id, { type: "hide", reason: "Names a student" })).status).toBe(
      200,
    );
    expect(await pub(id)).toBeUndefined();
    expect((await view(bob, id)).error).toBeTruthy();
    expect((await view(alice, id)).workflow).toMatchObject({ hidden: true, hiddenReason: null });
    await act(adminToken, id, { type: "unhide" });
    expect(await pub(id)).toBeTruthy();
  });

  it("keeps override reasons out of the owner's and public timeline", async () => {
    const id = await create(alice);
    await act(adminToken, id, {
      type: "priority",
      priority: "critical",
      reason: "Whole floor dry",
    });
    const text = (v: { timeline: { note?: string }[] }) => JSON.stringify(v.timeline);
    expect(text(await view(adminToken, id))).toContain("Whole floor dry");
    expect(text(await view(alice, id))).not.toContain("Whole floor dry");
    expect(text(await view(bob, id))).not.toContain("Whole floor dry");
    expect((await pub(id))?.priority).toBe("critical");
  });

  it("reveals the reporter only to permitted staff, and audits it", async () => {
    const id = await create(alice);
    const get = async (token: string) =>
      reporterRoute(await authedRequest(token), { params: Promise.resolve({ id }) });
    expect((await get(committee)).status).toBe(403);
    const res = await get(adminToken);
    expect(await res.json()).toMatchObject({ name: "Asha Rao", rollNumber: "231001" });
    expect(await audits()).toContain("complaint.reporter_view");
  });
});

describe("sweep (FR-11)", () => {
  it("escalates overdue complaints once", async () => {
    const id = await create(alice);
    const handled = await create(bob);
    await adminDb.doc(`complaints/${id}`).update({ firstActionDeadline: past(1) });
    await act(adminToken, handled, { type: "assign", contactId: "maintenance" });
    await adminDb.doc(`complaints/${handled}`).update({ firstActionDeadline: past(1) });

    expect(await sweep()).toMatchObject({ escalated: 1, closed: 0 });
    expect(await doc(id)).toMatchObject({ escalated: true });
    expect((await doc(handled)).escalated).toBe(false);
    expect(await sweep()).toMatchObject({ escalated: 0 });
    const types = (await adminDb.collection(`complaints/${id}/events`).get()).docs.map((d) =>
      d.get("type"),
    );
    expect(types.filter((t) => t === "escalated")).toHaveLength(1);
  });

  it("auto-closes only resolved complaints past their window, once", async () => {
    const [due, notYet] = [await create(alice), await create(bob)];
    for (const id of [due, notYet]) {
      await act(adminToken, id, { type: "assign", contactId: "maintenance" });
      await act(adminToken, id, { type: "resolve", note: "Fixed it" });
    }
    await adminDb.doc(`complaints/${due}`).update({ confirmationDeadline: past(1) });

    expect(await sweep()).toMatchObject({ closed: 1 });
    expect(await doc(due)).toMatchObject({
      status: "closed",
      closureReason: "confirmation_window_expired",
    });
    expect((await doc(notYet)).status).toBe("resolved");
    expect((await pub(due))?.status).toBe("closed");
    expect(await sweep()).toMatchObject({ closed: 0 });
    expect(await audits()).toContain("complaint.auto_close");
  });

  it("cron endpoint needs the shared secret", async () => {
    const call = (auth?: string) =>
      cronRoute(
        new Request("http://localhost/api/cron/sweep", {
          method: "POST",
          headers: auth ? { authorization: auth } : {},
        }),
        undefined as never,
      );
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong-secret")).status).toBe(401);
    const ok = await call(`Bearer ${process.env.CRON_SECRET}`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ escalated: 0, closed: 0, storage: "ok" });
  });
});

describe("queues", () => {
  it("admin queue puts overdue first and filters; students are refused", async () => {
    const later = await create(alice);
    const overdue = await create(bob, { categoryId: "mess", subcategoryId: null });
    await adminDb.doc(`complaints/${overdue}`).update({ firstActionDeadline: past(2) });
    const q = async (token: string, qs = "") =>
      queueRoute(
        await authedRequest(token, `http://localhost/api/admin/complaints?${qs}`),
        undefined as never,
      );

    expect((await q(alice)).status).toBe(403);
    const { items } = await (await q(adminToken)).json();
    expect(items.map((i: { id: string }) => i.id)).toEqual([overdue, later]);
    expect(items[0]).toMatchObject({ overdue: true });
    const mess = await (await q(adminToken, "categoryId=mess")).json();
    expect(mess.items.map((i: { id: string }) => i.id)).toEqual([overdue]);
    expect((await q(adminToken, "view=nope")).status).toBe(400);
  });

  it("committee sees overdue/escalated public complaints only", async () => {
    const overdue = await create(alice);
    const secret = await create(bob, { visibility: "confidential" });
    await create(alice, { categoryId: "mess", subcategoryId: null }); // not overdue
    for (const id of [overdue, secret])
      await adminDb.doc(`complaints/${id}`).update({ firstActionDeadline: past(1) });
    const res = await committeeRoute(await authedRequest(committee), undefined as never);
    const { items } = await res.json();
    expect(items.map((i: { id: string }) => i.id)).toEqual([overdue]);
    expect((await committeeRoute(await authedRequest(alice), undefined as never)).status).toBe(403);
  });
});
