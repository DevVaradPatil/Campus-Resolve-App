# CampusResolve --- Product Requirements Document (PRD)

**Version:** 1.0\
**Date:** 21 October 2026\
**Status:** Consolidated product specification; subject to
launch-blocker resolution\
**Product:** CampusResolve\
**Initial deployment:** One IIT Kanpur hostel, student-led pilot\
**Pilot audience:** 10--25 students\
**Initial language:** English\
**Budget constraint:** Strictly zero-paid services; no paid upgrades
without explicit approval

------------------------------------------------------------------------

## 1. Executive Summary

CampusResolve is a mobile-first web application for managing hostel
complaints and grievances. It combines a public hostel issue tracker
with a private grievance-management workflow.

Students can submit complaints with photos, view published issues,
support existing reports, comment, report duplicates and track
resolution. Administrators manage accounts, routing, status transitions,
contact information and escalation. Authorized hostel committee members
can view public issues, moderate content and escalate overdue
complaints.

The application begins as an independent student initiative. It is **not
initially an official IIT Kanpur grievance channel** and must not imply
that hostel authorities have accepted service-level commitments or
agreed to use the system.

### 1.1 Product vision

Make it easy for hostel residents to report problems, identify issues
affecting multiple students, route complaints to the appropriate contact
and track whether reported problems are resolved.

**Core promise:** Every complaint gets a record, a visible status, a
responsible routing path and a documented outcome---without exposing
students' private information.

### 1.2 Product goals

1.  Make submitting and tracking hostel complaints straightforward.
2.  Reduce duplicate reports and reveal recurring issues.
3.  Improve accountability through assignment, deadlines, status history
    and resolution evidence.
4.  Protect reporter identities and confidential complaints.
5.  Provide useful operational statistics without exposing personal
    information.
6.  Operate a small pilot with no paid infrastructure commitments.

### 1.3 Primary success metric

The primary metric is the **complaint resolution rate**:

> Resolution rate = eligible complaints resolved in the reporting cohort
> ÷ all eligible complaints in that cohort × 100

The dashboard must define the measurement period and cohort clearly. It
should also display the count of resolved and eligible complaints, plus
the percentage resolved within the target deadline. A ticket merely
marked resolved must not be presented as independently verified proof
that the underlying problem was fixed.

------------------------------------------------------------------------

## 2. Scope and Release Boundaries

### 2.1 MVP: included features

  -----------------------------------------------------------------------
  Area                                MVP requirement
  ----------------------------------- -----------------------------------
  Accounts                            Verified student activation, login,
                                      password change/recovery and
                                      admin-managed roster

  Complaints                          Title, description, category,
                                      location, priority rules and photo
                                      attachments

  Public feed                         Search, filters, trending,
                                      unresolved and recently resolved
                                      issues

  Community                           Upvotes, duplicate linking and
                                      public comments

  Workflow                            Assignment, status history,
                                      deadlines, escalation and reopening

  Contacts                            Searchable directory,
                                      category/location routing and
                                      escalation contacts

  Resolution                          Resolution notes, optional evidence
                                      photo, confirmation window and
                                      feedback

  Dashboard                           Student summaries and
                                      admin/committee operational
                                      analytics

  Notifications                       In-app notifications and unread
                                      counts

  Security                            Server-side authorization, rate
                                      limits, audit logs, abuse reporting
                                      and safe uploads

  Operations                          Development/production separation,
                                      usage alerts, error monitoring,
                                      backup/export and recovery
                                      procedures

  Deployment                          HTTPS, free provider subdomain and
                                      mobile-browser support
  -----------------------------------------------------------------------

**Scope reconciliation:** Following complaints was not selected in the
final MVP checklist, even though notifications and a public issue feed
were selected. It is therefore optional if capacity permits, not a
launch blocker. Email notifications, PWA installation, maps, automatic
staff accounts and multi-hostel support are deferred.

### 2.2 Out of scope for the pilot

-   Official integration with IIT Kanpur's internal grievance systems.
-   Automatic WhatsApp or SMS notifications.
-   Institutional SSO unless access is approved.
-   Payments, rewards, public leaderboards of individual reporters and
    AI-based complaint classification.
-   Guaranteed service-level commitments from hostel staff.
-   Multiple colleges or hostel-wide production deployment before pilot
    validation.

------------------------------------------------------------------------

## 3. Personas and Permissions

The application has three primary user roles, with additional
fine-grained permissions for authorized committee leads.

  -----------------------------------------------------------------------
  Capability                Student          Committee              Admin
  -------------- ------------------ ------------------ ------------------
  Submit and                    Yes                Yes                Yes
  track own                                            
  complaints                                           

  View published                Yes                Yes                Yes
  complaints                                           

  Upvote,                       Yes                Yes                Yes
  comment and                                          
  report content                                       

  View reporter    Own account only      No by default          Yes, when
  identity                                                  operationally
                                                                necessary

  Manage                         No      No by default                Yes
  complaint                                            
  assignments                                          

  Escalate                       No                Yes                Yes
  overdue                                              
  complaints                                           

  Moderate              Report only                Yes                Yes
  public content                                       

  Manage roster                  No                 No                Yes
  and accounts                                         

  Manage                         No      No by default                Yes
  contacts and                                         
  routing rules                                        

  Manage                         No      No by default                Yes
  categories and                                       
  deadline                                             
  policies                                             

  Manage roles                   No                 No                Yes
  and system                                           
  settings                                             

  Export                         No      No by default    Yes, subject to
  complaint data                                              permissions
  -----------------------------------------------------------------------

