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

/**
 * Shrinks large photos in the browser before upload: saves mobile data and keeps requests under
 * serverless body limits (Vercel: 4.5 MB). The server still validates and re-encodes everything.
 */
export async function downscalePhoto(file: File, maxSide = 2048): Promise<Blob> {
  if (file.size < 1.5 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = Object.assign(document.createElement("canvas"), {
      width: Math.round(bmp.width * scale),
      height: Math.round(bmp.height * scale),
    });
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file; // undecodable here: let the server give the real error
  }
}

/** Uploads one photo with progress (fetch can't report upload progress). */
export async function uploadPhoto(
  complaintId: string,
  photo: Blob,
  onProgress: (pct: number) => void,
): Promise<{ id: string; url: string }> {
  const token = await auth.currentUser?.getIdToken();
  const form = new FormData();
  form.append("photo", photo, "photo");
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/complaints/${complaintId}/photos`);
    if (token) xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress((e.loaded / e.total) * 100);
    xhr.onerror = () => reject(new ApiError(0, "Can't reach CampusResolve right now. Try again."));
    xhr.onload = () => {
      let data: { error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as { id: string; url: string });
      else reject(new ApiError(xhr.status, data.error ?? "Upload failed."));
    };
    xhr.send(form);
  });
}
