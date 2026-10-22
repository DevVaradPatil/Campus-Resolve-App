# Backup and recovery

CampusResolve has no paid backup service (PRD §14.3). Backups are encrypted JSON exports you
run by hand and keep offline. Firestore is the source of truth for complaints and accounts;
photos stay in Supabase Storage and the backup lists them so a restore can check they're there.

## What a backup contains

`users`, `accounts` (password hashes, so logins keep working), `roster`, `complaints` with
their events, comments, votes and photo metadata, `publicComplaints`, `reports`, `auditLogs`,
hostel setup (`categories`, `locations`, `contacts`, `routingRules`), `systemSettings` and
`stats`, plus a manifest of every photo object.

Not included: notifications, activation codes and rate-limit counters (all short-lived), and the
photo files themselves.

The file is encrypted with [age](https://age-encryption.org) to your public key. Without the
private key nobody, including whoever holds the file, can read it.

## One-time setup

1. Install age (`winget install FiloSottile.age`, or download it from the age releases page) and
   make a key pair:
   ```
   age-keygen -o backup.key
   ```
   The file holds the private key (`AGE-SECRET-KEY-…`) and prints the public key (`age1…`).
2. Keep `backup.key` **offline** (password manager or USB stick). Never commit it, never paste it
   anywhere, never put it on the server. Losing it makes every backup unreadable.
3. Note the public key; it's safe to share and is the only thing the export needs.

## Making a backup (weekly during the pilot, and before risky changes)

```
npx tsx --env-file=.env.production.local --conditions=react-server scripts/export-backup.ts age1yourpublickey backups
```

It writes `backups/campusresolve-<time>.json.age` and prints document counts. Copy the file to
offline storage and delete old ones after the backup retention window the pilot team agrees.
`backups/` is git-ignored.

## Restoring (and the restore test, FR-16)

Restore only into an **empty** project: the emulators, or the separate
`campusresolve-restore-test` Firebase project. The script refuses a project that already has
complaints, so it can't overwrite production by accident.

1. Point an env file at the target. For the emulators that's `.env.local` with
   `npm run emulators` running; for the restore-test project, a copy of
   `.env.production.local` with that project's ID and service-account key.
2. Run:
   ```
   npx tsx --env-file=<target env> --conditions=react-server scripts/restore-backup.ts backups/campusresolve-<time>.json.age path/to/backup.key
   ```
3. Read the report:
   - **All counts match**: every collection and sub-collection has the same number of documents
     as when the backup was taken.
   - **Photos found in storage**: every listed photo object exists. Missing ones are listed; the
     complaints still work, only those photos are gone.
4. Check access: create an admin on the restored project (`scripts/create-admin.ts`), sign in, and
   confirm the queue, a public complaint, a confidential complaint (admin only) and the hostel
   setup look right. Students' passwords still work because the hashes were restored, but their
   sessions don't carry over; they sign in again.
5. Log it in "Restore test log" below.

If you ever have to restore production itself: create a fresh Firebase project, deploy rules
and indexes (`npx firebase deploy --only firestore --project <alias>`), restore into it, point
Vercel's env vars at it, and redeploy.

## Restore test log

| Date | Backup file | Target | Counts | Photos | Checked by |
| --- | --- | --- | --- | --- | --- |
| 2026-10-22 | emulator data (automated test + script run) | emulators | match | n/a | Claude |
