# TODO — Manual tasks for the owner

Things only you can do: accounts, keys, credentials, approvals, real-world info.
Claude adds items here as they come up. Tick them off when done. No testing items.
Secrets go in `.env.local` (dev) or the host's env settings (prod). **Never commit them or paste them in chat.**

## Before Phase 0 (needed to start)

- [x] ~~Decide hosting (D1)~~: **Vercel** (Hobby).
- [x] ~~Image storage billing (D2)~~: R2 wants a card, so **Supabase Storage** (free tier, no card). Setup is below.
- [x] ~~GitHub repo~~: `origin` is https://github.com/DevVaradPatil/Campus-Resolve-App and `main` is pushed.
- [x] ~~Install Node + Firebase CLI~~. Node 24 and Java 21 are present, and the Firebase CLI is a project devDependency.
- [x] ~~`firebase use --add`~~: `.firebaserc` has alias `dev` → `campusresolve-dev`. Local emulator work keeps using the offline `demo-campusresolve` project.
- [x] ~~Vercel → import the repo~~: live at https://campusresolveiitk.vercel.app (functions pinned to Mumbai `bom1` via `vercel.json`).
- [x] Run `npx firebase login` once (opens a browser), then deploy the security rules and indexes to the dev project: `npx firebase deploy --only firestore --project dev`

## Bootstrap the dev project

These run on your machine against `campusresolve-dev`, using the same values as Vercel:
- [x] `npx vercel login`, then `npx vercel link` (pick the project), then `npx vercel env pull .env.production.local --environment=production` (without `--environment` it pulls the empty Development set). That file is git-ignored; never commit or share it. Variables marked **Sensitive** in Vercel come down empty: paste those values into the file by hand.
- [x] First admin (you choose the password; Claude never sees it): `npx tsx --env-file=.env.production.local --conditions=react-server scripts/create-admin.ts <handle> "<Name>"`
- [x] Starter config (PRD categories + placeholder blocks/contacts/routing; skips fake emergency numbers; refuses if config already exists): `npx tsx --env-file=.env.production.local --conditions=react-server scripts/seed-dev.ts --real`
- [x] Then sign in at https://campusresolveiitk.vercel.app/admin/login and adjust blocks/contacts at `/admin/config`.

## Firebase — development project (Phase 0)

- [x] ~~Create Firebase project `campusresolve-dev`~~ (keep it on **Spark**, never upgrade to Blaze)
- [x] ~~Enable Authentication~~
- [x] ~~Create Firestore~~. Check it's in **Native mode**. The region can't change now; `asia-south1` (Mumbai) was the target.
- [x] ~~Register a Web app~~. Its config values go into Vercel (below). The snippet's `getAnalytics` / `measurementId` aren't used: the app has no analytics, which is a privacy choice.
- [x] Project settings → Service accounts → **Generate new private key**. From the JSON, put `client_email` → `FIREBASE_CLIENT_EMAIL` and `private_key` → `FIREBASE_PRIVATE_KEY` into Vercel (paste the key exactly, including the `-----BEGIN…` lines). Then delete the JSON file or store it outside the repo. Never paste it in chat.

## Image storage — Supabase (D2)

- [ ] At supabase.com, create a free organization + project (no card needed). Region **South Asia (Mumbai)**. Save the database password somewhere, though the app doesn't use the database.
- [ ] Storage → **New bucket** `attachments`, with **Public bucket OFF**. Under its settings, set the file size limit to 5 MB and allowed MIME types to `image/webp`.
- [ ] Project Settings → API Keys → copy the **Project URL** and a **secret key** (`sb_secret_…`, or the legacy `service_role` key) into Vercel as `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, plus `SUPABASE_BUCKET=attachments`. The secret key bypasses all Supabase security: server env only, never `NEXT_PUBLIC_`.
- [ ] Note: free Supabase projects **pause after ~1 week of no activity**, which hides photos (complaints keep working) until you press Restore in the dashboard. The Phase 4 sweep cron will touch storage regularly to keep it awake.

## Vercel environment variables

Set these in Vercel → Project → Settings → Environment Variables. **Don't** set `NEXT_PUBLIC_USE_EMULATORS` there.
- [x] Public web config (from the Firebase web app snippet): `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` (`campusresolve-dev.firebaseapp.com`), `NEXT_PUBLIC_FIREBASE_PROJECT_ID` (`campusresolve-dev`), `NEXT_PUBLIC_FIREBASE_APP_ID`
- [x] Server: `FIREBASE_PROJECT_ID` (`campusresolve-dev`), `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- [x] Secrets: `ACTIVATION_CODE_PEPPER`, `RATE_LIMIT_IP_SALT` (generate as in "App secrets" below)
- [x] Storage: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_BUCKET`

## App secrets (Phase 2)

Not needed for local emulator work, which uses built-in dev values. Required for any real Firebase project.
Generate each with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` (32+ characters):
- [x] `ACTIVATION_CODE_PEPPER`: HMAC key for hashing activation codes. Changing it later invalidates every unused code.
- [x] `RATE_LIMIT_IP_SALT`: HMAC key for hashing IPs in rate-limit keys
- [ ] `CRON_SECRET`: shared secret for the sweep endpoint (also add it as a GitHub Actions secret in Phase 4)
- [x] Decide who the **first admin** is. For a real project, run this yourself with the real project's env file (Claude never sees the password):
  `npx tsx --env-file=.env.production.local --conditions=react-server scripts/create-admin.ts <handle> "<Name>"`
  Use a password you don't use anywhere else. Admins sign in at `/admin/login` with just the handle.
