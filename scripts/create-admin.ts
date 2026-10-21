// Creates an admin-namespace account (login ID "admin:<handle>").
//   npm run create-admin -- <handle> "<Display name>"
// Reads .env.local; point it at production with: npx tsx --env-file=.env.production.local
//   --conditions=react-server scripts/create-admin.ts <handle> "<name>"
// The password is typed interactively and never echoed, logged or passed as an argument.

import { createInterface } from "node:readline";
import { createAdmin } from "../src/lib/server/accounts";
import { PASSWORD_MIN } from "../src/lib/domain/schemas";

// One interface for every prompt, so piped input isn't lost between questions.
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
let prompting = "";
// Echo only the prompt text, never the typed characters.
out._writeToOutput = (s) => {
  if (prompting && s.includes(prompting)) out.output.write(prompting);
};

// The async iterator buffers lines, so input that arrives before a prompt isn't dropped.
const lines = rl[Symbol.asyncIterator]();

async function askHidden(prompt: string): Promise<string> {
  prompting = prompt;
  out.output.write(prompt);
  const { value } = await lines.next();
  process.stdout.write("\n");
  return value ?? "";
}

async function main() {
  const [handle, ...nameParts] = process.argv.slice(2);
  const displayName = nameParts.join(" ").trim();
  if (!handle || !displayName) {
    console.error('Usage: npm run create-admin -- <handle> "<Display name>"');
    process.exit(1);
  }
  const target =
    process.env.NEXT_PUBLIC_USE_EMULATORS === "true"
      ? "the local emulators"
      : process.env.FIREBASE_PROJECT_ID;
  console.log(`Creating admin:${handle} in ${target}`);
  const password = await askHidden(`Password (min ${PASSWORD_MIN} chars): `);
  if (password.length < PASSWORD_MIN) throw new Error("Password too short.");
  if ((await askHidden("Repeat password: ")) !== password)
    throw new Error("Passwords don't match.");
  const { loginId } = await createAdmin(handle, displayName, password);
  console.log(`Created. Sign in at /admin/login with ID "${loginId.split(":")[1]}".`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
