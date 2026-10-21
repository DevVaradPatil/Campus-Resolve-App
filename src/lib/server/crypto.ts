import "server-only";
import { createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { env } from "./env";

const scryptAsync = promisify(scrypt) as (
  pw: string,
  salt: Buffer,
  len: number,
  opts: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// scrypt N=2^15, r=8, p=1 (~50 ms locally, see plan.md D4). Needs maxmem > 32 MiB.
const P = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 32;

/** Format: scrypt$N$r$p$saltB64$hashB64, so parameters can be raised later without a migration. */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password.normalize("NFKC"), salt, KEYLEN, P);
  return ["scrypt", P.N, P.r, P.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, N, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(
    password.normalize("NFKC"),
    Buffer.from(salt, "base64"),
    expected.length,
    {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      maxmem: P.maxmem,
    },
  );
  return timingSafeEqual(actual, expected);
}

/** Verified against when the account doesn't exist, so response time doesn't reveal that. */
export const DUMMY_HASH = [
  "scrypt",
  P.N,
  P.r,
  P.p,
  Buffer.alloc(16).toString("base64"),
  Buffer.alloc(KEYLEN).toString("base64"),
].join("$");

// Activation codes: 10 chars from an alphabet without look-alikes (0/O, 1/I/L), ~49 bits.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function generateActivationCode() {
  const c = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${c.slice(0, 5)}-${c.slice(5)}`;
}

export const normalizeActivationCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Codes are stored only as HMACs bound to their roll number. */
export const hashActivationCode = (rollNumber: string, code: string) =>
  createHmac("sha256", env.ACTIVATION_CODE_PEPPER)
    .update(`${rollNumber}:${normalizeActivationCode(code)}`)
    .digest("base64");

export const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Rate-limit keys never contain raw IPs. */
export const hashIp = (ip: string) =>
  createHmac("sha256", env.RATE_LIMIT_IP_SALT).update(ip).digest("base64url").slice(0, 22);

export const secureRandom = () => randomInt(2 ** 31) / 2 ** 31;
