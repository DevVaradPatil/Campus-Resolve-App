// Encrypted backup of the authorized collections + photo manifest (PRD §14.3, docs/RECOVERY.md).
//   npx tsx --env-file=.env.production.local --conditions=react-server scripts/export-backup.ts <age-recipient> [out-dir]
// <age-recipient> is the PUBLIC key ("age1..."). The private key never needs to be on this machine.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Encrypter } from "age-encryption";
import { exportBackup } from "../src/lib/server/backup";

async function main() {
  const [recipient, outDir = "backups"] = process.argv.slice(2);
  if (!recipient?.startsWith("age1"))
    throw new Error("Usage: export-backup.ts <age1… public key> [out-dir]");
  const backup = await exportBackup();
  const e = new Encrypter();
  e.addRecipient(recipient);
  const encrypted = await e.encrypt(JSON.stringify(backup));
  mkdirSync(outDir, { recursive: true });
  const file = path.join(
    outDir,
    `campusresolve-${backup.createdAt.replace(/[:.]/g, "-")}.json.age`,
  );
  writeFileSync(file, encrypted);
  console.log(
    `Wrote ${file} (${encrypted.length} bytes) from ${backup.projectId || "the emulators"}.`,
  );
  for (const [k, n] of Object.entries(backup.counts)) console.log(`  ${k}: ${n}`);
  console.log(`  photo objects listed: ${backup.attachments.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
