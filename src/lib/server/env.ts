import "server-only";
import { z } from "zod";

// Server-side env, validated once on first import. Add variables here as the code that needs them lands.
// `KEY=` with nothing after it (as in .env.example) means unset.
const secret = z.preprocess(
  (v) => (v === "" ? undefined : v),
  z.string().min(32, "must be at least 32 characters").optional(),
);

const schema = z
  .object({
    NEXT_PUBLIC_USE_EMULATORS: z.stringbool().default(false),
    FIREBASE_PROJECT_ID: z.string().min(1),
    FIREBASE_CLIENT_EMAIL: z.string().optional(),
    FIREBASE_PRIVATE_KEY: z.string().optional(),
    ACTIVATION_CODE_PEPPER: secret,
    RATE_LIMIT_IP_SALT: secret,
  })
  .refine(
    (e) => e.NEXT_PUBLIC_USE_EMULATORS || (e.FIREBASE_CLIENT_EMAIL && e.FIREBASE_PRIVATE_KEY),
    "FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are required unless NEXT_PUBLIC_USE_EMULATORS=true",
  )
  .refine(
    (e) => e.NEXT_PUBLIC_USE_EMULATORS || (e.ACTIVATION_CODE_PEPPER && e.RATE_LIMIT_IP_SALT),
    "ACTIVATION_CODE_PEPPER and RATE_LIMIT_IP_SALT are required unless NEXT_PUBLIC_USE_EMULATORS=true",
  )
  // Fixed, public dev secrets are acceptable only against the offline emulators.
  .transform((e) => ({
    ...e,
    ACTIVATION_CODE_PEPPER: e.ACTIVATION_CODE_PEPPER ?? "dev-only-activation-pepper-not-secret",
    RATE_LIMIT_IP_SALT: e.RATE_LIMIT_IP_SALT ?? "dev-only-rate-limit-salt-not-secret!",
  }));

export const env = schema.parse(process.env);
