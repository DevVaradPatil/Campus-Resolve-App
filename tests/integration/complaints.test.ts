import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { PUT as saveConfigRoute } from "@/app/api/admin/config/[kind]/route";
import { GET as getComplaintRoute } from "@/app/api/complaints/[id]/route";
import { POST as photoRoute } from "@/app/api/complaints/[id]/photos/route";
import { GET as mineRoute } from "@/app/api/complaints/mine/route";
import { POST as createRoute } from "@/app/api/complaints/route";
import { GET as fileRoute } from "@/app/api/files/[...key]/route";
import { DEFAULT_CATEGORIES, DEV_BLOCKS, DEV_CONTACTS, DEV_ROUTING } from "@/lib/domain/defaults";
import { activate, importRoster, issueCodes, login } from "@/lib/server/accounts";
import type { SessionUser } from "@/lib/server/auth";
import { seedConfig } from "@/lib/server/config";
import { adminDb } from "@/lib/server/firebase-admin";
import { ADMIN_PASSWORD, authedRequest, resetEmulators, ROSTER_CSV, seedAdmin } from "./helpers";

let admin: SessionUser;
let alice: string; // tokens
let bob: string;

async function studentToken(roll: string) {
  const { issued } = await issueCodes(admin, [roll]);
  return (
    await activate(
      { rollNumber: roll, code: issued[0].code, password: "a-long-password" },
      "10.0.0.1",
    )
  ).token;
}

let keySeq = 0;
const complaint = (over: Record<string, unknown> = {}) => ({
  idempotencyKey: `test-key-${String(++keySeq).padStart(8, "0")}`,
  categoryId: "infrastructure",
  subcategoryId: "plumbing",
  title: "Tap leaking in the bathroom",
  description: "The tap has been leaking all night and the floor is wet.",
  location: { blockId: "b", floorId: "2", type: "room", roomReference: "214", description: null },
  urgent: false,
  visibility: "public",
  ...over,
});

async function create(token: string, body: unknown) {
  const res = await createRoute(
    await authedRequest(token, "http://localhost/api/complaints", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    undefined as never,
  );
  return { status: res.status, body: await res.json() };
}

async function view(token: string, id: string) {
  const res = await getComplaintRoute(await authedRequest(token), {
    params: Promise.resolve({ id }),
  });
  return { status: res.status, body: await res.json() };
}

async function upload(token: string, id: string, bytes: Buffer, name = "photo.jpg") {
  const form = new FormData();
  form.append("photo", new File([new Uint8Array(bytes)], name, { type: "image/jpeg" }));
  const res = await photoRoute(
    await authedRequest(token, "http://localhost/api/x", { method: "POST", body: form }),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, body: await res.json() };
}

const jpegWithExif = () =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: "#3366cc" } })
    .jpeg()
    .withExif({ IFD0: { Copyright: "secret-exif-marker" } })
    .toBuffer();

const auditActions = async () =>
  (await adminDb.collection("auditLogs").get()).docs.map((d) => d.get("action"));

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
});

