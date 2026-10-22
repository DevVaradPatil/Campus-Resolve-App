import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { Timestamp } from "firebase-admin/firestore";
import { Decrypter, Encrypter, generateX25519Identity, identityToRecipient } from "age-encryption";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { GET as queueRoute } from "@/app/api/admin/complaints/route";
import { GET as committeeRoute } from "@/app/api/committee/complaints/route";
import { GET as exportRoute } from "@/app/api/admin/export/route";
import { GET as dashboardRoute } from "@/app/api/dashboard/route";
import { POST as actionRoute } from "@/app/api/complaints/[id]/actions/route";
import { POST as hideCommentRoute } from "@/app/api/complaints/[id]/comments/[commentId]/hide/route";
import { GET as commentsGet, POST as commentsPost } from "@/app/api/complaints/[id]/comments/route";
import { POST as supportRoute } from "@/app/api/complaints/[id]/support/route";
import { GET as reporterRoute } from "@/app/api/complaints/[id]/reporter/route";
import { GET as viewRoute } from "@/app/api/complaints/[id]/route";
import { POST as createRoute } from "@/app/api/complaints/route";
import { POST as photoRoute } from "@/app/api/complaints/[id]/photos/route";
import { POST as cronRoute } from "@/app/api/cron/sweep/route";
import { POST as moderationPost } from "@/app/api/moderation/[reportId]/route";
import { GET as moderationGet } from "@/app/api/moderation/route";
import { POST as reportRoute } from "@/app/api/reports/route";
import { POST as prefsRoute } from "@/app/api/me/preferences/route";
import { POST as markReadRoute } from "@/app/api/notifications/read/route";
import { DEFAULT_CATEGORIES, DEV_BLOCKS, DEV_CONTACTS, DEV_ROUTING } from "@/lib/domain/defaults";
import { activate, importRoster, issueCodes, login, setRole } from "@/lib/server/accounts";
import type { SessionUser } from "@/lib/server/auth";
import { seedConfig } from "@/lib/server/config";
import { adminDb } from "@/lib/server/firebase-admin";
import { exportBackup, restoreBackup } from "@/lib/server/backup";
import { runRetention } from "@/lib/server/retention";
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
    expect(await ok.json()).toMatchObject({ escalated: 0, closed: 0, storage: "local ok" });
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