A committee lead may receive additional permissions, but those
permissions must be granted explicitly. A committee role must never
automatically grant access to confidential reports.

### 3.1 Authorization principles

-   Every protected action is authorized on the server or by verified
    database/storage rules.
-   Client-side role checks are only a user-interface convenience.
-   Users cannot assign themselves roles, change their own roster
    eligibility or alter audit records.
-   Admin actions that affect privacy, roles or complaint visibility
    must be logged.
-   All roles use least privilege.

------------------------------------------------------------------------

## 4. User Journeys

### 4.1 Student activation and login

1.  Admin imports an authorized roster.
2.  The roster contains roll number, room assignment, eligibility and
    hostel location.
3.  The system generates a unique, one-time activation code for each
    eligible account.
4.  The student activates using roll number and activation code.
5.  The student sets a password; the code expires and cannot be reused.
6.  The student signs in with roll number and password.
7.  Room number is profile data, not an authenticator.

The application must never allow open registration to create an eligible
student account simply by knowing a roll number and room number.

### 4.2 Submit a complaint

1.  Student opens **New complaint**.
2.  Selects a category and provides a title, description and location.
3.  Attaches optional photos.
4.  The system validates fields, rate limits, file content and priority
    rules.
5.  The student reviews the complaint's visibility and submits it.
6.  The system creates a ticket ID, stores the submission and records
    the initial event.
7.  A routing rule selects the default contact or team based on category
    and location.
8.  The complaint appears in the appropriate public or confidential
    view.

### 4.3 Track and resolve

1.  The student sees the complaint in My complaints.
2.  An admin reviews and assigns it.
3.  The admin records progress updates based on information from the
    responsible contact.
4.  The system monitors the relevant deadline and escalates overdue
    cases.
5.  The admin records resolution notes and optional evidence.
6.  The student receives an in-app confirmation request.
7.  The ticket closes after the category-specific confirmation window if
    the student has not reported that the issue persists.
8.  Feedback is recorded, and the final state is reflected in analytics.

### 4.4 Handle duplicates

Students can report a suspected duplicate or support an existing issue.
The system preserves each original report, links related reports to a
primary complaint and aggregates support counts.

Linking must not expose the identity or private attachments of a
confidential reporter. Duplicate reports remain individually auditable.

------------------------------------------------------------------------

## 5. Complaint Categories, Location and Data Fields

### 5.1 Initial categories

  -----------------------------------------------------------------------
  Category                            Example subcategories
  ----------------------------------- -----------------------------------
  Mess                                Food quality, hygiene, menu, timing

  Canteen                             Food, pricing, cleanliness, service

  Infrastructure                      Room repairs, bathrooms, plumbing,
                                      electricity, furniture, Wi-Fi

  Garden & cleanliness                Waste, pests, lawn, common-area
                                      cleanliness

  Water & utilities                   Drinking water, hot water,
                                      drainage, power

  Other                               Issues that do not fit an existing
                                      category
  -----------------------------------------------------------------------

Categories and subcategories must be editable by admins. This taxonomy
is a proposed initial classification, not an official hostel
classification.

### 5.2 Location model

The initial structure is **block → floor → room or common area**.

Recommended fields:

-   `blockId`: required where applicable.
-   `floorId`: optional for outdoor or block-level issues.
-   `locationType`: `room`, `bathroom`, `corridor`, `common_area`,
    `garden`, `mess`, `canteen`, `utility_area`, `other`.
-   `roomReference`: optional, restricted to authorized users.
-   `locationDescription`: short optional free-text description.

Public cards display a safe location label, such as "Block B · Second
floor · Common bathroom." Private room references must never be included
in public queries, public response objects or published image metadata.

### 5.3 Complaint record

Every complaint must contain:

-   Unique ticket ID.
-   Title and description.
-   Category and optional subcategory.
-   Structured location.
-   Priority and the rule that determined it.
-   Reporter account ID, stored privately.
-   Public pseudonym or generic reporter label.
-   Current status.
-   Assigned contact/team and assignment history.
-   Creation, update, resolution and closure timestamps where
    applicable.
-   Public visibility and confidential handling flags.
-   Linked duplicate/primary ticket IDs, if any.
-   Resolution notes and optional evidence.
-   Student confirmation/feedback state.
-   Audit event references.

The application must distinguish a complaint's internal record from the
public representation shown in the feed.

------------------------------------------------------------------------

## 6. Complaint Lifecycle and Policy Rules

### 6.1 State transitions

Primary workflow:

`Submitted → Assigned → In progress → Resolved → Closed`

Additional transitions/events:

-   **Reopened:** unresolved issue is reported again after resolution or
    closure.
-   **Escalated:** overdue or critical complaint is raised to a
    designated admin/committee lead.
-   **Priority override:** authorized admin changes the
    system-calculated priority and records a reason.
-   **Rejected/hidden:** not a default lifecycle state; moderation or
    rejection should require an explicit reason and audit event.

A complaint can be reopened when the student reports that the issue
persists. Reopening resets the active resolution workflow and requires
an audit event. A reopened complaint must not silently retain a
previously completed resolution deadline as though the issue had been
fixed.

### 6.2 Priority and deadlines

