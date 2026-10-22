import "server-only";
import { z } from "zod";

// Server-side env, validated once on first import. Add variables here as the code that needs them lands.
// `KEY=` with nothing after it (as in .env.example) means unset.
const blank = (v: unknown) => (v === "" ? undefined : v);
const secret = z.preprocess(blank, z.string().min(32, "must be at least 32 characters").optional());

const optional = z.preprocess(blank, z.string().optional());

// Required outside the emulators. Checked together so one failed build names every missing key.
const REAL_PROJECT = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "ACTIVATION_CODE_PEPPER",
  "RATE_LIMIT_IP_SALT",
] as const;

const schema = z
  .object({
    NEXT_PUBLIC_USE_EMULATORS: z.stringbool().default(false),
    FIREBASE_PROJECT_ID: optional,
    FIREBASE_CLIENT_EMAIL: optional,
    FIREBASE_PRIVATE_KEY: optional,
    ACTIVATION_CODE_PEPPER: secret,
    RATE_LIMIT_IP_SALT: secret,
    // Photo storage (plan.md D2). Unset → local disk, emulators only.
    SUPABASE_URL: z.preprocess(blank, z.url().optional()),
    SUPABASE_SECRET_KEY: z.preprocess(blank, z.string().min(20).optional()),
    SUPABASE_BUCKET: z.preprocess(blank, z.string().default("attachments")),
  })
  .superRefine((e, ctx) => {
    const required = e.NEXT_PUBLIC_USE_EMULATORS ? ["FIREBASE_PROJECT_ID"] : REAL_PROJECT;
    for (const k of required)
      if (!e[k as keyof typeof e]) ctx.addIssue({ code: "custom", path: [k], message: "missing" });
    if (!e.SUPABASE_URL !== !e.SUPABASE_SECRET_KEY)
      ctx.addIssue({
        code: "custom",
        path: [e.SUPABASE_URL ? "SUPABASE_SECRET_KEY" : "SUPABASE_URL"],
        message: "missing (set both Supabase variables, or neither)",
      });
  })
  // Fixed, public dev secrets are acceptable only against the offline emulators.
  .transform((e) => ({
    ...e,
    FIREBASE_PROJECT_ID: e.FIREBASE_PROJECT_ID!,
    ACTIVATION_CODE_PEPPER: e.ACTIVATION_CODE_PEPPER ?? "dev-only-activation-pepper-not-secret",
    RATE_LIMIT_IP_SALT: e.RATE_LIMIT_IP_SALT ?? "dev-only-rate-limit-salt-not-secret!",
  }));

const parsed = schema.safeParse(process.env);
if (!parsed.success)
  throw new Error(
    'Server environment variables are missing or invalid (see TODO.md, "Vercel environment variables"):\n' +
      parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n"),
  );
export const env = parsed.data;
