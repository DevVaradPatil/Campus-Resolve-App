import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  ADMIN_PREFIX,
  normalizeAdminHandle,
  normalizeRollNumber,
  toLoginId,
} from "@/lib/domain/identity";
import type { Role } from "@/lib/domain/permissions";
import { randomPseudonym } from "@/lib/domain/pseudonym";
import { diffRoster, parseRosterCsv, type RosterDiff } from "@/lib/domain/roster";
import { audit, writeAudit } from "./audit";
import type { SessionUser } from "./auth";
import {
  CODE_TTL_MS,
  DUMMY_HASH,
  generateActivationCode,
  hashActivationCode,
  hashIp,
  hashPassword,
  safeEqual,
  secureRandom,
  verifyPassword,
} from "./crypto";
import { adminAuth, adminDb } from "./firebase-admin";
import { HttpError } from "./http";
import { consume, LIMITS } from "./rate-limit";
import type { AccountDoc, ActivationCodeDoc, RosterDoc, UserDoc } from "./types";

// Deliberately identical for every failure cause: never reveal whether a roll number exists.
const ACTIVATION_FAILED =
  "That roll number and activation code don't match, or the code has expired.";
const LOGIN_FAILED = "That ID and password don't match.";

const db = adminDb;
const now = () => FieldValue.serverTimestamp();

function rejectWeakPassword(password: string, loginId: string) {
  const bare = loginId.replace(ADMIN_PREFIX, "").toUpperCase();
  if (password.toUpperCase().includes(bare))
    throw new HttpError(400, "Don't use your ID in your password.");
}

const mintToken = (uid: string, role: Role) => adminAuth.createCustomToken(uid, { role });

/** Signs the user out everywhere. A UID with no Auth record yet (never signed in) has no sessions. */
async function revokeSessions(uid: string) {
  try {
    await adminAuth.revokeRefreshTokens(uid);
  } catch (e) {
    if ((e as { code?: string }).code !== "auth/user-not-found") throw e;
  }
}

/** Student activation and post-reset re-activation (PRD §4.1, §9.1). Returns a custom token. */
export async function activate(
  input: { rollNumber: string; code: string; password: string },
  ip: string,
) {
  await consume(`activate:ip:${hashIp(ip)}`, LIMITS.activateIp);
  const roll = normalizeRollNumber(input.rollNumber);
  if (!roll) throw new HttpError(400, ACTIVATION_FAILED);
  await consume(`activate:acct:${roll}`, LIMITS.activateAccount);
  rejectWeakPassword(input.password, roll);

  // Hash outside the transaction: transactions may retry and scrypt is deliberately slow.
  const passwordHash = await hashPassword(input.password);
  const codeHash = hashActivationCode(roll, input.code);
  const newUid = db.collection("users").doc().id;

  const result = await db.runTransaction(async (tx) => {
    const rosterRef = db.doc(`roster/${roll}`);
    const codeRef = db.doc(`activationCodes/${roll}`);
    const [rosterSnap, codeSnap] = await tx.getAll(rosterRef, codeRef);
    const roster = rosterSnap.data() as RosterDoc | undefined;
    const code = codeSnap.data() as ActivationCodeDoc | undefined;
    const valid =
      roster?.eligible &&
      code &&
      !code.consumedAt &&
      code.expiresAt.toMillis() > Date.now() &&
      safeEqual(code.codeHash, codeHash);
    if (!valid || !roster) return null;

    let uid = roster.uid;
    let role: Role = "student";
    if (uid) {
      const user = (await tx.get(db.doc(`users/${uid}`))).data() as UserDoc | undefined;
      if (!user?.active) return null;
      role = user.role;
    } else {
      uid = newUid;
      tx.set(db.doc(`users/${uid}`), {
        loginId: roll,
        rollNumber: roll,
        displayName: roster.name,
        pseudonym: randomPseudonym(secureRandom),
        role,
        grants: [],
        block: roster.block,
        floor: roster.floor,
        room: roster.room,
        active: true,
        createdAt: now(),
        updatedAt: now(),
      });
      tx.update(rosterRef, { uid });
    }
    tx.set(db.doc(`accounts/${roll}`), { uid, passwordHash, passwordChangedAt: now() });
    tx.update(codeRef, { consumedAt: now() });
    writeAudit(tx, {
      actorUid: uid,
      action: "account.activate",
      target: { type: "user", id: uid },
      outcome: "success",
      meta: { reactivation: !!roster.uid },
    });
    return { uid, role };
  });

  if (!result) {
    await audit({
      actorUid: null,
      action: "account.activate_failed",
      target: { type: "roster", id: roll },
      outcome: "failure",
    });
    throw new HttpError(400, ACTIVATION_FAILED);
  }
  return { token: await mintToken(result.uid, result.role) };
}