Initial proposed policy:

  Priority     Initial target
  ---------- ----------------
  Critical             1 hour
  High                8 hours
  Normal             48 hours
  Low                  5 days

These are proposed pilot targets, not official service commitments.

**Recommended default interpretation:** the deadline measures the first
documented handling action, not guaranteed physical repair. Resolution
time is tracked separately.

-   Priority is assigned by configurable category rules.
-   Students may flag an urgent circumstance, but cannot directly force
    a priority change.
-   Administrators can override priority with a recorded reason.
-   Critical issues receive immediate in-app escalation to the
    designated admin/committee lead.
-   Unassigned complaints generate reminders and escalate to the
    designated backup.
-   The app must display real-world emergency contacts and state that a
    ticket is not a substitute for emergency assistance.

The pilot should review the targets after collecting initial data. A
one-hour critical response target is not meaningful unless a designated
person can actually monitor the queue.

### 6.3 Configurable closure windows

The selected policy is category-specific automatic closure. Recommended
initial defaults:

  Category                 Confirmation window
  ---------------------- ---------------------
  Mess                                48 hours
  Canteen                             48 hours
  Infrastructure                      72 hours
  Garden & cleanliness                48 hours
  Water & utilities                   24 hours
  Other                               72 hours

These are suggested defaults to be approved before launch, not finalized
operational policy.

Before closure, the app should notify the reporter in-app. If they
report that the issue persists, the complaint reopens. If they do not
respond, the ticket closes with reason `confirmation_window_expired`,
distinguishable from `student_confirmed`.

------------------------------------------------------------------------

## 7. Dashboards and Analytics

### 7.1 Student dashboard

-   Complaint summary: submitted, in progress, resolved, reopened and
    overdue.
-   Public feed: trending, unresolved, recently resolved and most
    supported.
-   Urgent issues.
-   Recent status and comment activity.
-   Quick complaint submission.
-   Contact directory.
-   In-app notification centre.
-   Hostel statistics and category trends.

### 7.2 Admin dashboard

-   Status overview and queue filters.
-   Assignment and overdue queue.
-   Category and location trends.
-   Average and median handling/resolution times.
-   Target-deadline compliance.
-   Staff/team workload based on assigned complaints and admin-recorded
    updates.
-   Duplicate and recurring issue trends.
-   Student feedback and resolution confirmation.
-   Weekly/monthly trend comparisons.
-   CSV export of authorized records.

Because staff do not have accounts, workload analytics must not claim to
measure independently verified staff performance. It measures
assignments and progress recorded in the system.

### 7.3 Committee dashboard

-   Public complaints and current states.
-   Overdue and escalated complaints.
-   Public content moderation queue.
-   Category trends and recurring issues.
-   Escalation actions and outcomes.

Committee members must not see private reporter data or confidential
cases unless explicitly authorized for a specific purpose.

### 7.4 Analytics definitions

-   **Resolution rate:** eligible complaints resolved within the chosen
    reporting cohort.
-   **On-time handling rate:** complaints receiving a qualifying first
    action within their target.
-   **Resolution time:** time from submission to recorded resolution;
    report median and average.
-   **Overdue count:** active complaints past their configured deadline.
-   **Recurring issue rate:** linked duplicate reports relative to all
    complaints in the reporting period.

Dashboard charts must show counts and date ranges, use consistent
filters and avoid exposing individual reporters in aggregate views.

------------------------------------------------------------------------

## 8. Technical Architecture

### 8.1 Recommended stack

-   **Next.js + TypeScript:** App Router, responsive UI, server-side
    route handlers, input validation and dashboard pages.
-   **Firebase Authentication + Firestore:** custom roll-number login,
    identity, complaint records, routing configuration, in-app
    notifications and audit events.
-   **Cloudflare R2:** image object storage, upload validation and
    controlled private/public image delivery.
-   **Monitoring and recovery:** usage checks, application errors, audit
    records, export procedures and tested restoration.

### 8.2 Deployment decision

The user selected Vercel and a free provider subdomain, but also
requires a strictly zero-paid budget.

Vercel Hobby is limited to personal, non-commercial use. Eligibility for
a live student-led service must be verified before choosing it.
Recommended deployment decision:

1.  Use Vercel Hobby for development and a private demo only if the use
    qualifies under its terms.
2.  For the live pilot, evaluate Cloudflare Workers with a compatible
    Next.js deployment adapter if Vercel is not eligible.
3.  Test the chosen runtime against Firebase Admin SDK token creation,
    R2 signed uploads, route handlers and all required server-side
    libraries before committing to it.

A free provider subdomain can avoid domain purchase costs. A custom
domain is not required for the pilot.

### 8.3 Firebase free-tier constraints

Firestore's documented free quota has included 1 GiB of stored data,
50,000 document reads per day, 20,000 writes per day, 20,000 deletes per
day and 10 GiB monthly outbound transfer. Current limits and terms must
be verified before launch. Exceeding a Spark-plan quota can make the
relevant service unavailable until the quota resets.

The application should therefore:

-   Paginate feeds and admin tables.
-   Limit real-time listeners to visible records.
-   Avoid one database read per card when summaries can be stored
    safely.
-   Set page-size limits and maximum upload sizes.
-   Avoid unbounded analytics queries.
-   Show clear errors when a service quota or dependency is unavailable.
-   Never silently discard a complaint when an operation fails.