describe("submit (FR-03, FR-05, FR-06)", () => {
  it("creates ticket, event, audit, routing and a public projection without private data", async () => {
    const { status, body } = await create(alice, complaint());
    expect(status).toBe(200);
    expect(body.ticketId).toBe("CR-000001");

    const c = (await adminDb.doc(`complaints/${body.id}`).get()).data()!;
    expect(c).toMatchObject({
      status: "submitted",
      priority: "high",
      priorityRule: "infrastructure/plumbing",
      routing: { contactId: "maintenance", ruleId: "infrastructure" },
      locationLabel: ["Block B", "Second floor", "Room"],
    });
    const events = await adminDb.collection(`complaints/${body.id}/events`).get();
    expect(events.docs.map((d) => d.get("type"))).toEqual(["created"]);
    expect(await auditActions()).toContain("complaint.create");

    const pub = (await adminDb.doc(`publicComplaints/${body.id}`).get()).data()!;
    expect(pub.ticketId).toBe("CR-000001");
    expect(JSON.stringify(pub)).not.toMatch(/214|reporterUid|231001|Asha/);
    expect(JSON.stringify(pub)).not.toContain(c.reporterUid);
  });

  it("issues sequential IDs and treats a retried submit as the same ticket", async () => {
    const first = complaint();
    const a = await create(alice, first);
    const again = await create(alice, first);
    const b = await create(bob, complaint());
    expect(again.body).toEqual(a.body);
    expect([a.body.ticketId, b.body.ticketId]).toEqual(["CR-000001", "CR-000002"]);
    expect((await adminDb.collection("complaints").get()).size).toBe(2);
  });

  it("routes unmatched categories to the admin fallback queue", async () => {
    const { body } = await create(alice, complaint({ categoryId: "other", subcategoryId: null }));
    expect((await adminDb.doc(`complaints/${body.id}`).get()).get("routing")).toEqual({
      contactId: null,
      ruleId: null,
    });
  });

  it("escalates critical complaints immediately; the urgent flag never raises priority", async () => {
    const crit = await create(
      alice,
      complaint({ categoryId: "water-utilities", subcategoryId: "no-drinking-water" }),
    );
    const c = (await adminDb.doc(`complaints/${crit.body.id}`).get()).data()!;
    expect(c).toMatchObject({ priority: "critical", escalated: true });
    const types = (await adminDb.collection(`complaints/${crit.body.id}/events`).get()).docs.map(
      (d) => d.get("type"),
    );
    expect(types.sort()).toEqual(["created", "escalated"]);

    const urgent = await create(alice, complaint({ subcategoryId: "furniture", urgent: true }));
    expect((await adminDb.doc(`complaints/${urgent.body.id}`).get()).data()).toMatchObject({
      priority: "low",
      urgentFlag: true,
    });
  });

  it("rejects input that doesn't match config or limits", async () => {
    expect((await create(alice, complaint({ categoryId: "nope" }))).status).toBe(400);
    expect((await create(alice, complaint({ subcategoryId: "nope" }))).status).toBe(400);
    const loc = {
      blockId: null,
      floorId: "2",
      type: "room",
      roomReference: null,
      description: null,
    };
    expect((await create(alice, complaint({ location: loc }))).status).toBe(400);
    expect((await create(alice, complaint({ title: "x".repeat(121) }))).status).toBe(400);
    expect((await create(alice, complaint({ visibility: "everyone" }))).status).toBe(400);
    expect((await adminDb.collection("complaints").get()).size).toBe(0);
  });

  it("rate-limits submissions to 5 per hour", async () => {
    for (let i = 0; i < 5; i++) expect((await create(alice, complaint())).status).toBe(200);
    expect((await create(alice, complaint())).status).toBe(429);
  });
});

describe("visibility", () => {
  it("keeps confidential complaints out of the public feed and away from other students", async () => {
    const { body } = await create(alice, complaint({ visibility: "confidential" }));
    expect((await adminDb.doc(`publicComplaints/${body.id}`).get()).exists).toBe(false);
    expect((await view(bob, body.id)).status).toBe(404);

    const own = await view(alice, body.id);
    expect(own.body).toMatchObject({ viewer: "owner", details: { roomReference: "214" } });

    const { token } = await login(
      { loginId: "admin:warden", password: ADMIN_PASSWORD },
      "10.0.0.1",
    );
    expect((await view(token, body.id)).body.viewer).toBe("staff");
  });

  it("shows other students only the public shape of a public complaint", async () => {
    const { body } = await create(alice, complaint());
    const res = await view(bob, body.id);
    expect(res.body).toMatchObject({ viewer: "public", details: null, canAddPhotos: false });
    expect(res.body.reporterLabel).toMatch(/^\w+ \w+$/);
    expect(JSON.stringify(res.body)).not.toMatch(/214|231001|Asha/);
  });

  it("lists only the caller's own complaints", async () => {
    await create(alice, complaint());
    await create(bob, complaint({ visibility: "confidential" }));
    const res = await mineRoute(await authedRequest(alice), undefined as never);
    const { items } = await res.json();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ ticketId: "CR-000001", confidential: false });
  });
});