export async function login(input: { loginId: string; password: string }, ip: string) {
  await consume(`login:ip:${hashIp(ip)}`, LIMITS.loginIp);
  const loginId = toLoginId(input.loginId);
  await consume(`login:acct:${loginId ?? input.loginId.trim().toUpperCase()}`, LIMITS.loginAccount);

  const account = loginId
    ? ((await db.doc(`accounts/${loginId}`).get()).data() as AccountDoc | undefined)
    : undefined;
  // Always pay the scrypt cost so timing doesn't reveal unknown or reset accounts.
  const passwordOk = await verifyPassword(input.password, account?.passwordHash ?? DUMMY_HASH);
  const user =
    passwordOk && account?.passwordHash
      ? ((await db.doc(`users/${account.uid}`).get()).data() as UserDoc | undefined)
      : undefined;

  if (!user?.active || !account) {
    if (account)
      await audit({
        actorUid: null,
        action: "account.login_failed",
        target: { type: "user", id: account.uid },
        outcome: "failure",
      });
    throw new HttpError(401, LOGIN_FAILED);
  }
  return { token: await mintToken(account.uid, user.role) };
}

/** Changes the password and signs out other sessions; returns a fresh token for this one. */
export async function changePassword(
  user: SessionUser,
  input: { currentPassword: string; newPassword: string },
) {
  await consume(`password:${user.uid}`, LIMITS.passwordChange);
  const ref = db.doc(`accounts/${user.loginId}`);
  const account = (await ref.get()).data() as AccountDoc | undefined;
  if (
    !account?.passwordHash ||
    !(await verifyPassword(input.currentPassword, account.passwordHash))
  )
    throw new HttpError(400, "Your current password isn't right.");
  rejectWeakPassword(input.newPassword, user.loginId);
  const passwordHash = await hashPassword(input.newPassword);
  const b = db.batch();
  b.update(ref, { passwordHash, passwordChangedAt: now() });
  writeAudit(b, {
    actorUid: user.uid,
    action: "account.password_change",
    target: { type: "user", id: user.uid },
    outcome: "success",
  });
  await b.commit();
  await revokeSessions(user.uid);
  return { token: await mintToken(user.uid, user.role) };
}

export type IssuedCode = {
  rollNumber: string;
  name: string;
  code: string;
  expiresAt: string;
  kind: "new" | "reset";
};

/**
 * Issues one-time activation codes. For an already-activated student this is the admin-controlled
 * password reset (PRD §9.2): the old password stops working and all sessions are revoked.
 * Plaintext codes are returned exactly once and never stored.
 */
