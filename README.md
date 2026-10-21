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

Checks: `npm run lint`, `npm run typecheck`, `npm test` (unit), `npm run test:emu` (rules + integration, starts emulators itself).
