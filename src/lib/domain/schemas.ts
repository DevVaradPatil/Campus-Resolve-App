import { z } from "zod";
import { LIMITS, LOCATION_TYPE_IDS, PRIORITIES, VISIBILITIES } from "./complaint";
import { GRANTABLE, ROLES } from "./permissions";

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const password = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`);

// Identifiers are length-capped here and normalized by the domain functions afterwards.
const loginIdField = z.string().trim().min(1).max(64);

export const loginInput = z.object({
  loginId: loginIdField,
  password: z.string().max(PASSWORD_MAX),
});

export const activateInput = z.object({
  rollNumber: loginIdField,
  code: z.string().trim().min(1).max(32),
  password,
});

export const changePasswordInput = z.object({
  currentPassword: z.string().max(PASSWORD_MAX),
  newPassword: password,
});

export const rosterImportInput = z.object({
  csv: z.string().max(500_000),
  removeMissing: z.boolean().default(false),
});

export const issueCodesInput = z.object({
  rollNumbers: z.array(loginIdField).min(1).max(500),
});

export const setActiveInput = z.object({ active: z.boolean() });

export const changeRoomInput = z.object({
  block: z.string().trim().min(1).max(80),
  floor: z.string().trim().max(80),
  room: z.string().trim().max(80),
});

export const setRoleInput = z.object({
  role: z.enum(ROLES),
  grants: z.array(z.enum(GRANTABLE as [string, ...string[]])).default([]),
});

// --- Hostel configuration (admin-editable; PRD §5, §10) ---

const slug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "IDs use lowercase letters, numbers and dashes.");
const label = z.string().trim().min(1, "Enter a name.").max(80);

export const categorySchema = z.object({
  id: slug,
  label,
  description: z.string().trim().max(160).default(""),
  defaultPriority: z.enum(PRIORITIES),
  closureWindowHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 14),
  subcategories: z
    .array(z.object({ id: slug, label, priority: z.enum(PRIORITIES).optional() }))
    .max(20),
  active: z.boolean(),
  order: z.number().int().min(0).max(999),
});
export type Category = z.infer<typeof categorySchema>;

export const blockSchema = z.object({
  id: slug,
  label,
  floors: z.array(z.object({ id: slug, label })).max(20),
  active: z.boolean(),
  order: z.number().int().min(0).max(999),
});
export type Block = z.infer<typeof blockSchema>;

export const contactSchema = z.object({
  id: slug,
  name: label,
  role: z.string().trim().max(80).default(""),
  phone: z.string().trim().max(20).default(""),
  email: z.union([z.literal(""), z.email().max(120)]).default(""),
  /** Shown in the emergency notice. */
  emergency: z.boolean(),
  active: z.boolean(),
});
export type Contact = z.infer<typeof contactSchema>;

export const routingRuleSchema = z.object({
  id: slug,
  categoryId: slug.nullable(),
  blockId: slug.nullable(),
  contactId: slug,
  enabled: z.boolean(),
});
export type RoutingRule = z.infer<typeof routingRuleSchema>;

export const CONFIG_SCHEMAS = {
  categories: categorySchema,
  locations: blockSchema,
  contacts: contactSchema,
  routingRules: routingRuleSchema,
} as const;
export type ConfigKind = keyof typeof CONFIG_SCHEMAS;

// --- Complaints ---

/** Blank optional text arrives as "" from forms; store it as null. */
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && !v.trim() ? null : v),
    z.string().trim().max(max).nullable().default(null),
  );

export const createComplaintInput = z.object({
  /** Client-generated per draft, so a retried submit can't create a second ticket (PRD §12.3). */
  idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{16,64}$/),
  categoryId: slug,
  subcategoryId: slug.nullable().default(null),
  title: z.string().trim().min(5, "Use at least 5 characters.").max(LIMITS.title),
  description: z
    .string()
    .trim()
    .min(10, "Describe the problem in at least 10 characters.")
    .max(LIMITS.description),
  location: z.object({
    blockId: slug.nullable(),
    floorId: slug.nullable(),
    type: z.enum(LOCATION_TYPE_IDS),
    roomReference: optionalText(LIMITS.roomReference),
    description: optionalText(LIMITS.locationDescription),
  }),
  urgent: z.boolean().default(false),
  visibility: z.enum(VISIBILITIES),
});
export type CreateComplaintInput = z.infer<typeof createComplaintInput>;

// --- Workflow (PRD §6). Who may send which action is checked on the server. ---

const reason = z.string().trim().min(3, "Give a short reason.").max(500);
const note = z.string().trim().min(3, "Write a short note.").max(1000);

export const workflowInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("assign"), contactId: slug }),
  z.object({ type: z.literal("start"), note: optionalText(1000) }),
  z.object({ type: z.literal("note"), note }),
  z.object({ type: z.literal("resolve"), note }),
  z.object({ type: z.literal("priority"), priority: z.enum(PRIORITIES), reason }),
  z.object({ type: z.literal("escalate"), reason }),
  z.object({ type: z.literal("hide"), reason }),
  z.object({ type: z.literal("unhide") }),
  z.object({ type: z.literal("confirm") }),
  z.object({ type: z.literal("reopen"), note: optionalText(1000) }),
  z.object({
    type: z.literal("feedback"),
    rating: z.number().int().min(1).max(5),
    comment: optionalText(500),
  }),
]);
export type WorkflowInput = z.infer<typeof workflowInput>;

const queryParam = <T extends z.ZodType>(s: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), s.optional());

/** GET /api/admin/complaints search params. */
export const queueQuery = z.object({
  view: z.enum(["active", "resolved", "closed"]).default("active"),
  status: queryParam(z.enum(["submitted", "assigned", "in_progress", "reopened"])),
  priority: queryParam(z.enum(PRIORITIES)),
  categoryId: queryParam(slug),
  blockId: queryParam(slug),
  assignee: queryParam(z.union([slug, z.literal("none")])),
  escalated: queryParam(z.literal("true")),
  after: queryParam(z.string().regex(/^[a-f0-9]{20}$/)),
});
export type QueueQuery = z.infer<typeof queueQuery>;

export const markReadInput = z.union([
  z.object({
    ids: z
      .array(z.string().regex(/^[a-f0-9]{32}$/))
      .min(1)
      .max(20),
  }),
  z.object({ all: z.literal(true) }),
]);

export const preferencesInput = z.object({ muteNonEssential: z.boolean() });

export const COMMENT_MAX = 1000;
export const commentInput = z.object({
  body: z.string().trim().min(2, "Write a little more.").max(COMMENT_MAX),
});
export const hideCommentInput = z.object({ reason });