describe("notifications (FR-13)", () => {
  const notes = async (uid: string) =>
    (await adminDb.collection("notifications").where("recipientUid", "==", uid).get()).docs;
  const uidOf = async (roll: string) =>
    (await adminDb.doc(`roster/${roll}`).get()).get("uid") as string;
  const markRead = async (token: string, body: unknown) =>
    (
      await markReadRoute(
        await authedRequest(token, "http://localhost/api/notifications/read", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        undefined as never,
      )
    ).json();

  it("tells admins about new complaints and the reporter about progress, deduped", async () => {
    const id = await create(alice);
    expect((await notes(admin.uid)).map((d) => d.get("title"))).toEqual([
      "New complaint CR-000001",
    ]);
    await act(adminToken, id, { type: "assign", contactId: "maintenance" });
    await act(adminToken, id, { type: "note", note: "Plumber booked" });
    await act(adminToken, id, { type: "note", note: "Part ordered" });
    const mine = (await notes(await uidOf("231001"))).map((d) => d.data());
    expect(mine.map((n) => n.type).sort()).toEqual(["assigned", "note"]);
    expect(mine.find((n) => n.type === "note")).toMatchObject({
      body: "Part ordered", // the hour's second note replaced the first
      read: false,
      href: `/complaints/${id}`,
    });
  });

  it("keeps confidential complaints out of previews and staff-only notes out of everything", async () => {
    const id = await create(alice, {
      visibility: "confidential",
      title: "Roommate harassment issue",
    });
    await act(adminToken, id, { type: "assign", contactId: "maintenance" });
    await act(adminToken, id, { type: "priority", priority: "critical", reason: "Safety" });
    const all = (await adminDb.collection("notifications").get()).docs.map((d) => d.data());
    expect(JSON.stringify(all)).not.toMatch(/harassment|Safety/i);
    expect(all.every((n) => n.body === null)).toBe(true);
  });

  it("marks only your own notifications read", async () => {
    await create(alice);
    const [n] = await notes(admin.uid);
    expect(await markRead(bob, { ids: [n.id] })).toEqual({ updated: 0 });
    expect(await markRead(adminToken, { all: true })).toEqual({ updated: 1 });
    expect((await adminDb.doc(`notifications/${n.id}`).get()).get("read")).toBe(true);
  });

  it("reminds the reporter once before auto-close", async () => {
    const id = await create(alice);
    await act(adminToken, id, { type: "assign", contactId: "maintenance" });
    await act(adminToken, id, { type: "resolve", note: "Fixed it" });
    await adminDb
      .doc(`complaints/${id}`)
      .update({ confirmationDeadline: Timestamp.fromMillis(Date.now() + 2 * 3600_000) });
    expect(await sweep()).toMatchObject({ reminded: 1, closed: 0 });
    expect(await sweep()).toMatchObject({ reminded: 0 });
    const types = (await notes(await uidOf("231001"))).map((d) => d.get("type"));
    expect(types.filter((t) => t === "closure_reminder")).toHaveLength(1);
  });

  it("saves the mute preference and audits it", async () => {
    const res = await prefsRoute(
      await authedRequest(alice, "http://localhost/api/me/preferences", {
        method: "POST",
        body: JSON.stringify({ muteNonEssential: true }),
      }),
      undefined as never,
    );
    expect(res.status).toBe(200);
    expect(
      (await adminDb.doc(`users/${await uidOf("231001")}`).get()).get("muteNonEssential"),
    ).toBe(true);
    expect(await audits()).toContain("account.preferences");
  });
});

describe("support (FR-09)", () => {
  const support = async (token: string, id: string) => {
    const res = await supportRoute(
      await authedRequest(token, "http://localhost/api/x", { method: "POST" }),
      { params: Promise.resolve({ id }) },
    );
    return { status: res.status, body: await res.json() };
  };

  it("allows one active vote per account and keeps both counts in step", async () => {
    const id = await create(alice);
    expect((await support(bob, id)).body).toEqual({ supported: true, supportCount: 1 });
    expect((await support(committee, id)).body).toEqual({ supported: true, supportCount: 2 });
    expect((await support(bob, id)).body).toEqual({ supported: false, supportCount: 1 });
    expect((await doc(id)).supportCount).toBe(1);
    expect((await pub(id))?.supportCount).toBe(1);
    expect((await adminDb.collection(`complaints/${id}/votes`).get()).size).toBe(1);
  });

  it("refuses the reporter, confidential complaints and spam", async () => {
    const id = await create(alice);
    expect((await support(alice, id)).status).toBe(409);
    const secret = await create(alice, { visibility: "confidential" });
    expect((await support(bob, secret)).status).toBe(404);
    for (let i = 0; i < 30; i++) await support(bob, id);
    expect((await support(bob, id)).status).toBe(429);
  });
});

describe("comments (FR-10)", () => {
  const comment = async (token: string, id: string, body: string) =>
    (
      await commentsPost(
        await authedRequest(token, "http://localhost/api/x", {
          method: "POST",
          body: JSON.stringify({ body }),
        }),
        { params: Promise.resolve({ id }) },
      )
    ).status;
  const list = async (token: string, id: string) =>
    (await commentsGet(await authedRequest(token), { params: Promise.resolve({ id }) })).json();

  it("posts plain text under a pseudonym, notifies the reporter, and never audits the text", async () => {
    const id = await create(alice);
    expect(await comment(bob, id, "Same in my wing <script>alert(1)</script>")).toBe(200);
    const { comments } = await list(alice, id);
    expect(comments).toHaveLength(1);
    expect(comments[0].author).toMatch(/^\w+ \w+$/); // pseudonym, not "Ravi Kumar"
    expect(comments[0].body).toContain("<script>"); // stored as text; React escapes it
    const notes = (await adminDb.collection("notifications").get()).docs.map((d) => d.data());
    expect(notes.some((n) => n.type === "comment")).toBe(true);
    const audit = (await adminDb.collection("auditLogs").get()).docs.find(
      (d) => d.get("action") === "comment.create",
    );
    expect(JSON.stringify(audit?.data())).not.toContain("wing");
  });

  it("validates length and rate-limits to 10 per 10 minutes", async () => {
    const id = await create(alice);
    expect(await comment(bob, id, "x".repeat(1001))).toBe(400);
    for (let i = 0; i < 10; i++) expect(await comment(bob, id, `comment ${i}`)).toBe(200);
    expect(await comment(bob, id, "one too many")).toBe(429);
  });

  it("lets moderators hide a comment with a reason; others stop seeing it", async () => {
    const id = await create(alice);
    await comment(bob, id, "Names someone in room 215");
    const [m] = (await list(alice, id)).comments;
    const hide = async (token: string) =>
      (
        await hideCommentRoute(
          await authedRequest(token, "http://localhost/api/x", {
            method: "POST",
            body: JSON.stringify({ reason: "Names a resident" }),
          }),
          { params: Promise.resolve({ id, commentId: m.id }) },
        )
      ).status;
    expect(await hide(alice)).toBe(403);
    expect(await hide(committee)).toBe(200);
    expect((await list(alice, id)).comments).toHaveLength(0);
    expect((await list(committee, id)).comments[0].hidden).toEqual({ reason: "Names a resident" });
    expect(await audits()).toContain("comment.hide");
  });

  it("keeps confidential threads between the reporter and admins", async () => {
    const id = await create(alice, { visibility: "confidential" });
    expect(await comment(bob, id, "Can I see this?")).toBe(404);
    expect(await comment(alice, id, "More detail for the admin")).toBe(200);
    expect((await list(adminToken, id)).comments).toHaveLength(1);
    const toAdmin = (
      await adminDb.collection("notifications").where("recipientUid", "==", admin.uid).get()
    ).docs
      .map((d) => d.data())
      .find((n) => n.type === "comment");
    expect(toAdmin?.body).toBeNull();
  });
});

describe("reports and moderation (§11.3)", () => {
  const report = async (token: string, body: Record<string, unknown>) =>
    (
      await reportRoute(
        await authedRequest(token, "http://localhost/api/reports", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        undefined as never,
      )
    ).status;
  const queue = async (token: string) => {
    const res = await moderationGet(await authedRequest(token), undefined as never);
    return { status: res.status, body: await res.json() };
  };
  const resolve = async (token: string, reportId: string, action: "keep" | "hide") =>
    (
      await moderationPost(
        await authedRequest(token, "http://localhost/api/x", {
          method: "POST",
          body: JSON.stringify({ action }),
        }),
        { params: Promise.resolve({ reportId }) },
      )
    ).status;

  it("queues one report per person per thing; only moderators can see or act", async () => {
    const id = await create(alice);
    expect(await report(bob, { complaintId: id, reason: "spam" })).toBe(200);
    expect(await report(bob, { complaintId: id, reason: "other", note: "changed my mind" })).toBe(
      200,
    );
    expect((await adminDb.collection("reports").get()).size).toBe(1);
    expect((await queue(alice)).status).toBe(403);
    const { body } = await queue(committee);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ targetType: "complaint", ticketId: "CR-000001" });
    expect(JSON.stringify(body)).not.toMatch(/Ravi|231002/); // who reported stays private
    expect(await resolve(alice, body.items[0].id, "hide")).toBe(403);
  });

  it("hiding a reported comment resolves every report on it", async () => {
    const id = await create(alice);
    await commentsPost(
      await authedRequest(bob, "http://localhost/api/x", {
        method: "POST",
        body: JSON.stringify({ body: "Rude remark" }),
      }),
      { params: Promise.resolve({ id }) },
    );
    const commentId = (await adminDb.collection(`complaints/${id}/comments`).get()).docs[0].id;
    await report(alice, { complaintId: id, commentId, reason: "harassment" });
    await report(committee, { complaintId: id, commentId, reason: "harassment" });
    const { body } = await queue(adminToken);
    expect(await resolve(committee, body.items[0].id, "hide")).toBe(200);
    const hidden = (await adminDb.doc(`complaints/${id}/comments/${commentId}`).get()).get(
      "hidden",
    );
    expect(hidden).toBe(true);
    const statuses = (await adminDb.collection("reports").get()).docs.map((d) => d.get("status"));
    expect(statuses).toEqual(["resolved", "resolved"]);
    expect(await audits()).toContain("report.resolve");
  });

  it("unpublishes a reported photo without touching the complaint", async () => {
    const id = await create(alice);
    const img = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#888" } })
      .jpeg()
      .toBuffer();
    const form = new FormData();
    form.append("photo", new File([new Uint8Array(img)], "p.jpg", { type: "image/jpeg" }));
    await photoRoute(
      await authedRequest(alice, "http://localhost/api/x", { method: "POST", body: form }),
      { params: Promise.resolve({ id }) },
    );
    const photoId = (await adminDb.collection(`complaints/${id}/attachments`).get()).docs[0].id;
    expect((await view(bob, id)).photos).toHaveLength(1);
    await report(bob, { complaintId: id, photoId, reason: "inappropriate_photo" });
    const { body } = await queue(adminToken);
    expect(body.items[0].preview.photoUrl).toBeTruthy();
    expect(await resolve(adminToken, body.items[0].id, "hide")).toBe(200);
    expect((await view(bob, id)).photos).toHaveLength(0);
    expect((await view(alice, id)).photos).toHaveLength(1);
    expect(await pub(id)).toBeTruthy();
  });

  it("keeps reports about confidential complaints away from the committee", async () => {
    const id = await create(alice, { visibility: "confidential" });
    expect(await report(bob, { complaintId: id, reason: "spam" })).toBe(404);
    expect(await report(alice, { complaintId: id, reason: "other", note: "wrong category" })).toBe(
      200,
    );
    expect((await queue(committee)).body.items).toHaveLength(0);
    expect((await queue(adminToken)).body.items).toHaveLength(1);
  });
});

