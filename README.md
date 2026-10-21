# CampusResolve

Hostel complaint tracker for an IIT Kanpur student-led pilot. Spec: `CampusResolve_PRD.md`. Plan: `plan.md`. Owner tasks: `TODO.md`.

## Local development

Needs Node 24+ and Java 21+ (for the Firebase emulators).

```bash
npm install
cp .env.example .env.local
npm run emulators   # terminal 1: Auth + Firestore emulators, UI at http://127.0.0.1:4000
npm run dev         # terminal 2: http://localhost:3000
```

To sign in locally, create an admin in the emulators (data is wiped when the emulators stop):

```bash
npm run create-admin -- warden "Hostel Warden"
```

Use the emulator-only test password `hostel-dev-pass-01`, then sign in at http://localhost:3000/admin/login with ID `warden`. Import a roster at `/admin/roster`, issue a code, and activate a student at `/activate`.

Checks: `npm run lint`, `npm run typecheck`, `npm test` (unit), `npm run test:emu` (rules + integration, starts emulators itself).
