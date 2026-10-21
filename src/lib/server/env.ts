import "server-only";
import { z } from "zod";

// Server-side env, validated once on first import. Add variables here as the code that needs them lands.
const schema = z
  .object({
    NEXT_PUBLIC_USE_EMULATORS: z.stringbool().default(false),
    FIREBASE_PROJECT_ID: z.string().min(1),
    FIREBASE_CLIENT_EMAIL: z.string().optional(),
    FIREBASE_PRIVATE_KEY: z.string().optional(),
  })
  .refine(
    (e) => e.NEXT_PUBLIC_USE_EMULATORS || (e.FIREBASE_CLIENT_EMAIL && e.FIREBASE_PRIVATE_KEY),
    "FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are required unless NEXT_PUBLIC_USE_EMULATORS=true",
  );

export const env = schema.parse(process.env);