describe("duplicates (FR-08) and generic names", () => {
  it("closes the duplicate, adds its support to the primary, and keeps both histories", async () => {
    const primary = await create(alice);
    const dup = await create(bob);
    await supportRoute(
      await authedRequest(committee, "http://localhost/api/x", { method: "POST" }),
      { params: Promise.resolve({ id: dup }) },
    );
    const merged = await act(adminToken, dup, { type: "duplicate", primaryTicketId: "cr-000001" });
    expect(merged.status).toBe(200);
    expect(await doc(dup)).toMatchObject({
      status: "closed",
      closureReason: "duplicate",
      duplicateOf: primary,
    });
    expect((await doc(primary)).supportCount).toBe(2); // the dup's reporter + its supporter
    expect((await pub(primary))?.supportCount).toBe(2);
    expect((await view(bob, dup)).mergedInto).toEqual({ id: primary, ticketId: "CR-000001" });
    const notes = (await adminDb.collection(`complaints/${primary}/events`).get()).docs.map((d) =>
      d.get("note"),
    );
    expect(notes).toContain("CR-000002 was merged into this complaint.");
    expect((await adminDb.collection(`complaints/${dup}/events`).get()).size).toBeGreaterThan(1);
  });

  it("never reveals a confidential side through the link", async () => {
    await create(alice, { visibility: "confidential" }); // CR-000001
    const publicDup = await create(bob); // CR-000002
    await act(adminToken, publicDup, { type: "duplicate", primaryTicketId: "CR-000001" });
    const asOther = await view(committee, publicDup);
    expect(asOther.mergedInto).toBe("hidden");
    expect(JSON.stringify(asOther)).not.toContain("CR-000001");

    const secretDup = await create(bob, { visibility: "confidential" }); // CR-000003
    const publicPrimary = await create(alice); // CR-000004
    await act(adminToken, secretDup, { type: "duplicate", primaryTicketId: "CR-000004" });
    const seen = JSON.stringify(await view(committee, publicPrimary));
    expect(seen).not.toContain("CR-000003");
    expect(seen).toContain("Another report was merged");
  });

  it("refuses bad merges and non-staff", async () => {
    const a = await create(alice);
    const b = await create(bob);
    const merge = (token: string, id: string, t: string) =>
      act(token, id, { type: "duplicate", primaryTicketId: t });
    expect((await merge(adminToken, a, "CR-000001")).status).toBe(400); // itself
    expect((await merge(adminToken, a, "CR-999999")).status).toBe(400); // unknown
    expect((await merge(bob, b, "CR-000001")).status).toBe(403);
    await merge(adminToken, b, "CR-000001");
    const c = await create(committee);
    expect((await merge(adminToken, c, "CR-000002")).status).toBe(400); // into a duplicate
  });

  it("lets admins replace the pseudonym with a generic name", async () => {
    const id = await create(alice);
    expect((await act(adminToken, id, { type: "anonymize" })).status).toBe(200);
    expect((await pub(id))?.reporterLabel).toBe("A resident");
    expect((await act(adminToken, id, { type: "anonymize" })).status).toBe(409);
  });
});

