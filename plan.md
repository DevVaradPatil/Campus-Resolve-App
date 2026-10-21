# CampusResolve — Development Plan

Source of truth for scope: [CampusResolve_PRD.md](CampusResolve_PRD.md). This file is the execution plan.
Tick boxes as work lands. Manual/account tasks for the owner live in [TODO.md](TODO.md).

**Build order (PRD §20):** auth & permissions → complaint submission & public/private separation →
admin workflow & escalation → dashboards & notifications → hardening & recovery → pilot.

## Status

| Phase | Name | Status |
|---|---|---|
| 0 | Decisions, spikes & scaffold | 🟨 Scaffold done; deployed spike waits on accounts (TODO.md) |
| 1 | Design system | ✅ Done (real-phone/axe pass deferred to Phase 7) |
| 2 | Foundation: roster, auth, roles, audit | ✅ Done (security review in Phase 7) |
| 3 | Complaint core: submit, route, upload, feed | ⬜ Not started |
| 4 | Workflow: assign, status, deadlines, escalate, resolve, close, reopen | ⬜ Not started |
| 5 | Community & notifications | ⬜ Not started |
| 6 | Dashboards, contacts, analytics, export | ⬜ Not started |
| 7 | Hardening & recovery | ⬜ Not started |
| 8 | Deploy & pilot | ⬜ Not started |

Legend: ⬜ not started · 🟨 in progress · ✅ done (exit criteria met)

---

## Open decisions (resolve in Phase 0)

| ID | Decision | Recommended default | Why it matters |
|---|---|---|---|
| D1 | Hosting runtime | **Vercel Hobby, Node.js runtime** — if owner accepts Hobby terms (personal, non-commercial). Fallback: Cloudflare Workers via OpenNext. | `firebase-admin` and `sharp` run on Node out of the box. Workers would need custom-token signing via `jose`, Firestore via REST, and a non-native image pipeline — significant extra work. |
| D2 | Image storage | **Cloudflare R2** if it can be enabled without breaking the zero-paid rule. Fallback: **Supabase Storage** (free tier, private buckets, signed URLs). | R2 asks for a payment method on file before it can be enabled (verify current terms). PRD §8.4 treats a payment-details requirement as a launch blocker. Firebase Storage now needs the Blaze plan, so it's out. All storage calls go through one server module, so changing provider stays a one-file change. |
| D3 | Scheduled jobs (deadlines, reminders, auto-close) | **GitHub Actions cron every 30 min** → `POST /api/cron/sweep` with `CRON_SECRET`. Admin/committee dashboard loads also trigger an opportunistic sweep. | Spark plan has no Cloud Functions, and Vercel Hobby cron runs only once a day. Critical-priority escalation fires right away at creation, so it doesn't wait for the sweep. |
| D4 | Password hashing | `scrypt` from `node:crypto` (N=2^15, r=8, p=1, 16-byte salt, constant-time compare). | Native on Node, with no binary dependency. Revisit only if D1 picks Workers. |
| D5 | Session model | Firebase client SDK holds the session. API calls send `Authorization: Bearer <ID token>`. No cookie sessions in MVP. | Keeps CSRF off the table. Protected pages fetch on the client, and server routes enforce access. |
| D6 | Ticket IDs | `CR-000123` from a transactional counter doc `systemSettings/ticketCounter`. | Human-readable and server-generated (PRD §10.1). Contention is irrelevant at pilot scale. |

---

## Target architecture (summary)

- **Next.js (App Router) + TypeScript, strict mode.** Tailwind CSS v4. Radix primitives (shadcn-style, copied in, not a dependency maze). `zod` for every input. Vitest for unit tests, Firebase Emulator + `@firebase/rules-unit-testing` for rules, Playwright for E2E.
- **Trust boundary:** every write goes through Next.js route handlers using the Firebase **Admin SDK**. Firestore rules **deny all client writes**. Client SDK reads are an explicit allowlist:
  - `publicComplaints/*`: authenticated, active users only.
  - `notifications/*` where `recipientUid == request.auth.uid`.
  - Everything else (own complaints, admin queues, events, attachments) is served by API routes, which return role-shaped DTOs.