### 8.4 Zero-paid budget policy

The project will not require a paid subscription or promise a paid
feature as part of the MVP.

Cloudflare R2 has advertised a free monthly allowance including 10
GB-month of standard storage, one million Class A operations and ten
million Class B operations, with no internet egress charge. Beyond the
allowance, storage and operation charges may apply. Verify current
pricing and account requirements before use.

Before using R2, confirm account setup, any required billing
configuration, current terms and actual usage. **Free usage is not a
guarantee that a service can never incur charges.** Do not enable paid
services or billing-dependent features without explicit approval.

If a provider requires payment details or a paid plan to meet the chosen
deployment requirements, treat that as a launch blocker and choose an
eligible alternative.

------------------------------------------------------------------------

## 9. Firebase Authentication and Roster Activation

### 9.1 Custom roll-number login

Firebase supports custom authentication tokens generated by a trusted
server using the Admin SDK. The server verifies credentials and issues a
token, which the client exchanges using Firebase Authentication.

Recommended flow:

1.  Admin imports the authorized roster.
2.  The system generates a unique, one-time activation code for each
    eligible account.
3.  The student activates using roll number and activation code.
4.  The student sets a password.
5.  The server stores only a salted password hash using a suitable
    password-hashing algorithm.
6.  At login, the backend verifies the password hash and account status.
7.  The server issues a Firebase custom token for the stable account
    UID.
8.  Firebase Security Rules use the authenticated UID and trusted role
    claims or protected role records to enforce access.

The roll number must be normalized consistently, and the account UID
must remain stable even if the student changes rooms.

### 9.2 Authentication security requirements

-   Activation codes are random, one-time, time-limited and stored
    securely.
-   Room number is never treated as a password, recovery secret or proof
    of identity.
-   Login attempts are rate-limited per account and per network source.
-   Responses avoid revealing whether a roll number exists.
-   Passwords are never stored in plaintext, logged or emailed.
-   Password reset is performed through a secure, admin-controlled
    process for the pilot.
-   Account deactivation immediately prevents new authenticated actions.
-   Custom-token signing keys and service-account credentials are stored
    only as server secrets.
-   Administrative credentials are separate from student credentials.
-   App Check is enabled where appropriate, but is not a replacement for
    authentication, authorization or abuse prevention.

**Launch blocker:** the custom login flow is a small authentication
system of its own. It needs security testing, a recovery process and
protection against brute-force attacks before real student accounts are
enabled.

------------------------------------------------------------------------

## 10. Proposed Firestore Data Model

The following is the recommended logical schema. Exact collection names
and indexes should be validated against final queries during
implementation.

  ----------------------------------------------------------------------------------
  Collection                                     Purpose and key fields
  ---------------------------------------------- -----------------------------------
  `users/{uid}`                                  `rollNumber`, `role`,
                                                 `displayName`, `blockId`,
                                                 `floorId`, `roomNumber`, `active`,
                                                 `createdAt`, `updatedAt`

  `roster/{rollNumber}`                          Authorized student eligibility,
                                                 current room assignment, activation
                                                 state and roster-import metadata

  `activationCodes/{codeId}`                     Hashed code, account reference,
                                                 expiry, consumed timestamp

  `complaints/{complaintId}`                     Ticket fields, category, location,
                                                 priority, status, private reporter
                                                 UID, public visibility, assignment,
                                                 timestamps, resolution and
                                                 duplicate linkage

  `complaints/{id}/events/{eventId}`             Status transitions, assignment
                                                 changes, priority overrides,
                                                 resolution actions and actor
                                                 references

  `complaints/{id}/comments/{commentId}`         Public comment text, author UID,
                                                 timestamps, moderation state

  `complaints/{id}/votes/{uid}`                  One support vote per account

  `complaints/{id}/attachments/{attachmentId}`   R2 object key, privacy
                                                 classification, content type, byte
                                                 size, publication state and upload
                                                 metadata

  `contacts/{contactId}`                         Responsible contact/team, category
                                                 and location mapping, public
                                                 contact details and active status

  `routingRules/{ruleId}`                        Category/location conditions,
                                                 destination contact, fallback and
                                                 enabled state

  `categories/{categoryId}`                      Category labels, subcategories,
                                                 priority rules and closure-window
                                                 defaults

  `locations/{locationId}`                       Blocks, floors, common areas and
                                                 location hierarchy

  `notifications/{notificationId}`               Recipient UID, type, related
                                                 ticket, creation time, read state

  `auditLogs/{eventId}`                          Actor, action, target record,
                                                 timestamp, outcome and minimal
                                                 metadata

  `rateLimits/{key}`                             Shared counters or time windows for
                                                 protected operations, subject to
                                                 abuse and cost controls

  `systemSettings/{settingId}`                   Approved deadlines, retention
                                                 settings and operational
                                                 configuration
  ----------------------------------------------------------------------------------

### 10.1 Data design requirements

-   Use server-generated ticket IDs.
-   Keep private fields separate from public feed response objects.
-   Use transactions or equivalent atomic operations for voting,
    duplicate links and state changes where required.
-   Maintain a denormalized public summary for feed performance, updated
    through trusted logic.
-   Use server timestamps for authoritative workflow events.
-   Use stable user IDs rather than roll numbers as relationship keys.
-   Keep comments and events as separate documents to avoid oversized
    complaint documents.
-   Do not store image bytes in Firestore.

