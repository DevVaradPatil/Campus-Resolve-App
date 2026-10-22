# TODO — Manual tasks for the owner

Things only you can do: accounts, keys, credentials, approvals, real-world info.
Claude adds items here as they come up. Tick them off when done. No testing items.
Secrets go in `.env.local` (dev) or the host's env settings (prod). **Never commit them or paste them in chat.**

## Before Phase 0 (needed to start)

- [ ] **Decide hosting (D1 in plan.md):** read the Vercel Hobby terms (personal, non-commercial use) and decide whether a free, student-led hostel pilot qualifies. Tell Claude: Vercel or Cloudflare Workers.
- [ ] **Check image storage billing (D2):** in the Cloudflare dashboard, see whether enabling R2 asks for a card/PayPal. If it does and you won't add one, tell Claude to use the Supabase Storage fallback. Until this is decided, photo uploads only work against the local emulators (complaints themselves work everywhere).
- [ ] Create a GitHub repository (private is fine), then add it as `origin` and push `main` (Claude has made the local repo)
- [x] ~~Install Node + Firebase CLI~~. Node 24 and Java 21 are present, and the Firebase CLI is a project devDependency. Run `npx firebase login` once before any real deploy.
- [ ] Create a **Vercel** account (Hobby) and import the GitHub repo, so Claude can run the deployed runtime spike. Add the dev Firebase/R2 env vars from below in Vercel → Settings → Environment Variables (Preview).
- [ ] Once the dev Firebase project exists: run `npx firebase use --add` and pick it with alias `dev`. Local emulator work keeps using the offline `demo-campusresolve` project.

## Firebase — development project (Phase 0)

- [ ] Create Firebase project `campusresolve-dev` on the **Spark (free)** plan. Don't upgrade to Blaze.
- [ ] Enable **Authentication** (no providers needed; custom tokens work without one)
- [ ] Create a **Firestore** database (Native mode, region `asia-south1` Mumbai)
- [ ] Register a Web app → copy its config into `.env.local`:
  `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`
- [ ] Project settings → Service accounts → generate a private key → put its values in `.env.local`:
  `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`. Delete the downloaded JSON afterwards, or store it outside the repo.
- [ ] In Google Cloud IAM for the project, make sure the service account has **Service Account Token Creator** (needed for custom tokens)

## Image storage — development (Phase 0)

If R2 (D2):
- [ ] Create bucket `campusresolve-dev` (private, no public access)
- [ ] Create an R2 API token scoped to that bucket (Object Read & Write) → `.env.local`:
  `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
- [ ] Set a Cloudflare usage notification for R2

If Supabase fallback (D2):
- [ ] Create a free Supabase project, plus a private storage bucket `attachments`
- [ ] `.env.local`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`

## App secrets (Phase 2)

Not needed for local emulator work, which uses built-in dev values. Required for any real Firebase project.
Generate each with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` (32+ characters):
- [ ] `ACTIVATION_CODE_PEPPER`: HMAC key for hashing activation codes. Changing it later invalidates every unused code.
- [ ] `RATE_LIMIT_IP_SALT`: HMAC key for hashing IPs in rate-limit keys
- [ ] `CRON_SECRET`: shared secret for the sweep endpoint (also add it as a GitHub Actions secret in Phase 4)
- [ ] Decide who the **first admin** is. For a real project, run this yourself with the real project's env file (Claude never sees the password):
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

- [ ] GitHub repo → Settings → Secrets → Actions: add `CRON_SECRET` and `SWEEP_URL` (the deployed `/api/cron/sweep` URL)

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