- **Public/private split:** `complaints/{id}` is the internal record and is never client-readable. `publicComplaints/{id}` is a denormalized projection built **only** by `toPublicComplaint()`. It has no reporter UID, no room reference and no private attachments. Confidential complaints never get a public doc.
- **Every privileged route:** `requireUser()` (verify ID token + load `users/{uid}`, reject inactive) → `requirePermission()` → `zod.parse()` → transaction (state change + `events` doc + `auditLogs` doc) → notifications.
- **Status changes** only via the pure state machine in `lib/domain/lifecycle.ts`.
- **Images:** client pre-check → `POST /api/uploads` (auth, rate limit, type) → server validates magic bytes, re-encodes with `sharp` (strips EXIF), stores under a generated key → Firestore attachment metadata. Private reads go through short-lived signed URLs from an authenticated endpoint.

Planned layout:

```
src/app/                 routes: (auth)/, (student)/, admin/, committee/, api/
src/components/ui/       design-system primitives
src/components/          feature components
src/lib/domain/          pure logic (lifecycle, priority, deadlines, routing, schemas) — unit-tested
src/lib/server/          server-only: firebase-admin, auth guards, storage, rate limit, audit, notify
src/lib/client/          firebase client init, authed fetch wrapper
firestore.rules, firestore.indexes.json, firebase.json
scripts/                 create-admin, seed-dev, export-backup, restore-backup
tests/rules/, tests/e2e/
.github/workflows/       ci.yml, sweep-cron.yml
```

---

## Phase 0 — Decisions, spikes & scaffold

**Goal:** prove the risky integrations on the chosen runtime before building features.

- [x] `git init`, `.gitignore` (env files, service-account JSON, `.firebase/`, emulator data)
- [x] Scaffold Next.js 16.4 + TS (strict) + Tailwind v4 + ESLint + Prettier. Uses npm.
- [x] Scripts: `dev`, `build`, `lint`, `typecheck` (runs `next typegen` first), `format`, `test` (unit, `src/`), `test:emu` (rules + integration under emulators, `tests/`), `emulators`. `test:e2e` (Playwright) gets added with the first E2E test in Phase 4.
- [x] `firebase.json` with Auth + Firestore emulators on project `demo-campusresolve` (offline, no real project needed), deny-all `firestore.rules`, empty `firestore.indexes.json`
- [x] `.env.example` listing every variable (names only)
- [x] `src/lib/server/env.ts` (zod, `server-only`), `src/lib/server/firebase-admin.ts`, `src/lib/client/firebase.ts`. Both SDKs auto-target the emulators when `NEXT_PUBLIC_USE_EMULATORS=true`.
- [x] `npm overrides` pins `@grpc/grpc-js@^1.14.6` (the Firebase client SDK ships a vulnerable 1.9.x). `npm audit --omit=dev` is clean.
- [ ] **Runtime spike on D1 target**, deployed preview (blocked on the Vercel/Firebase/R2 accounts in TODO.md):
  - [x] Admin SDK `createCustomToken` → client `signInWithCustomToken` → `verifyIdToken`: passes against emulators (`tests/integration/custom-token.test.ts`). Still needs re-checking on a Vercel preview with a real service account.
  - [x] Admin SDK concurrent Firestore transactions (ticket counter) pass against emulators. Still needs re-checking from a deployed route handler.
  - [ ] `sharp` re-encode + EXIF strip inside a deployed route handler
  - [ ] Signed upload/download URL against R2
  - [x] `scrypt` N=2^15, r=8, p=1: ~51 ms locally. Needs `maxmem: 64 MiB`, since the default 32 MiB is too small. Re-time on Vercel (target under 300 ms).
- [ ] Record outcomes of D1–D6 in this file. D1/D2 are assumed to be Vercel + R2 for now, pending the TODO.md checks.
- [x] CI workflow `.github/workflows/ci.yml`: lint, prettier, typecheck, unit, emulator tests, build (Node 24 + Java 21)

**Exit:** all spike checks pass on the chosen runtime, decisions recorded, CI green on an empty app.

---

## Phase 1 — Design system

**Goal:** one coherent, accessible, mobile-first visual language before feature screens. Direction (PRD Appendix A, Round 4): *friendly campus-community, trustworthy, calm* — not a corporate ticketing tool.

