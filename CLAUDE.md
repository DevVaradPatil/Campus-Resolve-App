# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state & working files

CampusResolve is a mobile-first hostel complaint tracker for an IIT Kanpur student-led pilot (10–25 users), with a **strictly zero-paid** budget.

- [CampusResolve_PRD.md](CampusResolve_PRD.md): product spec. Check it when behavior is ambiguous.
- [plan.md](plan.md): phased execution plan with checkboxes and open decisions D1–D6. **Read it at the start of every session.** Tick tasks as they land, update the phase status table, and record decisions in the plan itself.
- [TODO.md](TODO.md): manual tasks for the owner (accounts, keys, credentials, approvals, real-world info). Whenever work needs something only the owner can provide, add it there. Never add testing items to TODO.md.

## Commands

```
npm run emulators      # Auth + Firestore emulators on offline project demo-campusresolve (UI :4000). Needs Java 21+.
npm run dev            # Next.js dev server; with NEXT_PUBLIC_USE_EMULATORS=true both SDKs hit the emulators
npm run lint ; npm run typecheck ; npx prettier --check .
npm test               # Vitest unit tests under src/ (no emulators)
npm run test:emu       # tests/ (rules + integration); starts and stops emulators itself
npx vitest run src/lib/domain/lifecycle.test.ts -t "reopen"   # single unit test
npx firebase emulators:exec --only auth,firestore --project demo-campusresolve "npx vitest run tests/rules/deny-all.test.ts"   # single emulator test
```

- Next.js is **16.4**. Read `AGENTS.md` and the bundled docs in `node_modules/next/dist/docs/` before using Next APIs, because they differ from older versions (e.g. `proxy` instead of `middleware`, `cacheComponents` is on).
- Vitest aliases `server-only` to an empty module (`vitest.config.mts`), so tests can import `src/lib/server/*` directly.

## Architecture invariants

Stack: Next.js App Router + TypeScript (strict), Tailwind, Firebase Auth (custom tokens) + Firestore on the **Spark plan** (no Cloud Functions), image storage on R2 or a fallback (decision D2), hosting decided in D1.

- **All writes go through Next.js route handlers using the Admin SDK.** `firestore.rules` denies every client write. Client SDK reads are a narrow allowlist: `publicComplaints` and the user's own `notifications`. Everything else is served by API routes that return role-shaped DTOs.
- **The Admin SDK bypasses rules**, so every privileged route must run, in order: `requireUser()` (verifies the ID token, loads `users/{uid}`, rejects `active=false`) → `requirePermission()` → `zod` parse → transaction. Never rely on client-side role checks.
- **Public vs private:** `complaints/{id}` is the internal record and is never client-readable. `publicComplaints/{id}` is built **only** by `toPublicComplaint()`. It must never contain the reporter UID, roll number, name, room reference or private attachments. Confidential complaints get no public doc. Confidentiality also applies to search, comments, duplicate links, exports, image URLs and notification previews.
- **State changes** go only through the pure lifecycle module. Each one writes the complaint update, an `events` subdoc, an `auditLogs` doc and the public projection in **one transaction**, using server timestamps.
- **Identity:** relationships use the stable random UID, never the roll number. The roll number always passes through `normalizeRollNumber()`. A room number is profile data and is never an authenticator.
- **Auth:** login and activation responses must not reveal whether a roll number exists. Passwords are hashed with scrypt, activation codes are stored as HMACs, and both routes are rate-limited per account and per hashed IP.
- **Scheduled work** (deadline escalation, reminders, auto-close) runs in the secret-protected `POST /api/cron/sweep`, triggered by GitHub Actions. It must be idempotent and bounded.
- **Uploads:** check magic bytes (JPEG/PNG/WebP only), re-encode with `sharp` to strip EXIF, use server-generated object keys, and serve private images only via short-lived signed URLs.
- **Quota-aware:** paginate everything (≤20 per page), keep listeners scoped to visible records, and read dashboards from pre-aggregated `stats` docs. On failure, surface a clear error and never drop a submission.

## UI conventions

- Build screens from `src/components/ui/*` and `src/components/*` and their tokens (`bg-sheet`, `text-ink`, `text-muted`, `border-rule`, `bg-st-*`...). Don't use raw Tailwind palette colors (`blue-600`) or hex values. See `/dev/design` (dev only) for every primitive. Add new primitives there too.
- `Highlight` (yellow) marks the one pending user action on a screen, and nothing else.
- Every free-text input has a `maxLength`. Every interactive element has a 44px target. Icon-only buttons go through `IconButton` (label required).
- Dates go through `formatDateTime` (fixed `en-IN` / `Asia/Kolkata`) so server and client render identically.

## Constraints

- Never add a paid service, or a provider that needs billing details, without the owner's explicit approval (PRD §8.4).
- The UI must not imply that the app is an official IIT Kanpur channel or that staff have agreed to SLAs. Show the emergency-contacts notice wherever urgent issues come up.
- Deferred, so don't build: email/SMS/WhatsApp, PWA, maps, staff accounts, multi-hostel, SSO, AI classification.
