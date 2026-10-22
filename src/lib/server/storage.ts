import "server-only";
import { createHmac } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeEqual } from "./crypto";
import { env } from "./env";
import { HttpError } from "./http";

// The single object-storage module (plan.md D2). Callers never see a provider.
// ponytail: only a local-disk backend exists, usable with the emulators. R2 or Supabase Storage
// replaces these four functions once D2 is decided; both have native short-lived signed URLs.

const ROOT = path.join(process.cwd(), ".data", "uploads");
const SIGNING_KEY = "dev-only-local-storage-signing-key"; // local backend only, never deployed
const KEY_RE = /^[a-z0-9]+(?:\/[a-z0-9]+)*\.webp$/i;
export const URL_TTL_SEC = 10 * 60;

function local(key: string) {
  if (!env.NEXT_PUBLIC_USE_EMULATORS)
    throw new HttpError(503, "Photo storage isn't set up yet. Your complaint was still saved.");
  if (!KEY_RE.test(key)) throw new HttpError(400, "Bad file key.");
  return path.join(ROOT, ...key.split("/"));
}

export async function putObject(key: string, body: Buffer) {
  const file = local(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export async function deleteObject(key: string) {
  await rm(local(key), { force: true });
}

const sign = (key: string, exp: number) =>
  createHmac("sha256", SIGNING_KEY).update(`${key}\n${exp}`).digest("base64url");

/** Short-lived URL. Whoever holds it can read the file until it expires, so only hand it to authorized viewers. */
export function signedUrl(key: string, ttlSec = URL_TTL_SEC) {
  local(key);
  const exp = Date.now() + ttlSec * 1000;
  return `/api/files/${key}?exp=${exp}&sig=${sign(key, exp)}`;
}

/** Reads a file behind a signed URL, or throws 403 for a bad or expired signature. */
export async function readSigned(key: string, exp: string | null, sig: string | null) {
  const file = local(key);
  const expMs = Number(exp);
  if (!sig || !Number.isFinite(expMs) || expMs < Date.now() || !safeEqual(sig, sign(key, expMs)))
    throw new HttpError(403, "This link has expired. Reload the page.");
  try {
    return { body: await readFile(file), expMs };
  } catch {
    throw new HttpError(404, "Not found.");
  }
}