- [ ] In each real Firebase project: Firestore → **TTL policies** → add a policy on collection `rateLimits`, field `expiresAt`, so old rate-limit counters delete themselves. Check that TTL is available on the Spark plan. If it isn't, tell Claude and the sweep job will prune them instead.

## Approvals & real-world info (PRD Launch Blockers 4 & 5)

- [ ] **Primary admin** and **backup escalation contact** (names + who monitors the critical queue). A 1-hour critical target only works if someone actually watches it.
- [ ] **Contact directory**: verified names/roles/phone/email for each category (mess, canteen, maintenance, cleanliness, water/electricity), with consent to publish
- [ ] **Emergency contacts** to show in-app (campus security, health centre, fire). Verify the numbers.
- [ ] Approve or edit **priority targets** (Critical 1h, High 8h, Normal 48h, Low 5d)
- [ ] Approve or edit **closure windows** per category (Mess 48h, Canteen 48h, Infra 72h, Garden 48h, Water 24h, Other 72h)
- [ ] Approve the **category → priority rules** (e.g. which subcategories count as Critical: no water, electrical hazard…). The proposal is in `src/lib/domain/defaults.ts`; once real data exists you can edit it at `/admin/config`.
- [ ] Approve the **location hierarchy**: actual blocks, floors and common-area names for the hostel
- [ ] Approve the **one-year retention policy**
- [ ] Approve the **public-photo rules** and the **privacy notice / acceptable-use** text (Claude will draft them in Phase 7)
- [ ] Get the **pilot roster** CSV (roll number, block, floor, room, eligibility) from an authorized source, with permission to use it

## Phase 4 — Scheduler

- [ ] Generate a `CRON_SECRET` (same command as the other secrets) and add it to **Vercel** env vars, then redeploy
- [ ] GitHub repo → Settings → Secrets and variables → Actions: add `CRON_SECRET` (same value) and `SWEEP_URL` = `https://campusresolveiitk.vercel.app/api/cron/sweep`. Then Actions → Sweep → **Run workflow** once to check it goes green.
- [ ] Redeploy the Firestore indexes (Phase 4 added queue/sweep indexes): `npx firebase deploy --only firestore --project dev`. Index builds take a few minutes; until then the queue may error.
- [ ] Test complaints made before Phase 4 don't appear in the admin queue. Delete them in the Firebase console (`complaints` and `publicComplaints`) or just make new ones.

## Phase 7 — Hardening & recovery

- [ ] Register a **reCAPTCHA v3** site for App Check (free) → `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, and enable App Check in the Firebase console
- [ ] Optional: free **Sentry** account → `SENTRY_DSN` (skip if you'd rather not send error data to a third party)
- [ ] Install `age` and generate the backup keypair (`age-keygen -o backup.key`). Give Claude **only the public key**. Keep `backup.key` offline (e.g. a password manager or USB), never in the repo.
- [ ] Create a second Firebase project `campusresolve-restore-test` (Spark) to restore backups into

## Phase 8 — Production

- [ ] Create Firebase project `campusresolve-prod` (Spark) and repeat the Firebase steps above with **new** keys
- [ ] Create the production storage bucket + a new scoped token (never reuse the dev keys)
- [ ] Create the hosting project (Vercel/Cloudflare), connect the GitHub repo, and enter all prod env vars in the host dashboard
- [ ] Generate **new** prod values for `ACTIVATION_CODE_PEPPER`, `RATE_LIMIT_IP_SALT`, `CRON_SECRET`
- [ ] Update the GitHub Actions `SWEEP_URL` / `CRON_SECRET` to prod
- [ ] Create the prod admin with `scripts/create-admin`
- [ ] Import the pilot roster and hand out activation codes to students in person or through a private channel
- [ ] Re-check current free-tier limits for Firebase, storage and hosting (PRD Appendix B)