### 10.2 Required index candidates

Firestore composite indexes will likely be needed for:

-   Public complaints ordered by `createdAt`.
-   Public complaints filtered by category and status, ordered by
    `createdAt`.
-   Public complaints filtered by location and status.
-   Admin queue filtered by status and priority, ordered by deadline.
-   Complaints assigned to a contact/team and filtered by status.
-   Complaints by reporter UID, ordered by creation time.
-   Overdue active complaints ordered by deadline.
-   Notifications by recipient UID and read state, ordered by creation
    time.
-   Audit events by target ID and timestamp.

Firestore will identify additional missing indexes during development.
Indexes must be created and deployed through version-controlled
configuration, not only manually in the console.

------------------------------------------------------------------------

## 11. R2 Image-Storage Architecture

### 11.1 Upload and delivery flow

1.  Student selects an image.
2.  Client checks basic size and file extension.
3.  Server authorizes upload by verifying Firebase identity, ticket
    access, rate limit and allowed file type.
4.  The server or a trusted processing service validates the file
    signature, dimensions and size; re-encodes supported formats and
    strips EXIF metadata.
5.  The object is stored privately in R2 under a generated key.
6.  Private images require authorization; approved public images use a
    separate controlled delivery path.

### 11.2 Image rules

-   Allow JPEG, PNG and WebP initially.
-   Maximum three photos per complaint, each no larger than 5 MB. These
    are recommended pilot limits.
-   Re-encode uploads into a safe raster format and strip EXIF metadata.
-   Reject SVG, HTML, executables and unsupported formats.
-   Generate object keys server-side; never use the original filename as
    a storage path.
-   Store metadata and access classifications in Firestore.
-   Keep R2 credentials exclusively on the server.
-   Do not expose private bucket URLs or permanent access credentials.
-   Use short-lived signed URLs or an authenticated image-delivery
    endpoint for private images.
-   Delete or revoke access to attachments when the parent complaint is
    deleted or anonymized, according to retention policy.

### 11.3 Public photo visibility

The chosen policy allows photos on public complaints. To preserve that
feature safely:

-   A student must see a clear notice that a public complaint's photo
    may be visible to all users.
-   Private and sensitive complaints must never publish attachments
    automatically.
-   Standard complaint images may be displayed publicly after validation
    and re-encoding, with a mechanism for reporting inappropriate
    content and for admins to hide it.
-   An admin must be able to unpublish an image without deleting the
    complaint.
-   The app must never assume that stripping metadata removes sensitive
    visual information. Faces, documents and room details may still
    appear in an image.

Automated image moderation or manual pre-approval can be added later. It
is not an unconditional requirement for every ordinary photo, but
confidential cases must remain private from the start.

------------------------------------------------------------------------

## 12. Security and Privacy Requirements

### 12.1 Authorization

-   All protected API routes verify Firebase ID tokens.
-   Privileged routes check server-side roles and permissions.
-   Firestore Security Rules deny access by default.
-   Client-side users cannot write roles, audit records, assignment
    history or authoritative status fields directly.
-   Admin SDK operations bypass Firestore Security Rules; therefore,
    every privileged server operation must validate inputs and
    authorization explicitly.
-   R2 uploads and image reads require appropriate authorization.

### 12.2 Rate limiting

Initial proposed limits, adjustable after pilot testing:

  -----------------------------------------------------------------------
  Action                              Initial limit
  ----------------------------------- -----------------------------------
  Login attempts                      5 per account per 15 minutes, with
                                      additional IP/network controls

  Complaint submissions               5 per account per hour

  Comments                            10 per account per 10 minutes

  Upvotes                             30 vote changes per account per 10
                                      minutes

  Image uploads                       10 files per account per hour

  Activation attempts                 5 attempts per account per 15
                                      minutes

  Password-reset attempts             3 attempts per account per hour
  -----------------------------------------------------------------------

These are starting values, not guarantees of abuse prevention. Limits
should use shared server-side enforcement, bounded counter lifetimes,
safe concurrency and monitoring. IP-based limits must account for shared
campus networks so legitimate students are not blocked unnecessarily.

### 12.3 Additional protections

-   Validate and normalize every server input.
-   Enforce maximum lengths on titles, descriptions and comments.
-   Escape or safely render user-generated content.
-   Use secure session handling and CSRF protections where cookie-based
    sessions are used.
-   Configure appropriate CORS and content security policies.
-   Prevent unauthorized role escalation.
-   Use Firebase App Check as a supplementary abuse signal.
-   Protect against replay of activation codes and duplicate
    submissions.
-   Log administrative actions without logging passwords, tokens or full
    confidential payloads.
-   Provide a process to report spam, harassment and privacy violations.
-   Restrict sensitive complaints to authorized admins and specifically
    authorized handlers.
-   Keep secrets out of Git, client bundles and error reports.

### 12.4 Public pseudonyms and sensitive cases

Public issue cards must not contain the reporter's roll number, real
name, room number, email address or private account identifier.

For the selected pseudonym model, a consistent display alias may be used
across public reports. If even the alias creates a risk of
identification, an admin should be able to hide it or use a generic
reporter label.

A complaint can be private even when submitted by an identified student.
Confidentiality must be enforced across search, comments, duplicate
links, exports, image URLs and notification previews---not merely
through the public interface.

------------------------------------------------------------------------

## 13. Notifications

