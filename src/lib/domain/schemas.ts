import { z } from "zod";
import { GRANTABLE, ROLES } from "./permissions";

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const password = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`);

// Identifiers are length-capped here and normalized by the domain functions afterwards.
const loginIdField = z.string().trim().min(1).max(64);

export const loginInput = z.object({
  loginId: loginIdField,
  password: z.string().max(PASSWORD_MAX),
});

export const activateInput = z.object({
  rollNumber: loginIdField,
  code: z.string().trim().min(1).max(32),
  password,
});

export const changePasswordInput = z.object({
  currentPassword: z.string().max(PASSWORD_MAX),
  newPassword: password,
});

export const rosterImportInput = z.object({
  csv: z.string().max(500_000),
  removeMissing: z.boolean().default(false),
});

export const issueCodesInput = z.object({
  rollNumbers: z.array(loginIdField).min(1).max(500),
});

export const setActiveInput = z.object({ active: z.boolean() });

export const changeRoomInput = z.object({
  block: z.string().trim().min(1).max(80),
  floor: z.string().trim().max(80),
  room: z.string().trim().max(80),
});

export const setRoleInput = z.object({
  role: z.enum(ROLES),
  grants: z.array(z.enum(GRANTABLE as [string, ...string[]])).default([]),
});