export async function issueCodes(actor: SessionUser, rollNumbers: string[]) {
  const rolls = [...new Set(rollNumbers.map(normalizeRollNumber).filter((r): r is string => !!r))];
  const skipped: { rollNumber: string; reason: string }[] = rollNumbers
    .filter((r) => !normalizeRollNumber(r))
    .map((r) => ({ rollNumber: r, reason: "Not a valid roll number" }));
  if (!rolls.length) return { issued: [] as IssuedCode[], skipped };

  const rosterSnaps = await db.getAll(...rolls.map((r) => db.doc(`roster/${r}`)));
  const rosters = rosterSnaps.map((s) => s.data() as RosterDoc | undefined);
  const uids = rosters.map((r) => r?.uid).filter((u): u is string => !!u);
  const users = new Map(
    uids.length
      ? (await db.getAll(...uids.map((u) => db.doc(`users/${u}`)))).map((s) => [
          s.id,
          s.data() as UserDoc,
        ])
      : [],
  );

  const issued: IssuedCode[] = [];
  const resets: string[] = [];
  const expiresAt = Timestamp.fromMillis(Date.now() + CODE_TTL_MS);
  const batch = db.batch();
  rolls.forEach((roll, i) => {
    const roster = rosters[i];
    if (!roster) return void skipped.push({ rollNumber: roll, reason: "Not on the roster" });
    if (!roster.eligible) return void skipped.push({ rollNumber: roll, reason: "Not eligible" });
    const user = roster.uid ? users.get(roster.uid) : undefined;
    if (roster.uid && !user?.active)
      return void skipped.push({
        rollNumber: roll,
        reason: "Account is deactivated. Reactivate it first.",
      });

    const code = generateActivationCode();
    const kind = roster.uid ? "reset" : "new";
    batch.set(db.doc(`activationCodes/${roll}`), {
      codeHash: hashActivationCode(roll, code),
      expiresAt,
      consumedAt: null,
      issuedBy: actor.uid,
      issuedAt: now(),
    });
    if (roster.uid) {
      batch.set(db.doc(`accounts/${roll}`), { passwordHash: null }, { merge: true });
      resets.push(roster.uid);
    }
    writeAudit(batch, {
      actorUid: actor.uid,
      action: kind === "reset" ? "account.reset" : "activation.issue",
      target: { type: "roster", id: roll },
      outcome: "success",
    });
    issued.push({
      rollNumber: roll,
      name: roster.name,
      code,
      expiresAt: expiresAt.toDate().toISOString(),
      kind,
    });
  });
  await batch.commit();
  await Promise.all(resets.map(revokeSessions));
  return { issued, skipped };
}

export async function setActive(actor: SessionUser, uid: string, active: boolean) {
  if (uid === actor.uid) throw new HttpError(400, "You can't change your own account status.");
  const ref = db.doc(`users/${uid}`);
  const user = (await ref.get()).data() as UserDoc | undefined;
  if (!user) throw new HttpError(404, "No such account.");
  if (active && user.rollNumber) {
    const roster = (await db.doc(`roster/${user.rollNumber}`).get()).data() as
      RosterDoc | undefined;
    if (!roster?.eligible)
      throw new HttpError(400, "This student isn't eligible on the current roster.");
  }
  const b = db.batch();
  b.update(ref, { active, updatedAt: now() });
  writeAudit(b, {
    actorUid: actor.uid,
    action: active ? "account.reactivate" : "account.deactivate",
    target: { type: "user", id: uid },
    outcome: "success",
  });
  await b.commit();
  if (!active) await revokeSessions(uid);
}

export async function changeRoom(
  actor: SessionUser,
  rollNumber: string,
  loc: { block: string; floor: string; room: string },
) {
  const roll = normalizeRollNumber(rollNumber);
  const ref = roll && db.doc(`roster/${roll}`);
  const roster = ref && ((await ref.get()).data() as RosterDoc | undefined);
  if (!ref || !roster) throw new HttpError(404, "Not on the roster.");
  const b = db.batch();
  b.update(ref, loc);
  // Room is profile data only; the UID and every relationship keyed on it stay the same.
  if (roster.uid) b.update(db.doc(`users/${roster.uid}`), { ...loc, updatedAt: now() });
  writeAudit(b, {
    actorUid: actor.uid,
    action: "account.room_change",
    target: { type: "roster", id: ref.id },
    outcome: "success",
  });
  await b.commit();
}

export async function setRole(
  actor: SessionUser,
  uid: string,
  input: { role: Role; grants: string[] },
) {
  if (uid === actor.uid) throw new HttpError(400, "You can't change your own role.");
  const ref = db.doc(`users/${uid}`);
  const user = (await ref.get()).data() as UserDoc | undefined;
  if (!user) throw new HttpError(404, "No such account.");
  // Admin rights live only on separate admin-namespace accounts (PRD §9.2).
  if ((input.role === "admin") !== !user.rollNumber)
    throw new HttpError(400, "Admin access is only available on separate admin accounts.");
  const grants = input.role === "committee" ? input.grants : [];
  const b = db.batch();
  b.update(ref, { role: input.role, grants, updatedAt: now() });
  writeAudit(b, {
    actorUid: actor.uid,
    action: "account.role_change",
    target: { type: "user", id: uid },
    outcome: "success",
    meta: { from: user.role, to: input.role, grants: grants.join(",") },
  });
  await b.commit();
  // The server reads the role from users/{uid} on every request, so this applies immediately.
}

export type RosterImportResult = {
  errors: string[];
  summary: { add: number; update: number; remove: number; unchanged: number };
  diff: RosterDiff;
  applied: boolean;
};

