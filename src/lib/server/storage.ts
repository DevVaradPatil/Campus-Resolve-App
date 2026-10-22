import "server-only";
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeEqual } from "./crypto";
import { env } from "./env";
import { HttpError } from "./http";

// The single object-storage module (plan.md D2). Callers never see a provider.
// Supabase Storage (private bucket, signed URLs) when configured; otherwise a local-disk backend
// that only works with the emulators.

const ROOT = path.join(process.cwd(), ".data", "uploads");
const SIGNING_KEY = "dev-only-local-storage-signing-key"; // local backend only, never deployed
const KEY_RE = /^[a-z0-9]+(?:\/[a-z0-9]+)*\.webp$/i;
export const URL_TTL_SEC = 10 * 60;

const supabase = !!(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY);

function checkKey(key: string) {
  if (!KEY_RE.test(key)) throw new HttpError(400, "Bad file key.");
  if (!supabase && !env.NEXT_PUBLIC_USE_EMULATORS)
    throw new HttpError(503, "Photo storage isn't set up yet. Your complaint was still saved.");
}

const local = (key: string) => (checkKey(key), path.join(ROOT, ...key.split("/")));

/** Supabase Storage REST call with the server-only secret key. Never reaches the browser. */
async function storageApi(route: string, init: RequestInit) {
  const key = env.SUPABASE_SECRET_KEY!;
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/${route}`, {
    ...init,
    headers: {
      apikey: key,
      // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys don't.
      ...(key.startsWith("eyJ") && { authorization: `Bearer ${key}` }),
      ...init.headers,
    },
  });
  if (!res.ok)
    throw new Error(
      `Supabase Storage ${init.method} ${route.split("/")[0]} failed: ${res.status} ${(await res.text()).slice(0, 200)}`,
    );
  return res;
}

export async function putObject(key: string, body: Buffer) {
  checkKey(key);
  if (supabase) {
    await storageApi(`object/${env.SUPABASE_BUCKET}/${key}`, {
      method: "POST",
      headers: { "content-type": "image/webp", "x-upsert": "false" },
      body: new Uint8Array(body),
    });
    return;
  }
  const file = local(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export async function deleteObject(key: string) {
  checkKey(key);
  if (supabase)
    await storageApi(`object/${env.SUPABASE_BUCKET}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefixes: [key] }),
    });
  else await rm(local(key), { force: true });
}

/** For backup reconciliation (FR-16): is the object still in storage? */
export async function objectExists(key: string) {
  checkKey(key);
  if (!supabase) return existsSync(local(key));
  const slash = key.lastIndexOf("/");
  const res = await storageApi(`object/list/${env.SUPABASE_BUCKET}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prefix: key.slice(0, slash), search: key.slice(slash + 1), limit: 1 }),
  });
  return ((await res.json()) as unknown[]).length > 0;
}

/** Cheap authenticated call so the free Supabase project never counts as idle (D2). */
export async function ping(): Promise<"supabase" | "local" | "none"> {
  if (!supabase) return env.NEXT_PUBLIC_USE_EMULATORS ? "local" : "none";
  await storageApi(`object/list/${env.SUPABASE_BUCKET}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prefix: "", limit: 1 }),
  });
  return "supabase";
}

const sign = (key: string, exp: number) =>
  createHmac("sha256", SIGNING_KEY).update(`${key}\n${exp}`).digest("base64url");

/** Short-lived URL. Whoever holds it can read the file until it expires, so only hand it to authorized viewers. */
export async function signedUrl(key: string, ttlSec = URL_TTL_SEC) {
  checkKey(key);
  if (supabase) {
    const res = await storageApi(`object/sign/${env.SUPABASE_BUCKET}/${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expiresIn: ttlSec }),
    });
    const { signedURL } = (await res.json()) as { signedURL: string };
    return `${env.SUPABASE_URL}/storage/v1${signedURL}`;
  }
  const exp = Date.now() + ttlSec * 1000;
  return `/api/files/${key}?exp=${exp}&sig=${sign(key, exp)}`;
}

/** Local backend only: reads a file behind a signed URL, or throws 403 for a bad or expired signature. */
export async function readSigned(key: string, exp: string | null, sig: string | null) {
  if (supabase) throw new HttpError(404, "Not found.");
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
