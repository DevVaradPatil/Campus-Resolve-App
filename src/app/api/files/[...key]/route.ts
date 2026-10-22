import { route } from "@/lib/server/http";
import { readSigned } from "@/lib/server/storage";

/** Serves a stored photo behind a short-lived signed URL (local storage backend only). */
export const GET = route(async (req, ctx: RouteContext<"/api/files/[...key]">) => {
  const { key } = await ctx.params;
  const url = new URL(req.url);
  const { body, expMs } = await readSigned(
    key.join("/"),
    url.searchParams.get("exp"),
    url.searchParams.get("sig"),
  );
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": "image/webp",
      "cache-control": `private, max-age=${Math.max(0, Math.floor((expMs - Date.now()) / 1000))}`,
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
    },
  });
});
