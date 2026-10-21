import { auth } from "./firebase";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

/**
 * JSON fetch to our own API with the current Firebase ID token attached.
 * Network failures become ApiError(0) so screens can show the "can't reach server" state.
 */
export async function api<T>(
  path: string,
  { method = "GET", body }: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(body !== undefined && { "content-type": "application/json" }),
        ...(token && { authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      "Can't reach CampusResolve right now. Check your connection and try again.",
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Something went wrong.", data.fields);
  return data as T;
}