describe("photos (FR-04)", () => {
  it("re-encodes to WebP, strips EXIF and serves via a signed URL", async () => {
    const { body } = await create(alice, complaint());
    const up = await upload(alice, body.id, await jpegWithExif());
    expect(up.status).toBe(200);

    const att = (
      await adminDb.collection(`complaints/${body.id}/attachments`).get()
    ).docs[0].data();
    expect(att).toMatchObject({ contentType: "image/webp", privacy: "public" });
    const stored = await readFile(
      path.join(process.cwd(), ".data", "uploads", ...att.key.split("/")),
    );
    const meta = await sharp(stored).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(stored.includes("secret-exif-marker")).toBe(false);
    expect(await auditActions()).toContain("attachment.upload");

    // Another student sees the public photo; the signed URL serves it, a tampered one doesn't.
    const { photos } = (await view(bob, body.id)).body;
    expect(photos).toHaveLength(1);
    const url = new URL(photos[0].url, "http://localhost");
    const key = url.pathname.replace("/api/files/", "").split("/");
    const ok = await fileRoute(new Request(url), { params: Promise.resolve({ key }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/webp");
    url.searchParams.set("sig", "forged");
    expect((await fileRoute(new Request(url), { params: Promise.resolve({ key }) })).status).toBe(
      403,
    );
  });

  it("rejects SVG, disguised and corrupt files, and oversized ones", async () => {
    const { body } = await create(alice, complaint());
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    expect((await upload(alice, body.id, svg, "x.jpg")).status).toBe(400);
    expect((await upload(alice, body.id, Buffer.from("MZ executable"), "x.png")).status).toBe(400);
    const corrupt = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(200, 7)]);
    expect((await upload(alice, body.id, corrupt)).status).toBe(400);
    const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(5 * 1024 * 1024)]);
    expect((await upload(alice, body.id, huge)).status).toBe(413);
    expect((await adminDb.collection(`complaints/${body.id}/attachments`).get()).size).toBe(0);
  });

  it("caps photos at 3 and lets only the owner upload", async () => {
    const { body } = await create(alice, complaint());
    const img = await jpegWithExif();
    expect((await upload(bob, body.id, img)).status).toBe(404);
    for (let i = 0; i < 3; i++) expect((await upload(alice, body.id, img)).status).toBe(200);
    expect((await upload(alice, body.id, img)).status).toBe(400);
  });

  it("keeps photos on confidential complaints private", async () => {
    const { body } = await create(alice, complaint({ visibility: "confidential" }));
    await upload(alice, body.id, await jpegWithExif());
    const att = (await adminDb.collection(`complaints/${body.id}/attachments`).get()).docs[0];
    expect(att.get("privacy")).toBe("private");
    expect((await view(bob, body.id)).status).toBe(404);
    expect((await view(alice, body.id)).body.photos).toHaveLength(1);
  });
});

describe("config admin", () => {
  it("lets admins upsert config with audit, and nobody else", async () => {
    const item = { ...DEV_BLOCKS[0], label: "Block A (new wing)" };
    const put = async (token: string, body: unknown) =>
      saveConfigRoute(
        await authedRequest(token, "http://localhost/api/admin/config/locations", {
          method: "PUT",
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ kind: "locations" }) },
      );
    expect((await put(alice, item)).status).toBe(403);
    const { token } = await login(
      { loginId: "admin:warden", password: ADMIN_PASSWORD },
      "10.0.0.1",
    );
    expect((await put(token, { ...item, id: "Bad Id" })).status).toBe(400);
    expect((await put(token, item)).status).toBe(200);
    expect((await adminDb.doc("locations/a").get()).get("label")).toBe("Block A (new wing)");
    expect(await auditActions()).toContain("config.update");
  });
});
