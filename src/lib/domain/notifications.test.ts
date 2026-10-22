import { describe, expect, it } from "vitest";
import type { ComplaintRecord } from "./complaint";
import { dedupeKey, notificationsFor } from "./notifications";

const c = {
  ticketId: "CR-000007",
  title: "Dal served cold",
  reporterUid: "reporter",
  visibility: "public",
} as ComplaintRecord<number>;
const admins = ["admin1", "admin2"];

describe("notificationsFor (FR-13)", () => {
  it("tells the reporter about progress and the outcome", () => {
    const [n] = notificationsFor("resolved", c, { actorUid: "admin1", adminUids: admins });
    expect(n).toMatchObject({
      recipientUid: "reporter",
      title: "Is CR-000007 fixed?",
      essential: true,
    });
    expect(
      notificationsFor("note", c, {
        actorUid: "admin1",
        adminUids: admins,
        note: "Part ordered",
      })[0],
    ).toMatchObject({ recipientUid: "reporter", body: "Part ordered", essential: false });
  });

  it("tells admins about new, critical and reopened complaints, never the actor", () => {
    expect(
      notificationsFor("created", c, { actorUid: "reporter", adminUids: admins }).map(
        (n) => n.recipientUid,
      ),
    ).toEqual(admins);
    const [crit] = notificationsFor("created", c, {
      actorUid: "reporter",
      adminUids: admins,
      critical: true,
    });
    expect(crit).toMatchObject({ title: "Critical: CR-000007", essential: true });
    expect(
      notificationsFor("reopened", c, { actorUid: "reporter", adminUids: admins }),
    ).toHaveLength(2);
    const esc = notificationsFor("escalated", c, { actorUid: "admin1", adminUids: admins });
    expect(esc.map((n) => n.recipientUid).sort()).toEqual(["admin2", "reporter"]);
  });

  it("puts no complaint content in confidential previews (§12.4)", () => {
    const secret = { ...c, visibility: "confidential" } as ComplaintRecord<number>;
    for (const type of ["created", "assigned", "note", "resolved"] as const) {
      const all = notificationsFor(type, secret, {
        actorUid: null,
        adminUids: admins,
        note: "private note",
      });
      for (const n of all) {
        expect(n.body).toBeNull();
        expect(n.title).not.toContain("Dal");
      }
    }
  });

  it("stays quiet for events nobody needs to hear about", () => {
    for (const type of ["confirmed", "unhidden", "priority"] as const)
      expect(notificationsFor(type, c, { actorUid: null, adminUids: admins })).toEqual([]);
  });

  it("dedupes by type, ticket, person and bucket", () => {
    const n = { type: "note" as const, recipientUid: "reporter" };
    expect(dedupeKey(n, "abc", 5)).toBe(dedupeKey(n, "abc", 5));
    expect(dedupeKey(n, "abc", 5)).not.toBe(dedupeKey(n, "abc", 6));
  });
});