describe("dashboards (FR-14)", () => {
  const dash = async (token: string) =>
    (
      await dashboardRoute(
        await authedRequest(token, "http://localhost/api/dashboard?days=7"),
        undefined as never,
      )
    ).json();

  it("records stats in the same transactions and shapes the dashboard by role", async () => {
    const a = await create(alice);
    await create(bob, { visibility: "confidential", categoryId: "mess", subcategoryId: null });
    await act(adminToken, a, { type: "assign", contactId: "maintenance" });
    await act(adminToken, a, { type: "resolve", note: "Fixed it" });

    const student = await dash(bob);
    expect(student.hostel).toMatchObject({
      created: 2,
      byCategory: { infrastructure: 1, mess: 1 },
      resolutionRate: { resolved: 1, eligible: 2, rate: 0.5 },
      onTimeRate: { onTime: 1, total: 1 },
    });
    expect(student.mine).toMatchObject({ submitted: 1 });
    expect(student.staff).toBeUndefined();
    expect(student.committee).toBeUndefined();
    expect(student.hostel.workload).toBeUndefined();

    const staff = await dash(adminToken);
    expect(staff.staff.live.byStatus).toMatchObject({ submitted: 1, resolved: 1 });
    expect(staff.staff.workload).toEqual([
      { name: "Hostel maintenance (dev placeholder)", assigned: 1, updates: 1 },
    ]);
    expect(staff.range.days).toBe(7);

    const com = await dash(committee);
    expect(com.committee.live.byStatus.submitted).toBe(0); // the open one is confidential
    expect(com.staff).toBeUndefined();

    for (const d of [student, staff, com])
      expect(JSON.stringify(d)).not.toMatch(/Asha|Ravi|231001|214/);
  });
});

