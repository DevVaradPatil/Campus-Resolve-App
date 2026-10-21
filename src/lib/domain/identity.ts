// Login identifiers. Students sign in with their roll number; admins with a separate admin ID
// ("admin:<handle>") so administrative credentials never share a student's password (PRD §9.2).

export const ADMIN_PREFIX = "admin:";

/** The one place roll numbers are normalized. Returns null when it can't be a roll number. */
export function normalizeRollNumber(raw: string): string | null {
  const v = raw.trim().toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z0-9]{4,12}$/.test(v) ? v : null;
}

export function normalizeAdminHandle(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return /^[a-z0-9._-]{3,32}$/.test(v) ? v : null;
}

/** Login ID → account doc ID. `admin:` prefix selects the admin namespace. */
export function toLoginId(raw: string): string | null {
  const t = raw.trim();
  if (t.toLowerCase().startsWith(ADMIN_PREFIX)) {
    const h = normalizeAdminHandle(t.slice(ADMIN_PREFIX.length));
    return h && ADMIN_PREFIX + h;
  }
  return normalizeRollNumber(t);
}