### 13.1 MVP: in-app notifications only

Round 2 selected in-app and email notifications, but Round 5 selected no
email initially. The launch policy is therefore:

-   In-app notification centre with unread count.
-   Notifications on assignment, status changes, resolution requests,
    reopening, relevant comments and escalation outcomes.
-   Mark-as-read functionality.
-   Deduplication of repeated notifications.
-   A configurable preference to suppress non-essential notifications if
    needed.
-   No email, WhatsApp or SMS delivery in the initial pilot.

Email notifications can be added later without changing the complaint
model. Notification creation should be separated from notification
delivery.

------------------------------------------------------------------------

## 14. Audit History, Retention and Backups

### 14.1 Audit requirements

The audit log should record:

-   Complaint creation and edits to important fields.
-   Assignment and reassignment.
-   Status transitions and reopening.
-   Priority changes and reasons.
-   Resolution and closure.
-   Moderation, visibility changes and complaint reports.
-   Account activation, deactivation and room changes.
-   Role and routing-rule changes.
-   Exports and administrative actions.

Each event should include actor ID, action, target, timestamp, outcome
and minimal metadata. Audit records must be append-only from the
application perspective and inaccessible to ordinary users.

### 14.2 Retention policy

The selected retention period is one year. Recommended starting policy:

  -----------------------------------------------------------------------
  Data                                Proposed retention
  ----------------------------------- -----------------------------------
  Complaint records                   Up to 365 days after closure or
                                      last activity, subject to an
                                      approved retention policy

  Public images                       Delete with the parent complaint or
                                      when no longer needed

  Private evidence                    Delete with the complaint unless a
                                      documented exception applies

  Account records                     Retain while eligible; remove or
                                      deactivate promptly when no longer
                                      authorized

  Audit logs                          Up to 365 days, with access
                                      restricted

  Security-rate-limit records         Short-lived counters and minimal
                                      security telemetry

  Backups                             Expire within the approved backup
                                      retention window
  -----------------------------------------------------------------------

The precise retention trigger and any legal or institutional retention
requirements must be reviewed before real deployment. A complaint under
an active investigation or preservation requirement may need a
documented exception. Historical aggregate statistics should be
anonymized rather than retaining unnecessary personal data indefinitely.

### 14.3 Backup plan compatible with a zero-paid budget

Firestore's managed backup and restore features require billing. The MVP
therefore cannot promise those managed features on a strictly free Spark
plan.

Recommended fallback:

1.  Provide an admin-triggered export of authorized complaint records,
    routing configuration and relevant metadata.
2.  Generate a separate attachment manifest so image records can be
    reconciled with their R2 objects.
3.  Produce an encrypted export and store it outside the live
    application environment.
4.  Keep any decryption secret separate from the backup.
5.  Document a recovery procedure, including restoring the database,
    verifying image references and checking role permissions.
6.  Perform and record a restoration test before the pilot and
    periodically thereafter.
7.  Apply the same retention and deletion policies to backup copies.

A manual encrypted export is not equivalent to fully automated
point-in-time recovery. If automatic scheduled backups are required
before launch, establish a genuinely free, permitted automation and
storage path---or revise the zero-paid constraint.

------------------------------------------------------------------------

## 15. Testing and Acceptance Criteria

The MVP is not ready for real student accounts until the following
criteria pass.

### 15.1 Functional acceptance

  -----------------------------------------------------------------------
  ID                                  Acceptance criterion
  ----------------------------------- -----------------------------------
  FR-01                               Only roster-authorized students can
                                      activate accounts.

  FR-02                               Activation codes are one-time,
                                      expire and cannot be replayed.

  FR-03                               Students can submit valid
                                      complaints with category,
                                      description and location.

  FR-04                               Invalid or excessive image uploads
                                      are rejected.

  FR-05                               Every accepted complaint receives a
                                      unique ticket ID and initial audit
                                      event.

  FR-06                               Routing selects the configured
                                      category/location destination or a
                                      safe fallback queue.

  FR-07                               Only authorized users can assign,
                                      reassign, resolve or close
                                      complaints.

  FR-08                               Duplicate linking preserves the
                                      original complaint history and
                                      access restrictions.

  FR-09                               Upvoting cannot create more than
                                      one active vote per account per
                                      complaint.

  FR-10                               Public comments are validated,
                                      rate-limited and moderated when
                                      necessary.

  FR-11                               Resolution requests and automatic
                                      closure follow the configured
                                      category window.

  FR-12                               Reopening restores the complaint to
                                      an active state and creates an
                                      audit event.

  FR-13                               In-app notifications are generated
                                      for configured workflow events.

  FR-14                               Admin analytics use documented
                                      definitions and respect role
                                      permissions.

  FR-15                               CSV exports exclude confidential
                                      fields unless explicitly
                                      authorized.

  FR-16                               A backup export can be restored and
                                      its attachment references
                                      reconciled.
  -----------------------------------------------------------------------

### 15.2 Security acceptance

The test suite must demonstrate that:

-   A student cannot read another student's private complaint or
    confidential attachments by changing a URL, document ID or API
    request.
-   A student cannot change their role, ticket owner, priority,
    assignment or final status through client-side manipulation.
-   A committee member cannot access admin-only or confidential data
    without explicit permission.
