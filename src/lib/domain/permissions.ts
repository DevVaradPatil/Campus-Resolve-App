// Least-privilege permission model (PRD §3). Roles grant a base set; committee leads get extra
// permissions only through explicit `grants`. Nothing here grants access to confidential reports
// by role alone.

export const ROLES = ["student", "committee", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "roster.manage",
  "roles.manage",
  "complaints.manage",
  "complaints.escalate",
  "content.moderate",
  "contacts.manage",
  "categories.manage",
  "reporter.view",
  "confidential.view",
  "export",
  "settings.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const BASE: Record<Role, readonly Permission[]> = {
  student: [],
  committee: ["complaints.escalate", "content.moderate"],
  admin: PERMISSIONS,
};

/** Permissions an admin may grant to a committee member on top of the committee base. */
export const GRANTABLE: readonly Permission[] = [
  "contacts.manage",
  "categories.manage",
  "complaints.manage",
  "reporter.view",
  "export",
];

export function can(user: { role: Role; grants?: readonly string[] }, perm: Permission) {
  if (BASE[user.role].includes(perm)) return true;
  return user.role === "committee" && GRANTABLE.includes(perm) && !!user.grants?.includes(perm);
}