describe("CSV export (FR-15)", () => {
  const exportCsv = async (token: string, qs: string) =>
    exportRoute(
      await authedRequest(token, `http://localhost/api/admin/export?${qs}`),
      undefined as never,
    );
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const range = `from=${today}&to=${today}`;

  it("needs the export permission", async () => {
    await create(alice);
    expect((await exportCsv(alice, range)).status).toBe(403);
    expect((await exportCsv(committee, range)).status).toBe(403);
  });

  it("exports allowlisted columns, leaves confidential rows out unless asked, and audits", async () => {
    await create(alice, { title: '=HYPERLINK("http://evil","click")' });
    await create(bob, { visibility: "confidential", title: "Private roommate matter" });
    const res = await exportCsv(adminToken, range);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const csv = await res.text();
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(2); // header + the public complaint
    expect(lines[0]).toContain("ticket_id,created_at_ist,title");
    expect(lines[1]).toContain(`"'=HYPERLINK(`);
    expect(csv).not.toMatch(/214|Asha|231001|leaking all night|Private roommate/);

    const withConf = await (await exportCsv(adminToken, `${range}&confidential=1`)).text();
    expect(withConf.trim().split("\r\n")).toHaveLength(3);
    expect(withConf).toContain("Private roommate matter");
    expect(withConf).not.toMatch(/214|Ravi|231002/);
    expect(await audits()).toContain("export.csv");
  });

  it("rejects bad ranges", async () => {
    expect((await exportCsv(adminToken, "from=2026-01-01&to=2027-06-01")).status).toBe(400);
    expect((await exportCsv(adminToken, "from=yesterday&to=today")).status).toBe(400);
  });
});

