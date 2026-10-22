// Seeds the emulators with PRD default categories plus placeholder blocks, contacts and routing.
//   npm run seed-dev        (with `npm run emulators` running)
// Refuses to run against a real project: production config comes from owner-approved data (TODO.md).

import {
  DEFAULT_CATEGORIES,
  DEV_BLOCKS,
  DEV_CONTACTS,
  DEV_ROUTING,
} from "../src/lib/domain/defaults";
import { seedConfig } from "../src/lib/server/config";

async function main() {
  if (process.env.NEXT_PUBLIC_USE_EMULATORS !== "true")
    throw new Error("seed-dev only runs against the emulators (NEXT_PUBLIC_USE_EMULATORS=true).");
  await seedConfig({
    categories: DEFAULT_CATEGORIES,
    locations: DEV_BLOCKS,
    contacts: DEV_CONTACTS,
    routingRules: DEV_ROUTING,
  });
  console.log(
    `Seeded ${DEFAULT_CATEGORIES.length} categories, ${DEV_BLOCKS.length} blocks, ` +
      `${DEV_CONTACTS.length} contacts, ${DEV_ROUTING.length} routing rules.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
