import { afterEach, describe, expect, it, vi } from "vitest";

const KEY = "complaints/abc/def.webp";
const SECRET = "sb_secret_abcdefghijklmnopqrstuvwxyz";

/** Fresh storage module (env is read at import) with Supabase configured and fetch stubbed. */
async function supabaseStorage(status = 200) {
  vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", SECRET);
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Response.json({ signedURL: `/object/sign/attachments/${KEY}?token=t` }, { status });
    }),
  );
  vi.resetModules();
  return { storage: await import("./storage"), calls };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Supabase storage backend", () => {
  it("uploads, signs and deletes through the Storage REST API", async () => {
    const { storage, calls } = await supabaseStorage();
    await storage.putObject(KEY, Buffer.from("img"));
    expect(await storage.signedUrl(KEY)).toBe(
      `https://proj.supabase.co/storage/v1/object/sign/attachments/${KEY}?token=t`,
    );
    await storage.deleteObject(KEY);

    const base = "https://proj.supabase.co/storage/v1/object";
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      `POST ${base}/attachments/${KEY}`,
      `POST ${base}/sign/attachments/${KEY}`,
      `DELETE ${base}/attachments`,
    ]);
    expect(calls[0].init.headers).toMatchObject({ apikey: SECRET, "x-upsert": "false" });
    expect(calls[0].init.headers).not.toHaveProperty("authorization");
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ expiresIn: 600 });
    expect(JSON.parse(calls[2].init.body as string)).toEqual({ prefixes: [KEY] });
  });

  it("refuses keys that aren't server-generated paths", async () => {
    const { storage, calls } = await supabaseStorage();
    await expect(storage.putObject("../secrets.webp", Buffer.from(""))).rejects.toMatchObject({
      status: 400,
    });
    await expect(storage.signedUrl("complaints/a/b.svg")).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(0);
  });

  it("surfaces storage errors instead of pretending the upload worked", async () => {
    const { storage } = await supabaseStorage(500);
    await expect(storage.putObject(KEY, Buffer.from("img"))).rejects.toThrow(/500/);
  });
});

describe("local signed URLs (PRD §15.2: no permanent image URLs)", () => {
  it("refuses expired and tampered links", async () => {
    vi.resetModules();
    const storage = await import("./storage");
    const url = new URL(await storage.signedUrl("complaints/abc/def.webp"), "http://localhost");
    const key = "complaints/abc/def.webp";
    const sig = url.searchParams.get("sig");
    const past = String(Date.now() - 1000);
    await expect(storage.readSigned(key, past, sig)).rejects.toMatchObject({ status: 403 });
    await expect(
      storage.readSigned(key, url.searchParams.get("exp"), "forged"),
    ).rejects.toMatchObject({
      status: 403,
    });
    await expect(storage.readSigned(key, url.searchParams.get("exp"), null)).rejects.toMatchObject({
      status: 403,
    });
  });
});