describe("retention (PRD §14.2)", () => {
  const DAY = 86_400_000;
  async function closedComplaint(
    daysAgo: number,
    extra: Record<string, unknown> = {},
    whileOpen?: (id: string) => Promise<void>,
  ) {
    const id = await create(alice);
    await whileOpen?.(id);
    await act(adminToken, id, { type: "assign", contactId: "maintenance" });
    await act(adminToken, id, { type: "resolve", note: "Fixed it" });
    await act(alice, id, { type: "confirm" });
    await adminDb
      .doc(`complaints/${id}`)
      .update({ closedAt: Timestamp.fromMillis(Date.now() - daysAgo * DAY), ...extra });
    return id;
  }

  it("does nothing to complaints while switched off", async () => {
    const old = await closedComplaint(400);
    expect(await runRetention(Date.now(), false)).toMatchObject({ enabled: false, complaints: 0 });
    expect((await adminDb.doc(`complaints/${old}`).get()).exists).toBe(true);
  });

  it("deletes year-old closed complaints with everything attached, and keeps the rest", async () => {
    // A photo hanging off the old complaint, added while it was open.
    const img = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#888" } })
      .jpeg()
      .toBuffer();
    const old = await closedComplaint(400, {}, async (id) => {
      const form = new FormData();
      form.append("photo", new File([new Uint8Array(img)], "p.jpg", { type: "image/jpeg" }));
      await photoRoute(
        await authedRequest(alice, "http://localhost/api/x", { method: "POST", body: form }),
        { params: Promise.resolve({ id }) },
      );
    });
    const recent = await closedComplaint(30);
    const held = await closedComplaint(400, { retentionHold: true });
    const key = (await adminDb.collection(`complaints/${old}/attachments`).get()).docs[0].get(
      "key",
    );
    const file = path.join(process.cwd(), ".data", "uploads", ...key.split("/"));
    await commentsPost(
      await authedRequest(bob, "http://localhost/api/x", {
        method: "POST",
        body: JSON.stringify({ body: "Same here" }),
      }),
      { params: Promise.resolve({ id: old }) },
    );
    await adminDb
      .collection("auditLogs")
      .add({ action: "x", at: Timestamp.fromMillis(Date.now() - 400 * DAY) });

    const r = await runRetention(Date.now(), true);
    expect(r).toMatchObject({ enabled: true, complaints: 1, auditLogs: 1 });
    expect((await adminDb.doc(`complaints/${old}`).get()).exists).toBe(false);
    expect((await adminDb.collection(`complaints/${old}/comments`).get()).size).toBe(0);
    expect((await adminDb.collection(`complaints/${old}/events`).get()).size).toBe(0);
    expect((await adminDb.doc(`publicComplaints/${old}`).get()).exists).toBe(false);
    expect(
      (await adminDb.collection("notifications").where("complaintId", "==", old).get()).size,
    ).toBe(0);
    expect(existsSync(file)).toBe(false);
    for (const kept of [recent, held])
      expect((await adminDb.doc(`complaints/${kept}`).get()).exists).toBe(true);
    expect(await audits()).toContain("complaint.retention_delete");
    // Aggregates stay: they count, they don't identify anyone.
    expect((await adminDb.collection("stats").get()).size).toBeGreaterThan(0);
  });
});

