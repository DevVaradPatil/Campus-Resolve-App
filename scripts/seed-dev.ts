// Seeds PRD default categories plus placeholder blocks, contacts and routing.
//   npm run seed-dev                       the running emulators
//   npx tsx --env-file=.env.production.local --conditions=react-server scripts/seed-dev.ts --real
//                                          a real (dev) Firebase project, first setup only
// With --real it refuses to overwrite existing config and leaves out the placeholder emergency
// numbers, so the app falls back to "call campus security directly" until real ones are added.

import {
  DEFAULT_CATEGORIES,
  DEV_BLOCKS,
  DEV_CONTACTS,
  DEV_ROUTING,
} from "../src/lib/domain/defaults";
import { seedConfig } from "../src/lib/server/config";
import { adminDb } from "../src/lib/server/firebase-admin";

async function main() {
  const real = process.argv.includes("--real");
  const emulators = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";
  if (!real && !emulators)
    throw new Error("Not using the emulators. To seed a real project, pass --real.");
  if (real && (await adminDb.collection("categories").limit(1).get()).size)
    throw new Error("This project already has categories. Edit them at /admin/config instead.");

  const contacts = real ? DEV_CONTACTS.filter((c) => !c.emergency) : DEV_CONTACTS;
  await seedConfig({
    categories: DEFAULT_CATEGORIES,
    locations: DEV_BLOCKS,
    contacts,
    routingRules: DEV_ROUTING,
  });
  console.log(
    `Seeded ${emulators ? "the emulators" : process.env.FIREBASE_PROJECT_ID}: ` +
      `${DEFAULT_CATEGORIES.length} categories, ${DEV_BLOCKS.length} blocks, ` +
      `${contacts.length} contacts, ${DEV_ROUTING.length} routing rules.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
