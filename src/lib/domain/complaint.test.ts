import { describe, expect, it } from "vitest";
import {
  firstActionDeadline,
  priorityFor,
  routeComplaint,
  safeLocationLabel,
  searchTokens,
  toPublicComplaint,
  type ComplaintRecord,
} from "./complaint";
import { DEFAULT_CATEGORIES, DEV_BLOCKS, DEV_CONTACTS, DEV_ROUTING } from "./defaults";
import { categorySchema, blockSchema, contactSchema, routingRuleSchema } from "./schemas";

const cat = (id: string) => DEFAULT_CATEGORIES.find((c) => c.id === id)!;

describe("defaults", () => {
  it("all pass their admin schemas", () => {
    DEFAULT_CATEGORIES.forEach((c) => categorySchema.parse(c));
    DEV_BLOCKS.forEach((b) => blockSchema.parse(b));
    DEV_CONTACTS.forEach((c) => contactSchema.parse(c));
    DEV_ROUTING.forEach((r) => routingRuleSchema.parse(r));
  });
});

describe("priorityFor", () => {
  it("uses the subcategory override, else the category default", () => {
    expect(priorityFor(cat("water-utilities"), "no-drinking-water")).toEqual({
      priority: "critical",
      rule: "water-utilities/no-drinking-water",
    });
    expect(priorityFor(cat("water-utilities"), "drainage")).toEqual({
      priority: "high",
      rule: "water-utilities",
    });
    expect(priorityFor(cat("mess"), null)).toEqual({ priority: "normal", rule: "mess" });
    expect(priorityFor(cat("mess"), "unknown")).toEqual({ priority: "normal", rule: "mess" });
  });
});

describe("firstActionDeadline", () => {
  it("follows PRD §6.2 targets", () => {
    const h = (p: Parameters<typeof firstActionDeadline>[0]) =>
      firstActionDeadline(p, 0) / 3600_000;
    expect([h("critical"), h("high"), h("normal"), h("low")]).toEqual([1, 8, 48, 120]);
  });
});

describe("routeComplaint (FR-06)", () => {
  const contacts = [
    ...DEV_CONTACTS,
    { ...DEV_CONTACTS[0], id: "block-b-warden" },
    { ...DEV_CONTACTS[0], id: "retired", active: false },
  ];
  const rules = [
    ...DEV_ROUTING,
    {
      id: "b-infra",
      categoryId: "infrastructure",
      blockId: "b",
      contactId: "block-b-warden",
      enabled: true,
    },
    { id: "dead", categoryId: "other", blockId: null, contactId: "retired", enabled: true },
    { id: "off", categoryId: "mess", blockId: "a", contactId: "housekeeping", enabled: false },
  ];
  it("prefers category+block over category", () => {
    expect(routeComplaint(rules, contacts, "infrastructure", "b").contactId).toBe("block-b-warden");
    expect(routeComplaint(rules, contacts, "infrastructure", "a").contactId).toBe("maintenance");
  });
  it("skips disabled rules and inactive contacts, then falls back to the admin queue", () => {
    expect(routeComplaint(rules, contacts, "mess", "a").contactId).toBe("mess-committee");
    expect(routeComplaint(rules, contacts, "other", null)).toEqual({
      contactId: null,
      ruleId: null,
    });
  });
});

describe("safeLocationLabel", () => {
  it("builds a public label and never includes the room or free text", () => {
    const label = safeLocationLabel(
      { blockId: "b", floorId: "2", type: "room", roomReference: "214", description: "near 214" },
      DEV_BLOCKS,
    );
    expect(label).toEqual(["Block B", "Second floor", "Room"]);
    expect(label.join(" ")).not.toMatch(/214/);
  });
  it("labels block-less issues as hostel-wide", () => {
    expect(
      safeLocationLabel(
        { blockId: null, floorId: null, type: "mess", roomReference: null, description: null },
        DEV_BLOCKS,
      ),
    ).toEqual(["Hostel-wide", "Mess"]);
  });
});

describe("searchTokens", () => {
  it("lowercases, dedupes and drops 1-letter words", () => {
    expect(searchTokens("No water in B-block, no WATER!")).toEqual(["no", "water", "in", "block"]);
  });
});

describe("toPublicComplaint", () => {
  const record: ComplaintRecord<number> = {
    ticketId: "CR-000001",
    title: "Leaking tap",
    description: "Tap leaks all night",
    categoryId: "infrastructure",
    categoryLabel: "Infrastructure",
    subcategoryId: "plumbing",
    subcategoryLabel: "Plumbing or leak",
    location: { blockId: "b", floorId: "2", type: "room", roomReference: "214", description: "x" },
    locationLabel: ["Block B", "Second floor", "Room"],
    priority: "high",
    priorityRule: "infrastructure/plumbing",
    urgentFlag: true,
    reporterUid: "secret-uid",
    reporterLabel: "Quiet Heron",
    visibility: "public",
    status: "submitted",
    escalated: false,
    hidden: false,
    routing: { contactId: "maintenance", ruleId: "infrastructure" },
    assignedContactId: null,
    supportCount: 0,
    attachmentCount: 0,
    firstActionDeadline: 1,
    createdAt: 0,
    updatedAt: 0,
  };

  it("contains exactly the allowlisted keys, with no private data", () => {
    const pub = toPublicComplaint(record)!;
    expect(Object.keys(pub).sort()).toEqual(
      [
        "ticketId",
        "title",
        "description",
        "categoryId",
        "categoryLabel",
        "subcategoryLabel",
        "blockId",
        "location",
        "status",
        "open",
        "priority",
        "escalated",
        "supportCount",
        "reporterLabel",
        "searchTokens",
        "createdAt",
        "updatedAt",
      ].sort(),
    );
    const json = JSON.stringify(pub);
    for (const leak of ["secret-uid", "214", "urgentFlag", "routing", "priorityRule"])
      expect(json).not.toContain(leak);
  });

  it("returns null for confidential or hidden complaints", () => {
    expect(toPublicComplaint({ ...record, visibility: "confidential" })).toBeNull();
    expect(toPublicComplaint({ ...record, hidden: true })).toBeNull();
  });
});
