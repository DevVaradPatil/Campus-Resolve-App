import "server-only";
import type { Timestamp } from "firebase-admin/firestore";
import type { ComplaintRecord, Status } from "@/lib/domain/complaint";
import type { Role } from "@/lib/domain/permissions";

// Firestore document shapes. None of these are client-readable.

/** users/{uid}: profile + authorization. Stable UID survives room changes (PRD §9.1). */
export type UserDoc = {
  loginId: string;
  rollNumber: string | null; // null for admin-namespace accounts
  displayName: string; // real name, admin-visible only
  pseudonym: string; // public alias
  role: Role;
  grants: string[];
  block: string;
  floor: string;
  room: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/** accounts/{loginId}: credentials, kept apart from the profile. */
export type AccountDoc = {
  uid: string;
  passwordHash: string | null; // null after an admin reset until re-activation
  passwordChangedAt: Timestamp | null;
};

/** roster/{rollNumber}: who is eligible, from the admin's import. */
export type RosterDoc = {
  rollNumber: string;
  name: string;
  block: string;
  floor: string;
  room: string;
  eligible: boolean;
  uid: string | null; // set once activated
  importedAt: Timestamp;
};

/** activationCodes/{rollNumber}: at most one live code per roll number. */
export type ActivationCodeDoc = {
  codeHash: string;
  expiresAt: Timestamp;
  consumedAt: Timestamp | null;
  issuedBy: string;
  issuedAt: Timestamp;
};

/** complaints/{id}: the internal record (PRD §5.3). */
export type ComplaintDoc = ComplaintRecord<Timestamp>;

/** complaints/{id}/events/{eventId}: append-only history. */
export type EventDoc = {
  type: "created" | "escalated";
  status: Status;
  actorUid: string | null; // null = system
  note: string | null;
  at: Timestamp;
};

/** complaints/{id}/attachments/{attachmentId}. Bytes live in object storage under `key`. */
export type AttachmentDoc = {
  key: string;
  contentType: "image/webp";
  bytes: number;
  width: number;
  height: number;
  /** private: owner and authorized staff only. public: shown on the public complaint. */
  privacy: "public" | "private";
  publication: "published" | "hidden";
  uploadedBy: string;
  createdAt: Timestamp;
};