-   Expired or consumed activation codes fail.
-   Repeated login and upload attempts trigger rate limits.
-   Unsupported or malformed uploads are rejected.
-   Private images are not accessible through public or permanent URLs.
-   Admin actions produce audit events.
-   Application errors do not leak secrets or confidential data.
-   Account deactivation prevents subsequent protected actions.

### 15.3 Testing strategy

-   **Unit tests:** validation, priority rules, routing, deadline
    calculations and retention logic.
-   **Integration tests:** authentication, Firestore transactions, R2
    uploads, notifications, role checks and export generation.
-   **End-to-end tests:** student activation, complaint submission,
    admin assignment, resolution, automatic closure and reopening.
-   **Security tests:** cross-account access, privilege escalation, rate
    limiting and attachment authorization.
-   **Recovery test:** restore an exported dataset in a separate test
    environment and verify record counts and image references.

Load testing should be proportionate to the pilot size, but the team
should at least test concurrent submissions and expected peak usage.

### 15.4 Operational acceptance

Before launch:

-   Development and production credentials are separate.
-   HTTPS is enabled.
-   Usage and quota checks are documented.
-   Application errors can be investigated without exposing sensitive
    data.
-   Privacy notice and acceptable-use rules are available.
-   Admin onboarding and account-revocation procedures are documented.
-   The backup and restoration process has been tested.
-   Mobile usability and accessibility checks pass.
-   The deployment provider's eligibility and terms are verified.
-   All unresolved launch blockers below are addressed.

------------------------------------------------------------------------

## 16. MVP Implementation Milestones

### Phase 1 --- Foundation

Set up Next.js, TypeScript, Firebase, Firestore schema, development
environment, roster import and the authentication prototype.

**Exit criteria:** verified activation, secure login and role checks
work end to end.

### Phase 2 --- Complaint core

Build complaint submission, category/location routing, R2 upload
validation, public feed, filters and private attachment access.

**Exit criteria:** students can submit, view and track complaints
without cross-account data leakage.

### Phase 3 --- Workflow and dashboards

Implement assignments, statuses, deadlines, escalations, comments,
upvotes, duplicate links, notifications, feedback and analytics.

**Exit criteria:** complete lifecycle and permissions tests pass.

### Phase 4 --- Hardening and recovery

Add audit logs, abuse reporting, rate limiting, privacy controls,
monitoring, export and restore procedures.

**Exit criteria:** security, recovery and operational acceptance tests
pass.

### Phase 5 --- Pilot

Test with 10--25 authorized students, collect feedback, review routing
and deadlines, and fix critical defects before expanding.

**Exit criteria:** no unresolved critical security issues, verified
recovery and documented pilot review.

These are milestone-based phases rather than fixed calendar commitments.
The first demo date remains unspecified.

------------------------------------------------------------------------

## 17. Risks and Mitigations

  -----------------------------------------------------------------------
  Risk                                Mitigation
  ----------------------------------- -----------------------------------
  Hostel authorities do not adopt the Label it as a student-led pilot;
  system                              publish only verified contact
                                      information and avoid implying
                                      official endorsement.

  Students submit false or abusive    Verified accounts, rate limits,
  reports                             reporting, moderation and an audit
                                      trail.

  Private information leaks through   Separate public and private
  the public feed                     response models; enforce
                                      server-side permissions on every
                                      query and image request.

  No staff accounts means progress is Label updates as admin-recorded and
  not independently verified          preserve resolution evidence.

  Free quotas are exhausted           Limit reads and uploads, monitor
                                      usage, and provide clear failure
                                      messages rather than losing
                                      submissions.

  R2 costs or billing requirements    Verify account requirements, stay
  conflict with the budget            within free allowances and do not
                                      enable paid billing without
                                      approval.

  Authentication implementation       Security review, password hashing,
  introduces vulnerabilities          one-time activation, rate limits
                                      and recovery testing.

  Backups cannot be restored          Require encrypted exports, a
                                      documented recovery procedure and a
                                      successful restoration test.

  Committee or admin access is abused Least-privilege permissions, audit
                                      logs and controlled role
                                      provisioning.

  Automatic closure hides unresolved  Notify the reporter, record the
  issues                              closure reason and allow reopening
                                      under the defined policy.
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 18. Launch Blockers and Unresolved Assumptions

These decisions must be settled before the pilot accepts real
complaints.

### Blocker 1 --- Authentication and recovery

The custom roll-number login needs a secure activation and
password-recovery implementation. Do not launch real accounts until the
custom token flow, credential storage and brute-force protections have
passed security tests.

### Blocker 2 --- Eligible free hosting

Confirm that the live deployment is permitted under the chosen
provider's free plan. Vercel Hobby eligibility is not assumed. If it
does not qualify, validate an alternative before production deployment.

### Blocker 3 --- Verified recovery

A manual encrypted export is the proposed zero-paid fallback, not a
substitute for managed backups. Complete a real restoration test before
the pilot. If automated backups are mandatory, resolve the hosting and
budget constraints first.

### Blocker 4 --- Operational contacts

The app needs an initial admin, a backup escalation contact, a verified
contact directory and a clear process for handling urgent issues. These
contacts must be approved before they are published.

### Blocker 5 --- Pilot policies

Approve the priority targets, category-specific closure windows,
one-year retention policy, public-image rules and privacy notice. These
are proposed defaults, not established hostel policy.

### 18.1 Remaining assumptions

-   **App identity:** CampusResolve is the working name, not a confirmed
    available trademark or domain.