**Decided direction: "the hostel complaint register."** Ballpoint-blue ink (`--ink #2433A6`) on cool register paper (`--paper #F6F7F9`, `--sheet #FFF`), graphite text, ruled lines (`--rule`). A highlighter yellow (`--highlight #FFE45C`) marks the single pending action on a screen and is used nowhere else. Type is Atkinson Hyperlegible Next only (built for low-vision legibility), 16px body, minor-third scale. Each screen gets one sheet (`Panel`), and lists inside it are ruled rather than boxed as separate cards. Radius hierarchy: surface 16 > control 10 > thumbnail 8, with pill chips. Shadows only on overlays. Dark theme is blue-black (`--paper #080B14`, `--sheet #0F1320`), darker than navy but not pure black.

**Tokens** (`src/app/globals.css`: CSS variables → Tailwind `@theme inline`)
- [x] Color: neutrals, ink primary, highlighter, semantic success/warning/danger/info, light + dark
- [x] Status palette: Submitted, Assigned, In progress, Resolved, Closed, Reopened. Each pairs color + icon + label. **Escalated is a separate badge**, because it's a flag/event rather than a status (PRD §6.1).
- [x] Priority: signal-bar glyph + word. Only Critical/High carry color.
- [x] Type scale, radii, overlay shadow, motion (`sheet-in`, `fade-in`). Reduced motion is honoured globally.
- [x] Contrast: every text/background pair checked with a WCAG script. Light ranges 5.8–14.5:1, dark 6.4–16.2:1, input borders 3.1:1.

**Primitives** (`src/components/ui/`)
- [x] `button.tsx`: Button (primary/secondary/ghost/destructive, loading, icon), IconButton (label required), `buttonClass()` for links
- [x] `field.tsx`: Field (label/hint/error/required wired by context), Input, Textarea (required `maxLength` + counter), Select (native), Checkbox, Radio, **OptionCard** (radio card), Switch, FormErrorSummary. *Combobox dropped:* category uses OptionCards and location uses cascading native selects, which work better on phones.
- [x] `badge.tsx`: StatusBadge, EscalatedBadge, PriorityBadge, Tag, TicketId (tabular figures), Highlight, Pseudonym chip
- [x] `overlay.tsx` (Radix): Dialog with `sheet` (bottom sheet on phones) / `center` variants, Menu, Tabs (scrollable underline), Tooltip
- [x] `toast.tsx` (Radix Toast): `ToastProvider` in root layout, `useToast()`
- [x] `feedback.tsx`: Banner (tones; `danger` uses role=alert), EmptyState (always with a next step), ServiceUnavailable
- [x] `spinner.tsx`: Spinner, Skeleton
- [x] `surface.tsx`: Panel, RuledList, LoadMore (cursor pagination, no page numbers), DataTable (table on md+, stacked rows on phones)
- [x] `media.tsx`: Thumbnail + lightbox, UploadDropzone (per-file progress/error; caller does validation). Uses plain `<img>`, since signed URLs mustn't go through the Next image cache.

**Patterns** (`src/components/`)
- [x] `app-shell.tsx`: mobile bottom tab bar (Feed, Mine, raised New, Alerts, More), desktop sidebar with role items (Admin queue / Committee), skip link, unread badge
- [x] `issue.tsx`: IssueRow (stretched-link feed row), LocationPath (chevron path; never a room number), StatusTimeline, Stepper, `PublicIssue` view type
- [x] `notices.tsx`: PilotNotice (always on in the shell), EmergencyNotice (tel: links), PublicPhotoNotice, NotificationItem
- [x] Complaint detail and the guided form get assembled from these in Phase 3. The gallery shows the pieces.

**Quality bar**
- [x] AA contrast (script), 3px focus ring on every focusable, 44px targets (audited in browser; checkbox/radio hit areas are their 44px label rows), labelled controls, Radix keyboard handling for dialogs/menus/tabs
- [x] `/dev/design` gallery (`src/app/dev/design/`) renders every primitive and state. Production build returns 404 (verified with `next start`).
- [ ] Real-phone check and axe pass, done in the Phase 7 accessibility sweep

**Exit:** gallery complete, contrast verified ✅. Phase 2 screens must use these primitives, not one-off styles.

---

## Phase 2 — Foundation: roster, auth, roles, audit

**Goal:** verified activation, secure login, server-enforced roles, audit trail from day one (PRD §4.1, §9, §3).