/** Preview (apply=false) or apply a roster CSV. Removed/ineligible students are deactivated. */
export async function importRoster(
  actor: SessionUser,
  input: { csv: string; removeMissing: boolean },
  apply: boolean,
): Promise<RosterImportResult> {
  const { rows, errors } = parseRosterCsv(input.csv);
  const existingSnaps = await db.collection("roster").get();
  const existing = existingSnaps.docs.map((d) => d.data() as RosterDoc);
  const diff = diffRoster(existing, rows);
  if (!input.removeMissing) diff.remove = [];
  const summary = {
    add: diff.add.length,
    update: diff.update.length,
    remove: diff.remove.length,
    unchanged: diff.unchanged,
  };
  if (!apply || errors.length) return { errors, summary, diff, applied: false };

  const uidOf = new Map(existing.map((e) => [e.rollNumber, e.uid]));
  const ops: ((b: FirebaseFirestore.WriteBatch) => void)[] = [];
  const deactivate: string[] = [];
  for (const r of diff.add)
    ops.push((b) =>
      b.set(db.doc(`roster/${r.rollNumber}`), { ...r, uid: null, importedAt: now() }),
    );
  for (const { after } of diff.update) {
    ops.push((b) =>
      b.update(db.doc(`roster/${after.rollNumber}`), { ...after, importedAt: now() }),
    );
    const uid = uidOf.get(after.rollNumber);
    if (uid) {
      const { block, floor, room } = after;
      ops.push((b) =>
        b.update(db.doc(`users/${uid}`), {
          block,
          floor,
          room,
          ...(after.eligible ? {} : { active: false }),
          updatedAt: now(),
        }),
      );
      if (!after.eligible) deactivate.push(uid);
    }
  }
  for (const r of diff.remove) {
    ops.push((b) =>
      b.update(db.doc(`roster/${r.rollNumber}`), { eligible: false, importedAt: now() }),
    );
    const uid = uidOf.get(r.rollNumber);
    if (uid) {
      ops.push((b) => b.update(db.doc(`users/${uid}`), { active: false, updatedAt: now() }));
      deactivate.push(uid);
    }
  }
  // Firestore batches cap at 500 writes; leave room for the audit entries.
  for (let i = 0; i < ops.length; i += 400) {
    const b = db.batch();
    ops.slice(i, i + 400).forEach((op) => op(b));
    if (i === 0)
      writeAudit(b, {
        actorUid: actor.uid,
        action: "roster.import",
        target: { type: "system", id: "roster" },
        outcome: "success",
        meta: { ...summary, deactivated: deactivate.length },
      });
    await b.commit();
  }
  if (!ops.length)
    await audit({
      actorUid: actor.uid,
      action: "roster.import",
      target: { type: "system", id: "roster" },
      outcome: "success",
      meta: { ...summary, deactivated: 0 },
    });
  await Promise.all(deactivate.map(revokeSessions));
  return { errors, summary, diff, applied: true };
}

/** Bootstraps an admin-namespace account. Used by scripts/create-admin.ts only. */
export async function createAdmin(handleRaw: string, displayName: string, password: string) {
  const handle = normalizeAdminHandle(handleRaw);
  if (!handle)
    throw new Error("Admin handle must be 3–32 characters: a–z, 0–9, dot, dash, underscore.");
  const loginId = ADMIN_PREFIX + handle;
  rejectWeakPassword(password, loginId);
  const passwordHash = await hashPassword(password);
  const uid = db.collection("users").doc().id;
  await db.runTransaction(async (tx) => {
    const accRef = db.doc(`accounts/${loginId}`);
    if ((await tx.get(accRef)).exists) throw new Error(`${loginId} already exists.`);
    tx.set(db.doc(`users/${uid}`), {
      loginId,
      rollNumber: null,
      displayName,
      pseudonym: "Hostel admin",
      role: "admin",
      grants: [],
      block: "",
      floor: "",
      room: "",
      active: true,
      createdAt: now(),
      updatedAt: now(),
    });
    tx.set(accRef, { uid, passwordHash, passwordChangedAt: now() });
    writeAudit(tx, {
      actorUid: null,
      action: "account.admin_created",
      target: { type: "user", id: uid },
      outcome: "success",
      meta: { via: "cli" },
    });
  });
  return { uid, loginId };
}
