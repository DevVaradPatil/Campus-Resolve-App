// Restores an encrypted backup into an EMPTY project and verifies it (FR-16, docs/RECOVERY.md).
//   npx tsx --env-file=<target env> --conditions=react-server scripts/restore-backup.ts <file.json.age> <identity-file>
// Target: the emulators or the campusresolve-restore-test project. Refuses a project that has data.

import { readFileSync } from "node:fs";
import { Decrypter } from "age-encryption";
import { restoreBackup, type Backup } from "../src/lib/server/backup";

async function main() {
  const [file, identityFile] = process.argv.slice(2);
  if (!file || !identityFile)
    throw new Error(
      "Usage: restore-backup.ts <backup.json.age> <identity file (AGE-SECRET-KEY-…)>",
    );
  const identity = readFileSync(identityFile, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("AGE-SECRET-KEY-"));
  if (!identity) throw new Error("No AGE-SECRET-KEY line in the identity file.");
  const d = new Decrypter();
  d.addIdentity(identity);
  const backup = JSON.parse(await d.decrypt(readFileSync(file), "text")) as Backup;
  console.log(`Backup of ${backup.projectId || "emulators"} taken ${backup.createdAt}.`);
  const r = await restoreBackup(backup);
  for (const [k, n] of Object.entries(r.counts)) console.log(`  ${k}: ${n}`);
  console.log(
    r.mismatches.length ? `COUNT MISMATCHES:\n  ${r.mismatches.join("\n  ")}` : "All counts match.",
  );
  console.log(
    r.missingAttachments.length
      ? `${r.missingAttachments.length} of ${r.attachments} photos missing from storage:\n  ${r.missingAttachments.join("\n  ")}`
      : `All ${r.attachments} photos found in storage.`,
  );
  process.exit(r.mismatches.length ? 2 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