describe("security acceptance (PRD §15.2)", () => {
  it("rate-limits repeated uploads", async () => {
    const unknown = "0".repeat(20); // limit is counted before anything else, even for a bad id
    const tiny = Buffer.from([0xff, 0xd8, 0xff]);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const form = new FormData();
      form.append("photo", new File([new Uint8Array(tiny)], "p.jpg", { type: "image/jpeg" }));
      const res = await photoRoute(
        await authedRequest(bob, "http://localhost/api/x", { method: "POST", body: form }),
        { params: Promise.resolve({ id: unknown }) },
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("audits every staff and committee workflow action with actor and target", async () => {
    const id = await create(alice);
    const steps: [string, Record<string, unknown>][] = [
      [adminToken, { type: "assign", contactId: "maintenance" }],
      [adminToken, { type: "start", note: "On it" }],
      [adminToken, { type: "note", note: "Part ordered" }],
      [adminToken, { type: "priority", priority: "critical", reason: "Spreading" }],
      [committee, { type: "escalate", reason: "Taking long" }],
      [adminToken, { type: "hide", reason: "Names someone" }],
      [adminToken, { type: "unhide" }],
      [adminToken, { type: "anonymize" }],
      [adminToken, { type: "resolve", note: "Done" }],
    ];
    for (const [token, body] of steps) expect((await act(token, id, body)).status).toBe(200);
    const logs = (
      await adminDb.collection("auditLogs").where("target.id", "==", id).get()
    ).docs.map((d) => d.data());
    for (const [, body] of steps) {
      const log = logs.find((l) => l.action === `complaint.${body.type}`);
      expect(log, `audit for ${body.type}`).toBeTruthy();
      expect(log!.actorUid).toBeTruthy();
      expect(JSON.stringify(log!.meta)).not.toMatch(
        /On it|Part ordered|Spreading|Names someone|Done/,
      );
    }
  });
});

describe("backup and restore (FR-16)", () => {
  it("round-trips through age encryption into an empty project, and reconciles photos", async () => {
    const id = await create(alice);
    await act(adminToken, id, { type: "assign", contactId: "maintenance" });
    await commentsPost(
      await authedRequest(bob, "http://localhost/api/x", {
        method: "POST",
        body: JSON.stringify({ body: "Same here" }),
      }),
      { params: Promise.resolve({ id }) },
    );
    const img = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#888" } })
      .jpeg()
      .toBuffer();
    const form = new FormData();
    form.append("photo", new File([new Uint8Array(img)], "p.jpg", { type: "image/jpeg" }));
    await photoRoute(
      await authedRequest(alice, "http://localhost/api/x", { method: "POST", body: form }),
      { params: Promise.resolve({ id }) },
    );
    const before = (await adminDb.doc(`complaints/${id}`).get()).data()!;

    const backup = await exportBackup();
    expect(backup.counts).toMatchObject({
      complaints: 1,
      "complaints/comments": 1,
      "complaints/attachments": 1,
    });
    expect(backup.attachments).toHaveLength(1);
    expect(backup.collections.activationCodes).toBeUndefined();

    // Same encryption the scripts use: only the identity holder can read it.
    const identity = await generateX25519Identity();
    const e = new Encrypter();
    e.addRecipient(await identityToRecipient(identity));
    const sealed = await e.encrypt(JSON.stringify(backup));
    expect(Buffer.from(sealed).toString("latin1")).not.toContain("Tap leaking");
    const d = new Decrypter();
    d.addIdentity(identity);
    const opened = JSON.parse(await d.decrypt(sealed, "text"));

    await expect(restoreBackup(opened)).rejects.toThrow(/already has complaints/);
    await resetEmulators(); // a fresh, empty project; photo files stay in storage
    const r = await restoreBackup(opened);
    expect(r.mismatches).toEqual([]);
    expect(r.missingAttachments).toEqual([]);
    const after = (await adminDb.doc(`complaints/${id}`).get()).data()!;
    expect(after.createdAt.toMillis()).toBe(before.createdAt.toMillis());
    expect(after).toMatchObject({
      ticketId: before.ticketId,
      status: "assigned",
      reporterUid: before.reporterUid,
    });
    expect((await adminDb.collection(`complaints/${id}/comments`).get()).size).toBe(1);

    // A photo lost from storage shows up in the reconciliation.
    rmSync(path.join(process.cwd(), ".data", "uploads", ...backup.attachments[0].key.split("/")));
    await resetEmulators();
    expect((await restoreBackup(opened)).missingAttachments).toEqual([backup.attachments[0].key]);
  });
});

describe("photos after resolution", () => {
  it("are refused once the complaint is resolved", async () => {
    const id = await create(alice);
    await act(adminToken, id, { type: "assign", contactId: "maintenance" });
    await act(adminToken, id, { type: "resolve", note: "Fixed it" });
    const img = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#888" } })
      .jpeg()
      .toBuffer();
    const form = new FormData();
    form.append("photo", new File([new Uint8Array(img)], "p.jpg", { type: "image/jpeg" }));
    const res = await photoRoute(
      await authedRequest(alice, "http://localhost/api/x", { method: "POST", body: form }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(409);
    expect((await view(alice, id)).canAddPhotos).toBe(false);
  });
});
