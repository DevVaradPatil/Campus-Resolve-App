# Launch checklist (Phase 8)

Where the pilot stands against the PRD's launch blockers (§18), Definition of Done (§19) and
operational acceptance (§15.4), then the steps to go live. ✅ done · ⏳ waiting on the owner ·
🔜 done at cut-over.

## Launch blockers (PRD §18)

| # | Blocker | Status |
| --- | --- | --- |
| 1 | Secure activation, login, recovery | ✅ Built and tested (Phase 2: identical errors, scrypt, rate limits, one-time HMAC codes, reset = reissue). Phase 7 added headers, App Check and leak tests. A human security review of the custom auth is still worth doing before real accounts. |
| 2 | Hosting allowed on the free plan | ⏳ Owner confirms the Vercel Hobby terms fit a non-commercial student pilot (D1). |
| 3 | Verified recovery | ✅ on the emulators · ⏳ one real restore into `campusresolve-restore-test` ([RECOVERY.md](RECOVERY.md)). |
| 4 | Operational contacts | ⏳ Primary admin, backup, verified contact directory and emergency numbers. |
| 5 | Pilot policies | ⏳ Priority targets, closure windows, retention, photo rules, privacy notice and rules (drafts at `/privacy`, `/rules`). |

## Definition of Done (PRD §19)

| Requirement | Status |
| --- | --- |
| Students securely activate and sign in | ✅ |
| Submit, view and track a complaint | ✅ |
| Admins assign, escalate, resolve and close | ✅ (plus auto-close and overdue escalation) |
| Public feed exposes no private data or confidential photos | ✅ (allowlist projection, rules, tests) |
| Comments, votes, duplicates, uploads validated and abuse-protected | ✅ |
| Notifications and audit events recorded | ✅ |
| Dashboard shows accurate statistics | ✅ (fixture-tested) |
| Tested security controls and working recovery | ✅ · ⏳ real restore test |
| Fits the zero-paid budget and provider terms | ✅ free tiers only · ⏳ Hobby terms (blocker 2) |
| Small pilot passed acceptance, with defect/incident process | 🔜 pilot · ✅ process in [OPERATIONS.md](OPERATIONS.md) |

## Operational acceptance (PRD §15.4)

| Requirement | Status |
| --- | --- |
| Separate dev and production credentials | 🔜 cut-over below |
| HTTPS | ✅ Vercel, plus HSTS |
| Usage and quota checks documented | ✅ OPERATIONS.md |
| Errors investigable without exposing sensitive data | ✅ generic client errors, server logs in Vercel |
| Privacy notice and acceptable-use rules available | ✅ drafts · ⏳ approval |
| Admin onboarding and revocation documented | ✅ OPERATIONS.md |
| Backup and restore tested | ✅ emulators · ⏳ real project |
| Mobile usability and accessibility | ✅ axe at phone width · 🔜 real phones during the pilot |
| Provider eligibility and terms verified | ⏳ blocker 2 |

## Cut-over to production

Vercel keeps one project: **Preview** deployments use the dev Firebase project, **Production**
(the `main` branch) uses the production one. Owner steps are marked (owner); the rest Claude
can run once the owner's parts are done.

1. (owner) Create Firebase project `campusresolve-prod` on Spark: Authentication on, Firestore in
   Native mode (Mumbai), register a web app, generate a service-account key.
2. (owner) Create a second Supabase project (or a separate private bucket) for production and a
   new secret key. Never reuse dev keys.
3. (owner) Generate new `ACTIVATION_CODE_PEPPER`, `RATE_LIMIT_IP_SALT` and `CRON_SECRET`.
4. (owner) In Vercel → Environment Variables: move the current values to **Preview only**, then
   add the production values for **Production**: Firebase web config, `FIREBASE_*`, the three
   secrets, `SUPABASE_*`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (register the prod domain on the
   reCAPTCHA key and add the app in Firebase App Check).
5. `npx firebase use --add` → `campusresolve-prod` as alias `prod`, then
   `npx firebase deploy --only firestore --project prod`.
6. (owner) GitHub Actions secret `CRON_SECRET` → the new value (`SWEEP_URL` stays the same
   domain). Run the Sweep workflow once; it should report `supabase ok`.
7. (owner) `vercel env pull .env.production.local --environment=production`, then create the
   production admin (`scripts/create-admin.ts`) and seed hostel setup
   (`scripts/seed-dev.ts --real`), then replace placeholders at `/admin/config` with the approved
   blocks, contacts and emergency numbers.
8. (owner) Import the approved pilot roster and hand out codes in person or privately.
9. Take the first backup ([RECOVERY.md](RECOVERY.md)).
10. Once tokens show up valid in Vercel logs for a few days, set `APP_CHECK=enforce`.

## Running the pilot

- **First week:** an admin checks the queue morning, afternoon and evening; critical complaints
  as they arrive. Committee checks overdue/escalated and moderation daily.
- **Weekly:** quota checks and a backup (OPERATIONS.md, RECOVERY.md); skim Vercel logs for
  errors and `App Check invalid`.
- **Feedback:** in-app ratings on closed complaints, plus a short end-of-pilot survey
  (owner's choice of free form tool) on usefulness, trust and privacy.
- **Defects and incidents:** OPERATIONS.md → Incidents / Reporting a bug.

## Pilot review (end of pilot)

From `/admin` (90-day view) and the CSV export:

- Resolution rate and median time to resolve, by category
- On-time first response rate per priority: are the targets realistic?
- Routing accuracy: how often complaints were reassigned
- Reopen rate and closures by reason (confirmed vs. auto-closed)
- Recurring issues and duplicates
- Feedback average and survey themes
- Defects and incidents logged

Adjust targets, closure windows, categories and routing at `/admin/config`, record what changed
and why in plan.md, and decide whether to continue.