**Data model (as built)**, all server-only (rules deny clients):
- `users/{uid}`: profile + `role` + `grants` + `active` + public `pseudonym`. UID is random and stable across room changes.
- `accounts/{loginId}`: credentials only (`uid`, scrypt `passwordHash`). `loginId` is the normalized roll number for students and `admin:<handle>` for admins, so admin credentials are always separate (PRD §9.2).
- `roster/{rollNumber}`: eligibility, name, block/floor/room, linked `uid` once activated.
- `activationCodes/{rollNumber}`: one live code per student, stored as an HMAC bound to the roll number, 7-day expiry, `consumedAt`.
- `rateLimits/{sha256(key)}`: fixed-window counters with `expiresAt` (TTL policy, see TODO.md). `auditLogs/{id}`: append-only.

Domain & data
- [x] `normalizeRollNumber()` / `toLoginId()` (`src/lib/domain/identity.ts`)
- [x] zod input schemas (`schemas.ts`), server doc types (`src/lib/server/types.ts`)
- [x] Permissions (`permissions.ts`): role base sets + explicit committee `grants`. Grants can never unlock roster, roles or confidential access. Custom claims are not the source of truth: `requireUser()` reads `users/{uid}` every request.
- [x] Pseudonyms (`pseudonym.ts`), assigned once at activation

Server (`src/lib/server/`)
- [x] `audit.ts`: `writeAudit()` inside the same transaction/batch as the change, plus `audit()` for standalone failures
- [x] `rate-limit.ts`: transactional fixed window, per account + per HMAC-hashed IP (limits from PRD §12.2, IP limits generous for campus NAT)
- [x] `auth.ts`: `requireUser()` (token + active check every request), `requirePermission()`, `toMe()`
- [x] `crypto.ts`: scrypt hashing (N=2^15), dummy-hash timing equalization, activation code generation/HMAC, IP hashing
- [x] `http.ts`: `route()` wrapper (HttpError/ZodError → JSON, everything else → generic 500), `readJson()`, `clientIp()`
- [x] `accounts.ts`: activate, login, changePassword, issueCodes (doubles as the **admin-controlled reset**: clears the password hash and revokes sessions), setActive, changeRoom, setRole (admin role only on admin-namespace accounts, never on yourself), importRoster (preview/apply, removed or ineligible students deactivated), createAdmin
- [x] `scripts/create-admin.ts` → `npm run create-admin -- <handle> "<Name>"` (hidden password prompt)
- [x] Routes: `POST /api/auth/{activate,login,change-password}`, `GET /api/me`, `GET /api/admin/roster`, `POST /api/admin/roster/{import,codes}`, `POST /api/admin/roster/[roll]/room`, `POST /api/admin/users/[uid]/{active,role}`

Client
- [x] `src/lib/client/api.ts` (authed fetch, ApiError) and `auth.tsx` (AuthProvider, `useAuth`, session from Firebase client SDK, profile from `/api/me`, auto sign-out on 401)
- [x] `(auth)` screens: `/login`, `/activate`, `/admin/login`. `(app)` screens behind `RequireAuth`: feed placeholder, `/more` (profile, change password, sign out), `/admin`, `/admin/roster` (CSV import with preview, search, codes handout + CSV download, reset, deactivate/reactivate, room change, committee toggle)
- [x] `PasswordInput` primitive (show/hide), added to the gallery
- [x] `next.config.ts`: `instantInsights.validationLevel: "manual-warning"`, because signed-in screens are client-rendered by design (D5)

