# Running the pilot

Day-to-day operation of CampusResolve. Setup tasks live in [TODO.md](../TODO.md); backups in
[RECOVERY.md](RECOVERY.md).

## Who watches what

| Role | Watches | How often |
| --- | --- | --- |
| Primary admin | Admin → Complaint queue ("Needs action"), notifications | Several times a day; critical complaints aim for a first response within 1 hour |
| Backup admin | Same, when the primary is away | Agreed hand-over |
| Committee | Committee page (overdue/escalated), Moderation | Daily |

A 1-hour critical target only means something if someone is actually watching. Every active
admin is notified about new critical complaints, reopens and escalations.

## Scheduled work

GitHub Actions runs **Sweep** every 30 minutes (repo → Actions → Sweep). It escalates complaints
with nothing recorded by their deadline, closes resolved ones whose confirmation window has
passed, reminds reporters before auto-close, prunes expired rate-limit counters, deletes old data
when retention is on, and keeps the free Supabase project awake. Admin and committee page visits
also run it if it hasn't run for 10 minutes.

If a run fails, open it in Actions to see the error. Re-running is always safe. Common causes: a
missing Firestore index after a deploy (deploy them, below), or `CRON_SECRET` differing between
GitHub and Vercel.

## Checking free-tier usage (weekly)

| Service | Where | Watch for |
| --- | --- | --- |
| Firestore | Firebase console → Usage and billing | Reads near 50,000/day or writes near 20,000/day |
| Supabase Storage | Supabase dashboard → Usage | Storage near 1 GB, egress near 5 GB/month; project paused |
| Vercel | Vercel dashboard → Usage | Function invocations and bandwidth on Hobby |
| GitHub Actions | Repo → Actions | Failed Sweep runs |

If Firestore hits a daily limit, the app shows "can't reach the server" until the quota resets
(midnight Pacific time). Drafts are kept on the device, so nothing typed is lost.

## Admins

- **Add an admin:** `npx tsx --env-file=.env.production.local --conditions=react-server scripts/create-admin.ts <handle> "<Name>"`. They choose the password at the prompt.
- **Remove an admin:** Admin → Roster isn't for admins; in the Firebase console set
  `users/<uid>.active` to `false`. Their next request is refused.
- **Committee members:** Admin → Roster → the student's menu → make committee.

## Students

- **New students:** import the updated roster CSV (Admin → Roster), then issue codes.
- **Forgotten password:** issue a new code for that student. That *is* the reset: the old
  password stops working and their sessions end.
- **Leaving the hostel:** re-import the roster with "remove students missing from the file", or
  deactivate them on the roster. Deactivation takes effect on their next request.

## Deploying changes

- App code: push to `main`; Vercel builds and deploys.
- Rules or indexes changed (`firestore.rules`, `firestore.indexes.json`):
  `npx firebase deploy --only firestore --project dev` (or the production alias). New indexes
  take a few minutes to build.

## Retention (PRD §14.2)

Off until the pilot team approves the one-year policy. To turn it on, set
`RETENTION_ENABLED=true` in Vercel and redeploy. From then on the sweep deletes complaints a year
after they close, with their photos, comments, votes, history, notifications and reports, and
audit logs older than a year. To keep one complaint (a preservation exception), set
`retentionHold: true` on it in the Firebase console and note why.

## Incidents

1. **Something's exposed** (a confidential complaint visible, a photo with personal details):
   hide it immediately (complaint page → Hide, or Moderation → Hide), then find out how. Check
   the audit log in the Firebase console (`auditLogs`, newest first).
2. **Account misuse:** deactivate the account (Roster), which signs them out everywhere.
3. **Leaked key** (service account, Supabase secret, `CRON_SECRET`, pepper/salt): rotate it in
   its console, update Vercel env vars, redeploy. Rotating `ACTIVATION_CODE_PEPPER` invalidates
   unused activation codes; reissue them.
4. **Data loss:** restore from the latest backup ([RECOVERY.md](RECOVERY.md)).
5. Write down what happened, when, what you did and what changes, and tell affected residents.

## Reporting a bug

Note the page, what you did, what you expected and what happened, plus the time. Admins can find
matching errors in Vercel → Logs.