-   **Language:** English only for the initial release.
-   **Location structure:** block → floor → room or common area,
    configurable as necessary.
-   **Roster source:** an authorized administrator will provide the
    initial student roster.
-   **Staff participation:** staff do not have accounts; admins record
    assignments and updates.
-   **Email:** deferred until a suitable free sender is configured.
-   **Data retention:** one year is the proposed default, subject to
    applicable institutional or legal requirements.
-   **Pilot:** 10--25 students, with no confirmed demo deadline.
-   **Official adoption:** not assumed or implied.

------------------------------------------------------------------------

## 19. Definition of Done

CampusResolve is ready for the initial pilot only when:

-   Students can securely activate accounts and sign in.
-   A student can submit, view and track a complaint.
-   Admins can assign, escalate, resolve and close complaints.
-   The public feed does not expose private account data or confidential
    attachments.
-   Comments, votes, duplicates and image uploads are validated and
    protected against abuse.
-   Notifications and audit events are recorded correctly.
-   The dashboard displays accurate complaint and resolution statistics.
-   The application has tested security controls and a working recovery
    procedure.
-   The deployment fits the zero-paid budget and provider terms.
-   A small pilot has passed its acceptance tests and has a documented
    process for reporting defects and security incidents.

------------------------------------------------------------------------

## 20. Final Recommendation

Build the MVP in this order:

**Authentication and permissions → complaint submission and
private/public data separation → admin workflow and escalation →
dashboards and notifications → security hardening and recovery →
pilot.**

Do not begin by polishing analytics or adding AI features. The product's
value depends on three things working correctly:

1.  Students can trust the privacy model.
2.  Complaints reach a responsible contact.
3.  The system accurately records what happens afterward.

This PRD consolidates the decisions made across all six discovery
rounds. Remaining technical constraints are explicitly marked so the
document can guide implementation rather than merely describe the idea.

------------------------------------------------------------------------

## Appendix A --- Decisions from the discovery rounds

  -----------------------------------------------------------------------
  Round                               Final decision
  ----------------------------------- -----------------------------------
  1 --- Foundations                   One hostel at IIT Kanpur;
                                      student-led initiative;
                                      Student/Admin/Committee roles;
                                      public issue tracker with reporter
                                      privacy; hybrid category/location
                                      routing; Submitted, Assigned, In
                                      progress, Resolved, Reopened;
                                      category-specific closure windows;
                                      verified account activation;
                                      categories include mess, canteen,
                                      infrastructure, cleanliness, other
                                      and water; preferred stack
                                      Next.js + TypeScript + Firebase
                                      with image storage to be evaluated.

  2 --- Complaints                    Admin-managed routing without staff
                                      accounts; title, description,
                                      category, location and photos;
                                      system-determined priority; public
                                      pseudonyms; public feed with
                                      photos; upvotes, duplicate linking
                                      and reopening; public comments;
                                      category-specific closure windows;
                                      in-app notifications at launch,
                                      email deferred; contact directory
                                      plus complaint-specific contacts.

  3 --- Operations                    Minimal lifecycle with escalation;
                                      category/location routing;
                                      reminders and escalation for
                                      unassigned complaints; provisional
                                      priority targets; admin and
                                      authorized committee-lead
                                      permissions; linked duplicates;
                                      resolution evidence; confidential
                                      handling and moderation;
                                      operational audit; rate limiting,
                                      verified accounts, one vote per
                                      user, safe uploads, App Check and
                                      temporary throttling; controlled
                                      admin provisioning; verified roster
                                      updates; retention and recovery
                                      procedures.

  4 --- Experience                    Student dashboard with summary,
                                      feed, urgent issues, activity,
                                      contacts, quick create,
                                      notifications and stats;
                                      discover-style feed; guided
                                      complaint form; friendly
                                      campus-community design; broad
                                      admin analytics; committee
                                      permissions limited to view,
                                      moderate and escalate; CSV exports;
                                      all selected core features included
                                      in MVP; small student pilot;
                                      resolution rate as primary metric.

  5 --- Technology                    Custom roll-number login using a
                                      trusted backend and Firebase custom
                                      tokens; CSV roster import with
                                      manual management; Firestore;
                                      Cloudflare R2; secure image
                                      validation and re-encoding; Vercel
                                      preferred subject to eligibility;
                                      strict zero-paid budget; email
                                      deferred; unit, integration,
                                      end-to-end, security and recovery
                                      testing; operational monitoring,
                                      privacy, incident procedures, free
                                      subdomain and accessibility checks.

  6 --- Final scope                   Working name CampusResolve;
                                      English-only interface;
                                      block/floor/room-or-common-area
                                      hierarchy; one-year retention
                                      proposal; pilot with 10--25
                                      students; free provider subdomain;
                                      no confirmed demo deadline.
  -----------------------------------------------------------------------

## Appendix B --- Items requiring verification before deployment

-   Current Firebase and Firestore free-plan quotas and limitations.
-   Current Cloudflare R2 free-tier allowances, account requirements and
    pricing.
-   Vercel Hobby eligibility or a verified alternative for live hosting.
-   Compatibility of the selected deployment runtime with Firebase Admin
    SDK and R2 upload flows.
-   Authentication and recovery design review.
-   Privacy notice and approved contact directory.
-   Actual restoration of a backup export.
-   Category-specific priority and closure policies approved for the
    pilot.