Rules & tests
- [x] Rules: still deny-all. Tests cover users, accounts, roster, activationCodes, rateLimits, complaints, auditLogs, notifications.
- [x] Unit (20): identity, permissions, CSV/roster parse + diff, scrypt + codes, rate-limit window
- [x] Integration (emulator, 18): import preview/apply/errors/removal, activation happy path, replay (FR-02), expiry, cross-roll code, off-roster/ineligible (FR-01), identical error messages, password containing roll number, login generic errors, lockout after 5, admin namespace, deactivation takes effect on the next call, reset keeps UID, change password, room change keeps UID, role rules, 401/403 on admin routes
- [x] Browser check (emulators): admin sign-in → import (bad row caught) → issue codes → student activation → feed/profile → student blocked from admin area. Console clean.
- [ ] Bulk role grants UI (committee leads' extra permissions): API supports `grants`, UI only toggles committee membership. Add with Phase 6 settings if needed.

**Exit (PRD Phase 1):** ✅ verified activation, secure login and role checks work end to end. FR-01 and FR-02 pass. Security review of the custom auth (Launch Blocker 1) still happens in Phase 7.

---

## Phase 3 — Complaint core: submit, route, upload, feed

**Goal:** students submit, view and track complaints with no cross-account leakage (PRD §4.2, §5, §11).

Config data
- [ ] `categories` (PRD §5.1 seed, with subcategories, priority rule, closure window from §6.3) and admin CRUD
- [ ] `locations` (block → floor → common area types from §5.2) and admin CRUD
- [ ] `contacts` and `routingRules` (category ± location → contact, with fallback queue) and admin CRUD
- [ ] `scripts/seed-dev.ts` for emulator data

Domain (pure, unit-tested)
- [ ] `priority.ts`: category rule → priority + `priorityRule` id. A student "urgent" flag is recorded but doesn't change priority.
- [ ] `deadlines.ts`: first-action deadline from priority (§6.2: 1h/8h/48h/5d)
- [ ] `routing.ts`: most-specific match wins (category+location > category > fallback)
- [ ] `safeLocationLabel()`: builds e.g. "Block B · Second floor · Common bathroom" and never includes the room reference
- [ ] `toPublicComplaint()`: the **only** public projection

Server
- [ ] `POST /api/complaints`: rate limit (5/h) → zod (length caps) → ticket ID → priority, deadline, routing → transaction writes `complaints`, `events` (created), `auditLogs`, and `publicComplaints` unless confidential. Idempotency key from the client to block duplicate submits (§12.3).
- [ ] Critical priority → immediate escalation notification to the designated lead (hook ready for Phase 5 notifications)
- [ ] `POST /api/uploads`: auth, ticket ownership, ≤3 files/complaint, ≤5 MB, 10/h rate limit, magic-byte check (JPEG/PNG/WebP only) → `sharp` rotate + re-encode to WebP/JPEG + strip metadata → generated key → `attachments` doc with privacy class. Reject SVG/HTML/anything else (FR-04).
- [ ] `GET /api/attachments/:id/url`: authorize per complaint visibility → short-lived signed URL. Public images on public complaints are served only once their publication state is `published`.
- [ ] `GET /api/complaints/mine` (paginated) and `GET /api/complaints/:id`, with the DTO shaped by role (owner sees own private fields; others get the public shape or 404)

Client
- [ ] Guided New Complaint form (Phase 1 pattern), local draft persistence, visibility review step with public-photo notice
- [ ] My complaints list + detail with timeline
- [ ] Public feed: client SDK on `publicComplaints`, paginated (page size ≤ 20), filters (category, status, block), tabs (Trending, Unresolved, Recently resolved, Most supported), title search (prefix/keyword-token field. No full-text service, which keeps it zero-cost.)

Indexes & rules
- [ ] `firestore.indexes.json` for feed/filter queries (PRD §10.2)
- [ ] Rules: `publicComplaints` readable by authenticated users whose `users/{uid}.active == true`

Tests
- [ ] Unit: priority, deadlines, routing (FR-06), location label, public projection never contains private keys (assert on key set)
- [ ] Security: student B can't fetch student A's private complaint/attachment by ID; confidential complaint absent from feed and search; malformed/oversized/SVG uploads rejected
- [ ] FR-03, FR-04, FR-05, FR-06

**Exit (PRD Phase 2):** submit → view → track works with no cross-account leakage.

---

## Phase 4 — Workflow: assign, status, deadlines, escalate, resolve, close, reopen

**Goal:** complete lifecycle with an accurate history (PRD §4.3, §6).

- [ ] `lifecycle.ts`: allowed transitions `Submitted → Assigned → In progress → Resolved → Closed`, plus `Reopened` (from Resolved/Closed → active) and the Escalated flag/event. Rejected/hidden is a moderation action with a mandatory reason, not a status.
- [ ] Admin routes (each runs a transaction + event + audit + public projection update):
  - [ ] assign/reassign contact (assignment history)
  - [ ] status update with admin-recorded progress note (labelled "recorded by admin", PRD §17)
  - [ ] priority override with required reason
  - [ ] resolve: notes + optional evidence photo, sets `confirmationDeadline` = now + category window
  - [ ] hide/reject with reason
- [ ] Student routes: confirm resolved (`student_confirmed`), report "still an issue" → Reopened. Reopening clears the resolution and computes a fresh first-action deadline (§6.1).
- [ ] Committee route: escalate overdue complaint (permission-checked)
- [ ] `POST /api/cron/sweep` (secret-protected, idempotent, bounded batch):
  - [ ] unassigned past threshold → reminder, then escalate to backup contact
  - [ ] overdue first action → mark escalated + notify lead
  - [ ] resolved past confirmation window → Closed with `confirmation_window_expired`
  - [ ] pre-closure reminder to reporter
- [ ] `.github/workflows/sweep-cron.yml` (D3)
- [ ] Admin queue UI: filters (status, priority, category, block, assignee), overdue-first sort, bulk-safe single actions, complaint detail with internal timeline
- [ ] Committee views: public complaints, overdue/escalated list, escalate action
- [ ] Feedback capture on close (rating + optional comment)

Tests
- [ ] Unit: every allowed/forbidden transition, reopen resets deadline, closure reasons
- [ ] Security: student cannot change status/priority/assignment/owner via API manipulation. Committee cannot assign/resolve (FR-07).
- [ ] Integration: sweep closes only expired items, is idempotent across double runs (FR-11, FR-12)
- [ ] E2E: submit → assign → resolve → auto-close. Submit → resolve → reopen.

**Exit (PRD Phase 3, part 1):** full lifecycle and permission tests pass.

---

## Phase 5 — Community & notifications

**Goal:** upvotes, comments, duplicates, moderation, in-app notifications (PRD §4.4, §13).

- [ ] Upvotes: `complaints/{id}/votes/{uid}` toggle in a transaction, updating `supportCount` on the internal and public docs. Rate limit 30/10 min (FR-09).
- [ ] Comments: create (10/10 min, length cap, plain text rendered safely), author shown by pseudonym, admin/committee hide with reason (FR-10)
- [ ] Report content (complaint/comment/image) → moderation queue. Committee/admin resolve the report: hide, keep, or unpublish image without deleting the complaint (§11.3).
- [ ] Pseudonyms: consistent per-user alias generated at activation. Admin can force the generic "A resident" label.
- [ ] Duplicates: student "report as duplicate of…"; admin links duplicate → primary in a transaction. Both histories preserved, support counts aggregated on the primary, confidential reporter's identity and attachments never exposed through the link (FR-08).
- [ ] Notifications: `lib/server/notify.ts` creates notification docs with a dedupe key (type + ticket + recipient + time bucket). Creation is decoupled from delivery, so email can be added later.
  - [ ] Events: assignment, status change, resolution request, pre-closure reminder, reopen, comment on own complaint, escalation outcome, critical escalation to lead
  - [ ] Previews of confidential tickets carry no content (§12.4)
- [ ] Notification centre UI: unread count via a client listener limited to the latest 20, mark read / mark all read (via API)
- [ ] Preference: mute non-essential notifications
- [ ] Optional if capacity permits: follow complaints (not a launch blocker)

Tests: FR-08, FR-09, FR-10, FR-13. Rules test confirms a user can read only their own notifications.

**Exit (PRD Phase 3, part 2):** community features and notifications pass permission tests.

---

## Phase 6 — Dashboards, contacts, analytics, export

**Goal:** useful, honest statistics without exposing individuals (PRD §7).

- [ ] Stats aggregation: maintain `stats/{period}` counters (daily/weekly/monthly × category × block × status) updated in the same transactions as state changes. Dashboards read a handful of docs, not every complaint (quota, §8.3).
- [ ] `analytics.ts` (pure, unit-tested) implementing the PRD §7.4 definitions exactly: resolution rate (cohort + period shown), on-time handling rate, median/average resolution time, overdue count, recurring-issue rate
- [ ] Student dashboard: own summary, feed shortcuts, urgent issues, recent activity, quick create, contacts, hostel stats & category trends
- [ ] Admin dashboard: status overview, overdue queue, category/location trends, handling/resolution times, deadline compliance, workload labelled "assignments recorded in system" (§7.2), duplicates/recurring, feedback, week/month comparison
- [ ] Committee dashboard: public states, overdue/escalated, moderation queue, trends, escalation outcomes
- [ ] Every chart shows its counts and date range, and no aggregate drills down to a reporter
- [ ] Contact directory page (searchable) + emergency contacts block
- [ ] CSV export (admin, permission-gated): column allowlist that excludes confidential fields unless explicitly authorized, audited (FR-15). Escape cells against formula injection.

Tests: FR-14, FR-15, plus analytics unit tests with fixed fixtures.

**Exit:** dashboards match fixture expectations, and exports respect permissions.

---

## Phase 7 — Hardening & recovery

**Goal:** security, recovery and operational acceptance (PRD §12, §14, §15.2, §15.4).

Security
- [ ] Audit coverage review against the PRD §14.1 list. Add a test per admin action asserting an audit doc exists.
- [ ] Rate limits on every mutating route, confirmed with tests
- [ ] Security headers: CSP (nonce-based, image hosts allowlisted), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`
- [ ] CORS: same-origin only for `/api/*`
- [ ] App Check (reCAPTCHA v3 provider) enforced on API routes as a supplementary signal
- [ ] Error handling: generic client messages, structured server logs with secrets/PII redacted, Sentry free tier (optional) with PII scrubbing
- [ ] Dependency audit (`npm audit`), secret scan in CI
- [ ] Full security acceptance suite (PRD §15.2), automated where possible

Retention
- [ ] `retention.ts` + sweep step: delete or anonymize complaints 365 days after closure/last activity, including their attachments in storage. Audit logs pruned at 365 days. Rate-limit docs expire quickly (Firestore TTL policy on `expiresAt`, which works on Spark; verify).

Backup & recovery (zero-paid fallback, §14.3)
- [ ] `scripts/export-backup.ts`: dump the authorized collections + attachment manifest → JSON → encrypt with `age` (public key in repo, private key offline) → write locally
- [ ] `scripts/restore-backup.ts`: decrypt → load into a separate Firebase project/emulator → verify counts → reconcile attachment manifest against storage (FR-16)
- [ ] `docs/RECOVERY.md`: step-by-step restore + role verification
- [ ] Perform and log a real restoration test

Ops docs
- [ ] `docs/OPERATIONS.md`: quota/usage checks (Firebase, storage, host), admin onboarding/offboarding, account revocation, incident & defect reporting
- [ ] Privacy notice + acceptable-use pages in the app (content approved by owner, see TODO.md)
- [ ] Mobile + accessibility pass (Lighthouse/axe on key screens, real phone check)

**Exit (PRD Phase 4):** security, recovery and operational acceptance criteria pass.

---

## Phase 8 — Deploy & pilot

- [ ] Separate dev and prod Firebase projects + storage buckets + secrets (§15.4)
- [ ] Deploy rules + indexes from version control (`firebase deploy --only firestore`)
- [ ] Production deploy on the D1 host with HTTPS on the free subdomain
- [ ] Sweep cron pointed at production
- [ ] Seed production categories, locations, approved contacts and policies (from TODO.md approvals)
- [ ] Bootstrap prod admin, import pilot roster (10–25 students), distribute activation codes
- [ ] Pilot runbook: monitoring cadence, who watches the critical queue, feedback form
- [ ] Pilot review: resolution rate, deadline fit, routing accuracy, defects → adjust policies
- [ ] Definition of Done (PRD §19) checklist signed off

**Exit (PRD Phase 5):** no unresolved critical security issues, verified recovery, documented pilot review.

---

## Acceptance traceability

| FR | Phase | | FR | Phase |
|---|---|---|---|---|
| FR-01 roster-only activation | 2 | | FR-09 one vote | 5 |
| FR-02 one-time codes | 2 | | FR-10 comments | 5 |
| FR-03 submit | 3 | | FR-11 closure windows | 4 |
| FR-04 upload rejection | 3 | | FR-12 reopen | 4 |
| FR-05 ticket ID + audit | 3 | | FR-13 notifications | 5 |
| FR-06 routing | 3 | | FR-14 analytics | 6 |
| FR-07 authorized actions | 4 | | FR-15 CSV export | 6 |
| FR-08 duplicates | 5 | | FR-16 restore | 7 |

## Deferred (do not build in MVP)

Email/WhatsApp/SMS, PWA install, maps, staff accounts, multi-hostel, institutional SSO, AI classification, leaderboards, payments.

## Change log

- 2026-10-21: Plan created from PRD v1.0.
- 2026-10-22: Phase 2 landed: roster, activation, login, roles, audit, rate limits; admin roster UI. tsx added for scripts.
- 2026-10-22: Dark mode darkened to blue-black.
- 2026-10-21: Phase 1 design system landed (radix-ui, lucide-react, clsx). Gallery at `/dev/design`.
- 2026-10-21: Phase 0 scaffold landed (Next 16.4.2, React 19.3, firebase 13.1, firebase-admin 14.5, zod 4, vitest 5). Emulator tests green.
