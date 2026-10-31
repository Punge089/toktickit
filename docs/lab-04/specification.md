# Lab 4 Sprint Engineering Specification

**Author:** Bannasorn Thongkorn - 67070503420 - GitHub: @Punge089
**Course:** CPE 334, Semester 1/2026

Business rules (BR), functional requirements (FR) and acceptance criteria (AC) restart at 01 in this
document; a reference such as "Lab 3 BR-36" always means `docs/lab-03/specification.md`.

## 1. Sprint Goal

By the end of Sprint 4, IT Staff and Administrators can plan and record the real work done on a Ticket as
Actions Taken (several per Ticket, each with its own assignee and status), a Ticket can only be Resolved
when that work is finished, and Requesters, IT Staff and Administrators each get a concise dashboard that
links into the detailed screens. Concurrent edits are detected instead of silently overwritten, repeated
clicks or retries cannot create duplicate Actions, and every Lab 1 to Lab 3 behavior is re-verified under
one coherent Zen Green application.

## 2. Stakeholder Request Interpretation

The service desk can already receive Tickets and talk to Requesters, but nobody can see what was actually
done to fix a Ticket or who is doing it. Each Ticket therefore gets a small work log. The primary Ticket
Owner still coordinates the Ticket, while other IT Staff can be assigned individual Actions (labsheet §4.4,
BR-02). A Requester can read the log but never change it. The Requester's "problem appears resolved" button
stays a hint; IT Staff must finish the work and then resolve the Ticket formally, and the backend refuses a
resolution that does not match the recorded work even if someone calls the API directly. Dashboards are
starting points, not reports: a few counts, a few short lists, and links to the screens that already exist.
Finally the whole app is polished and re-tested so Lab 4 does not break Labs 1 to 3.

## 3. Scope

### Included
- Actions Taken under a Ticket: create, list, edit while open, assign, start, complete and cancel.
- Read-only Actions Taken for the owning Requester.
- Backend resolution gate, the final Ticket status transition matrix, and stale-update (409) detection for
  Ticket workflow changes and Action edits.
- Duplicate-create protection for Actions Taken (idempotency key) and a single-flight guard on every create
  form.
- Requester Dashboard, IT Staff Dashboard, and Administrator view of the IT Staff Dashboard, each with
  drill-down links and loading, empty, forbidden and safe-failure states.
- Role-aware navigation with a Dashboard entry and active-page indication; Dashboard becomes every role's
  landing page after login.
- Additive Prisma migration, idempotent seed, REST API increments, tests for every item above, and a final
  regression, accessibility and visual pass over all earlier screens.

### Excluded (labsheet §4.2)
- Automatic SLA clocks, escalation engines, on-call scheduling and breach notifications.
- Email, SMS, LINE, push or any other external notification service.
- Inventory, spare parts, purchasing, cost accounting, time-sheet billing, payroll and labor-cost calculation.
- Multi-level approval workflows and electronic signatures.
- Advanced BI, custom report builders, export warehouses, and day-over-day trend figures (the dashboard
  mockups show "from yesterday" deltas; those would need stored daily snapshots and are not built).
- Multi-tenant organizations and production-scale cloud operations.
- File upload for Actions Taken: "Attachment Notes" is a text field that says which file to look for; the
  existing Ticket Attachments remain the only file storage.
- Deleting an Action Taken, and any new product feature not listed in this contract.

## 4. Functional Requirements

**Actions Taken**
- **FR-01** The system lets IT Staff and Administrators create an Action Taken under a Ticket with Action
  Date/Time, Action Description, Result, Follow-Up Required, Follow-up Note, Attachment Notes, an assignee
  and an initial status; Performed by is set from the session.
- **FR-02** The system lets IT Staff and Administrators edit an Action's fields and reassign it while the
  Action is Planned or In Progress.
- **FR-03** The system lets IT Staff and Administrators move an Action Planned to In Progress, Completed or
  Cancelled, and In Progress to Completed or Cancelled.
- **FR-04** The system lists all Actions of a Ticket in a stable order on the IT Staff Ticket Detail screen
  and, read-only, on the owning Requester's Ticket Detail screen.
- **FR-05** The system rejects an Action whose assignee is not an active IT Staff user.

**Ticket workflow**
- **FR-06** The system enforces the final Ticket status transition matrix (§5, Status Transition Matrix) on
  the backend and offers only permitted transitions in the user interface.
- **FR-07** The system refuses to move a Ticket to Resolved while any of its Actions is Planned or In
  Progress, or when none of its Actions is Completed, on the backend, regardless of the client.
- **FR-08** The system cancels a Ticket's open Actions when the Ticket itself is cancelled.
- **FR-09** The system detects stale updates: Ticket owner, IT Priority and status changes, and Action
  edits, carry the version the user last saw and are rejected with a conflict when it is out of date.
- **FR-10** The system makes a repeated or retried Action creation harmless: the same request key creates
  one Action only.
- **FR-11** The system refreshes the Ticket summary status after every successful status change.

**Dashboards**
- **FR-12** The system provides a Requester Dashboard that summarises only the signed-in Requester's Tickets.
- **FR-13** The system provides an IT Staff Dashboard with status counts, unassigned and personal workload,
  active Tickets by IT Priority, urgent and recent Tickets, and the user's own open Actions.
- **FR-14** The system lets an Administrator open the IT Staff Dashboard without personal workload cards,
  with concise user-account counts.
- **FR-15** Every dashboard card and list item opens the matching filtered list or Ticket Detail; My Tickets
  and the Ticket Queue read their filters from the URL so a drill-down lands on the filtered view.
- **FR-16** The system computes every dashboard figure on the backend from current database rows.

**Shell, hardening and regression**
- **FR-17** The system shows each role a Dashboard navigation entry, marks the active page, and lands every
  role on Dashboard after login.
- **FR-18** The system presents loading, validation, success, empty, forbidden, conflict, not-found and safe
  API-failure feedback consistently on every Lab 4 screen and every earlier screen.
- **FR-19** The system keeps entered form data after a recoverable failure and allows only one in-flight
  submission per create form.
- **FR-20** The system keeps every Lab 1 to Lab 3 function available to the roles that had it.
- **FR-21** The system ships without console errors, broken links, placeholder text, unfinished controls or
  obsolete UI, and the README describes setup, seed, migration, test and demonstration steps that were run.
- **FR-22** The system stays responsive, keyboard operable and accessible at desktop, tablet and mobile
  widths (same rules as Lab 2 and Lab 3).

## 5. Business Rules

**Actions Taken: ownership and permissions**
- **BR-01** An Action Taken belongs to exactly one Ticket and cannot be moved to another (labsheet §4.4).
- **BR-02** The Ticket Owner coordinates the Ticket, but an Action may be assigned to, and recorded by, a
  different IT Staff member (labsheet §4.4). Having no owner does not stop Actions being recorded.
- **BR-03** "Performed by" is the authenticated creator, set by the backend and never accepted from the
  client or changed afterwards. It is separate from the assignee, who is the person responsible for doing
  the Action.
- **BR-04** An assignee, when set or changed, must be an active IT Staff user. A Requester, an Administrator
  or an inactive user is rejected (`409 INVALID_ASSIGNEE`), following Lab 3 BR-17. Re-sending an unchanged
  assignee who has since been deactivated is not a change and is accepted; the screen marks them "(inactive)".
- **BR-05** Only IT Staff and Administrators may create or change Actions. A Requester may read Actions of
  their own Tickets only (BR-10). Every write is enforced on the backend.
- **BR-06** An Administrator may create and change Actions Taken (labsheet §4.3: "Perform IT Staff
  behavior"), but remains read-only for owner, IT Priority, status, Public Comments and Internal Notes
  (Lab 3 BR-36 is unchanged).

**Actions Taken: fields and rules**
- **BR-07** Field limits. `actionAt` is a date/time that defaults to now and may not be more than 5 minutes
  in the future; `description` is trimmed, 1 to 2000 characters; `result` is at most 2000 characters;
  `followUpNote` at most 2000; `attachmentNotes` at most 1000. All free text is rendered as plain text
  (Lab 3 BR-26). `createdAt` and `updatedAt` are set by the backend.
- **BR-08** When Follow-Up Required is true, Follow-up Note must be non-empty after trimming
  (`400`, `fieldErrors.followUpNote`). When it is false, any note sent is discarded and stored as null.
- **BR-09** Action status is one of Planned, In Progress, Completed, Cancelled. An Action may be created as
  Planned, In Progress or Completed (so work already finished can be logged in one step). The only
  transitions are Planned to In Progress, Completed or Cancelled, and In Progress to Completed or
  Cancelled; anything else is `409 INVALID_ACTION_TRANSITION`. Completed requires a non-empty Result;
  Cancelled requires a non-empty Result, which holds the reason.
- **BR-10** A Requester sees every Action of their own Ticket, with every field including assignee and
  status, read-only (labsheet §8.3). A Ticket owned by someone else answers `404`, identical to a missing
  Ticket (Lab 3 BR-15). Internal Notes never appear in any Action response; the staff screen tells IT Staff
  that Action fields are visible to the Requester.
- **BR-11** A Completed or Cancelled Action is final: it accepts no further edit (`409 ACTION_LOCKED`).
  There is no deletion of an Action.
- **BR-12** Actions can be created and changed only while the Ticket is New, Open, In Progress, Waiting for
  Requester or Reopened. On a Resolved, Closed or Cancelled Ticket the request is `409 ACTIONS_LOCKED`; a
  Resolved Ticket must be Reopened first.
- **BR-13** Actions are listed by `actionAt` ascending, then `id` ascending, so the order never changes
  between requests.
- **BR-14** Creating or changing an Action updates the Ticket's `updatedAt` (so "recently updated" reflects
  the work) but never changes the Ticket's status, owner, priority or `version`.
- **BR-15** Public Comments and Internal Notes stay append-only (Lab 3 BR-24). Actions Taken are the one
  editable record, and only while open (BR-11).

**Concurrency and duplicates**
- **BR-16** Every Action update must include `expectedVersion`. If it differs from the stored `version` the
  request is `409 STALE_VERSION` and nothing changes; a successful update increments `version` by one in a
  single conditional statement, so two simultaneous updates cannot both succeed.
- **BR-17** Every Ticket owner, IT Priority and status change must include `expectedVersion` of the Ticket
  (missing or non-integer is `400`; out of date is `409 STALE_VERSION`). A successful change increments the
  Ticket `version` by one and returns the new value.
- **BR-18** Creating an Action requires a `clientRequestId` (the UI generates one when the form opens). A
  second request with the same key for the same Ticket and the same user creates nothing and returns the
  first Action with `200`; the same key from a different user is `409 DUPLICATE_REQUEST_KEY`.

**Ticket workflow and resolution**
- **BR-19** The permitted status transitions are the Status Transition Matrix below. It keeps every Lab 3
  pair (Lab 3 BR-19 to BR-23 are unchanged) and adds the resolution gate and the cancel cascade; the matrix
  is final for the product.
- **BR-20** Resolution gate. A Ticket may be moved to Resolved only if (a) it has an owner and a Resolution
  Summary (Lab 3 BR-20, BR-21), (b) none of its Actions is Planned or In Progress, and (c) at least one of
  its Actions is Completed. Otherwise `409 RESOLUTION_BLOCKED` with the failing reasons
  (`OPEN_ACTIONS`, `NO_COMPLETED_ACTION`) and the status is unchanged. Follow-Up Required does not block
  resolution; it shows as a badge on the Action.
- **BR-21** The gate is checked inside the same database transaction as the status change, under a row lock
  on the Ticket, and Action writes take the same lock, so an Action added at the same moment cannot slip
  past a resolution that is already being applied.
- **BR-22** Moving a Ticket to Cancelled also cancels all its Planned and In Progress Actions in the same
  transaction, writing "Cancelled automatically because the Ticket was cancelled." as the Result when the
  Result is empty. Completed Actions are untouched.
- **BR-23** Tickets that were Resolved or Closed before Lab 4 and have no Actions stay valid and are counted
  by their status. They are not re-checked unless they are Reopened and resolved again, in which case the
  gate applies.
- **BR-24** The Requester's "problem appears resolved" indication remains advisory (Lab 3 BR-05): it never
  changes the status, satisfies the gate or bypasses it.
- **BR-25** Checks run in this order and the first failure answers: authentication (`401`), role (`403`),
  input validation (`400`), existence and ownership (`404`), stale version (`409 STALE_VERSION`), terminal
  Ticket, then transition, owner, resolution gate (`409`).
- **BR-26** A successful status change returns the refreshed Ticket (new status, `version`, allowed
  transitions) and the screen replaces its summary status from that response.

**Dashboards**
- **BR-27** Dashboard figures are computed by the backend at request time from the database, with no cache,
  and the client displays them without recalculating.
- **BR-28** Active statuses are New, Open, In Progress, Waiting for Requester and Reopened. Resolved, Closed
  and Cancelled are not active.
- **BR-29** Requester Dashboard metrics, all limited to Tickets whose `requesterId` is the signed-in user:
  Open Tickets (active statuses), Waiting for You (Waiting for Requester), Resolved (Resolved), Closed
  (Closed). Lists, at most 5 each: Needs Your Attention (Waiting for Requester, oldest `updatedAt` first)
  and Recently Updated (any status, newest `updatedAt` first).
- **BR-30** IT Staff Dashboard metrics over all Tickets: New, Open, In Progress and Waiting for Requester
  counts by status; Unassigned (no owner and active); My Assigned (owner is the user and active; staff
  only); Active by IT Priority (Urgent, High, Medium, Low; active only); My Open Actions (Actions assigned
  to the user that are Planned or In Progress; staff only). Lists, at most 5 each: Urgent and High
  (active, IT Priority Urgent or High, Urgent first then oldest `updatedAt`), Recently Updated (any
  status, newest `updatedAt` first), and My Open Actions (staff only, by `actionAt` then `id`).
- **BR-31** An Administrator gets the same response without the staff-only figures (they are `null`) and
  with account counts: active Requesters, active IT Staff, active Administrators, and inactive users.
- **BR-32** Every card has a defined drill-down (ui-spec.md §3). For every card that opens
  a Ticket list, the card's count equals the total of the list it opens (tested). The drill-down map is in
  api-spec.md §7 and §8. A zero is shown as `0`,
  never hidden, and an empty list shows its own message.
- **BR-33** Dashboard endpoints return counts and short lists only (Ticket number, summary, status, IT
  Priority, owner name, `updatedAt`), never whole Ticket collections, and never Internal Note text.
- **BR-34** No dashboard metric depends on a calendar boundary: "recent" means "newest by `updatedAt`", not
  "within N days". Timestamps are returned as UTC ISO strings and displayed with the existing
  `client/src/lib/format.ts` helper in the viewer's local time zone, as in Labs 2 and 3, so no time zone
  or date boundary enters any calculation.

**Navigation, safety and regression**
- **BR-35** Navigation: Requester sees Dashboard, My Tickets and Create Ticket; IT Staff sees Dashboard and
  My Queue; Administrator sees Dashboard and Users. Staff and Administrator have no Create Ticket entry or
  shortcut anywhere (Lab 3 authorization matrix). Every role lands on `/dashboard` after login, and the
  current page is marked.
- **BR-36** Drill-down filters: `GET /api/tickets` accepts every Ticket status (Lab 2 accepted only New) and
  `active=true`; `GET /api/staff/tickets` accepts `active=true`. Invalid values are `400 INVALID_QUERY`.
- **BR-37** Every protected endpoint keeps the status-code split of Lab 3 BR-37 (`401`, `403`, `400`, `404`,
  `409`, `500`) and never reveals another user's resource.
- **BR-38** Every create form allows one in-flight submission. Server-side retry protection exists for
  Actions Taken (BR-18); Ticket, Public Comment and Internal Note creation rely on the single-flight guard
  (Assumption 8).
- **BR-39** Every Lab 1 to Lab 3 test keeps running. A test that asserts behavior this sprint deliberately
  changes (landing page, My Tickets status filter, `expectedVersion` on workflow requests) is updated in the
  PR that changes the behavior and listed in `tests.md` §6, never deleted.
- **BR-40** Ticket and Action status badges, and the private versus shared markers, carry text as well as
  color (Lab 3 UI rules), and no screen scrolls horizontally at 375 px.

### Authorization Matrix (Lab 4 additions)

Legend as in Lab 3: ✅ full, ✅ own = caller's own Ticket, 👁 read-only, 401 unauthenticated, 403 forbidden.
Every Lab 3 row is unchanged. A first-login user who must change their password gets
`403 PASSWORD_CHANGE_REQUIRED` on every row (Lab 3 BR-02).

| Operation | Unauthenticated | Requester | IT Staff | Administrator |
|---|---|---|---|---|
| View Actions Taken of a Ticket | 401 | ✅ own (404 for another's) | ✅ | 👁 |
| Create an Action Taken | 401 | 403 | ✅ | ✅ |
| Edit, start, complete or cancel an Action | 401 | 403 | ✅ | ✅ |
| Change Ticket owner, IT Priority or status (now with `expectedVersion`) | 401 | 403 | ✅ | 403 |
| View Requester Dashboard | 401 | ✅ own | 403 | 403 |
| View IT Staff Dashboard | 401 | 403 | ✅ | 👁 (no personal figures) |
| List own Tickets with `status` / `active` filter | 401 | ✅ own | 403 | 403 |
| List Queue with `active` filter | 401 | 403 | ✅ | 👁 |

Every 401 and 403 cell has at least one dedicated test in `server/tests/lab-04/`.

### Status Transition Matrix (final)

Only IT Staff change status (Administrator 403, Requester 403). The allowed pairs are those of Lab 3, kept on
purpose: they already satisfy labsheet §4.5, and Lab 3 tests prove them. Lab 4 adds conditions, not pairs.

| From \ To | Open | In Progress | Waiting for Requester | Resolved | Closed | Reopened | Cancelled |
|---|---|---|---|---|---|---|---|
| **New** | ✅ | ✅ (owner) | - | - | - | - | ✅ (cascade) |
| **Open** | - | ✅ (owner) | ✅ (owner) | ✅ (owner, summary, gate) | - | - | ✅ (cascade) |
| **In Progress** | - | - | ✅ (owner) | ✅ (owner, summary, gate) | - | - | ✅ (cascade) |
| **Waiting for Requester** | - | ✅ (owner) | - | ✅ (owner, summary, gate) | - | - | ✅ (cascade) |
| **Resolved** | - | - | - | - | ✅ | ✅ | - |
| **Reopened** | - | ✅ (owner) | ✅ (owner) | ✅ (owner, summary, gate) | - | - | ✅ (cascade) |
| **Closed** | terminal | | | | | | |
| **Cancelled** | terminal | | | | | | |

"owner": the Ticket must have an owner (`409 OWNER_REQUIRED`). "summary": a Resolution Summary of 1 to 2000
characters (`400`). "gate": BR-20 (`409 RESOLUTION_BLOCKED`). "cascade": BR-22. Every request also needs the
current `expectedVersion` (BR-17), and a pair not marked is `409 INVALID_TRANSITION`. Closed and Cancelled
confirmations in the UI are unchanged from Lab 3. The UI lists the allowed targets in the fixed column order
above.

### Action Status Transition Matrix

| From \ To | In Progress | Completed | Cancelled |
|---|---|---|---|
| **Planned** | ✅ | ✅ (Result) | ✅ (Result) |
| **In Progress** | - | ✅ (Result) | ✅ (Result) |
| **Completed** | final | | |
| **Cancelled** | final | | |

## 6. UI Specification Summary

Full detail lives in `docs/lab-04/ui-spec.md`. It governs:
- **New screens**: Requester Dashboard and IT Staff Dashboard (the Administrator sees the latter with the
  personal cards replaced by account counts), both at `/dashboard`.
- **Changed screens**: IT Staff Ticket Detail gains an Actions Taken tab with a list, an inline create form
  and an inline view/edit form (no modal dialog), resolution guidance and a stale-update banner; Requester
  Ticket Detail gains a read-only Actions Taken section; the shell gains a Dashboard entry; My Tickets and
  the Ticket Queue open with the filters named in the URL.
- **Removed**: any leftover temporary, duplicate or obsolete control found by the hardening audit.
- **Reuse**: Zen Green tokens, badges, tabs, buttons, forms, tables and cards from Labs 2 and 3. New
  badges only for the four Action statuses, the follow-up marker and the personal-versus-shared labels.
- **Responsive**: the Lab 2 breakpoints (desktop 992 px and up, tablet 768 to 991 px, mobile below 768 px);
  the Actions Taken table becomes cards below 992 px and dashboard cards reflow 5 or 6 across, 3 across, then 1
  or 2 across.

## 7. Data Changes

All changes are additive; no table, column or row from Labs 1 to 3 is dropped or rewritten. Migration
`lab4_actions_taken`.

| Change | Purpose |
|---|---|
| New enum `ActionStatus` (`PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`) | Action lifecycle stored as a database enum so an invalid state cannot be saved |
| New table `ActionTaken` | One row per Action Taken, child of `Ticket` |
| `Ticket.version` Int, default 1 | Optimistic concurrency token for owner, IT Priority and status changes |

**`ActionTaken`**

| Field | Type | Req. | Key / default | Notes |
|---|---|---|---|---|
| `id` | Int | yes | PK, autoincrement | |
| `ticketId` | Int | yes | FK to `Ticket` | BR-01 |
| `actionAt` | DateTime | yes | | Action Date/Time, user-entered, default now (BR-07) |
| `description` | String | yes | | 1-2000 characters |
| `result` | String | no | | Required when Completed or Cancelled (BR-09) |
| `performedById` | Int | yes | FK to `User` | Set from the session (BR-03) |
| `assigneeId` | Int | yes | FK to `User` | Active IT Staff when set (BR-04) |
| `followUpRequired` | Boolean | yes | default `false` | |
| `followUpNote` | String | no | | Required when `followUpRequired` (BR-08) |
| `attachmentNotes` | String | no | | Which file to look for; text only |
| `actionStatus` | `ActionStatus` | yes | default `PLANNED` | BR-09 |
| `version` | Int | yes | default 1 | BR-16 |
| `clientRequestId` | String | yes | unique with `ticketId` | BR-18 |
| `createdAt` | DateTime | yes | default `now()` | "Action create date/time" (labsheet §8.3) |
| `updatedAt` | DateTime | yes | `@updatedAt` | |

**Indexes.** `@@unique([ticketId, clientRequestId])` for idempotency; `@@index([ticketId, actionAt, id])`
serves the ordered list on Ticket Detail; `@@index([assigneeId, actionStatus])` serves My Open Actions. The
dashboard counts reuse the Lab 3 `Ticket` indexes (`[currentStatus, createdAt]`, `[ownerId]`,
`[requesterId, currentStatus]`).

### Database design decisions (justified)

1. **A separate `ActionTaken` table, not Internal Notes with extra columns.** An Action has its own
   lifecycle (status, assignee, follow-up), is visible to the Requester, and is editable while open, while
   an Internal Note is private and append-only (Lab 3 BR-24). Mixing them would force a visibility flag and
   an "editable unless note" rule, the exact leak risk Lab 3 avoided by keeping Comments and Notes in
   separate tables (`schema.prisma`, Issue 66).
2. **An integer `version`, not an `updatedAt` comparison, for concurrency.** `updatedAt` is also touched by
   BR-14 (Actions touch the Ticket) and has millisecond resolution, so two changes in the same millisecond
   or a harmless touch would look identical or spuriously stale. A counter changes only for the fields it
   guards, is compared with one conditional `UPDATE ... WHERE id = ? AND version = ?`, and an affected-rows
   count of zero is the conflict.
3. **Two foreign keys to `User` (`performedById`, `assigneeId`), not one.** "Performed by (auto)" is an audit
   fact that never changes; the assignee is a responsibility that can be reassigned. Collapsing them would
   lose the audit trail on the first reassignment.
4. **`clientRequestId` unique per Ticket, stored on the row.** Idempotency needs the key to survive across
   requests and servers; storing it on the Action makes "insert or return the existing row" a single unique
   constraint, with no second table to keep consistent.
5. **No `resolvedAt` column.** Every dashboard figure is a count by current status or by recency, so a new
   timestamp would not be read by any query (BR-34).

### Migration, backfill and recovery

1. `CREATE TYPE "ActionStatus"`, `CREATE TABLE "ActionTaken"` and `ALTER TABLE "Ticket" ADD COLUMN "version"
   INTEGER NOT NULL DEFAULT 1`. Existing Tickets receive version 1 from the default; nothing else changes.
2. **Legacy Tickets without Actions** simply have zero Actions. They keep their status, and dashboards count
   them by status (BR-23). No Action is invented for them.
3. **Recovery.** The migration is reversible because it only adds objects: `ALTER TABLE "Ticket" DROP COLUMN
   "version"; DROP TABLE "ActionTaken"; DROP TYPE "ActionStatus";` returns the Lab 3 shape with every Lab 3
   row intact. The README tells the operator to take `pg_dump` before migrating; restoring that dump is the
   recovery path if the migration is interrupted.
4. **Both directions are tested** (`server/tests/lab-04/migration.test.ts`): a temporary Postgres schema is
   seeded with Lab-3-shaped data, the migration SQL is applied and every User, Ticket, Attachment, Public
   Comment and Internal Note is found unchanged with `version = 1`; then the rollback SQL is applied and the
   same rows are still there.
5. **Seed** (`server/prisma/seed.ts`) stays idempotent (`upsert` with a real `update`, Actions keyed by
   `(ticketId, clientRequestId)` with fixed keys such as `seed-<ticketNumber>-1`). After the Lab 3 seed it
   guarantees: Tickets in all 8 statuses, all 4 priorities, assigned and unassigned; at least one Ticket with
   zero Actions, one with exactly one, and one with three or more in different statuses; at least one
   Resolved Ticket with a Completed Action and one legacy Resolved Ticket without any; open Actions assigned
   to at least two IT Staff users; one IT Staff user with no assigned Tickets and no Actions and one
   Requester with no Tickets (so zero figures are demonstrable), alongside non-zero figures for the others.
   Running it twice changes no row count.

## 8. API Contract

Full contract: `docs/lab-04/api-spec.md`. New or changed endpoints:
- **Actions Taken**: `GET /api/tickets/:id/actions` (Requester owner, IT Staff, Administrator),
  `POST /api/staff/tickets/:id/actions`, `PATCH /api/staff/tickets/:id/actions/:actionId` (IT Staff,
  Administrator).
- **Dashboards**: `GET /api/dashboard/requester`, `GET /api/dashboard/staff`.
- **Changed**: `PATCH /api/staff/tickets/:id/owner`, `/it-priority` and `/status` require `expectedVersion`
  and gain `RESOLUTION_BLOCKED` and `STALE_VERSION`; the staff Ticket Detail response gains `version`;
  `GET /api/tickets` accepts every status and `active`; `GET /api/staff/tickets` accepts `active`.
- **Unchanged**: every other Lab 1 to Lab 3 endpoint, including `GET /api/health`.

## 9. Acceptance Criteria

**Actions Taken**
- **AC-01** Given a permitted IT Staff user and valid data, when an Action Taken is created, then it is saved
  under the correct Ticket with the authenticated creator and approved assignee.
- **AC-02** Given an authenticated Requester, when dashboard data is retrieved, then only metrics and recent
  Tickets owned by that Requester are returned.
- **AC-03** Given an assignee who is inactive, a Requester or an Administrator, when an Action is created or
  reassigned, then the request is rejected with `INVALID_ASSIGNEE` and nothing is saved.
- **AC-04** Given Follow-Up Required with an empty Follow-up Note, when the Action is saved, then it is
  rejected with the field named; given Follow-Up Required off, then any note is not stored.
- **AC-05** Given a request body that names `performedById`, `createdAt` or `version` for creation, then
  those values are ignored and Performed by is the signed-in user.
- **AC-06** Given an Administrator, when they create or update an Action, then it succeeds, but their
  attempts to change owner, IT Priority, status, post a Comment or a Note are still `403`.
- **AC-07** Given a Requester or an unauthenticated caller, when they call an Action create or update
  endpoint, then the response is `403` or `401` and nothing changes.
- **AC-08** Given a Requester viewing their own Ticket, then every Action is listed read-only with all its
  fields, another Requester's Ticket answers `404`, and no Internal Note text is in any response.
- **AC-09** Given a Ticket with several Actions, then they are listed in `actionAt`, `id` order and the
  screen shows each one.
- **AC-10** Given an open Action, when it is started, completed or cancelled, then the status changes along
  the Action matrix, and any other change is `INVALID_ACTION_TRANSITION`.
- **AC-11** Given Completed or Cancelled requested without a Result, then the request is rejected naming
  `result`.
- **AC-12** Given a Completed or Cancelled Action, when an edit is submitted, then it is `ACTION_LOCKED` and
  nothing changes.
- **AC-13** Given a Resolved, Closed or Cancelled Ticket, when an Action is created or changed, then it is
  `ACTIONS_LOCKED`.

**Concurrency and duplicates**
- **AC-14** Given a stale `expectedVersion` on an Action update, then the response is `STALE_VERSION` and the
  Action is unchanged; given two simultaneous updates with the same version, then exactly one succeeds.
- **AC-15** Given the same `clientRequestId` submitted twice, one after the other and at the same time,
  then exactly one Action exists and the repeat returns it with `200`.
- **AC-16** Given a stale or missing Ticket `expectedVersion` on owner, IT Priority or status, then stale is
  `STALE_VERSION` and missing is `400`, and the Ticket is unchanged.

**Workflow**
- **AC-17** Given a Ticket with a Planned or In Progress Action, when status Resolved is requested directly
  through the API, then it is `RESOLUTION_BLOCKED` with `OPEN_ACTIONS` and the status is unchanged.
- **AC-18** Given a Ticket with no Completed Action, then Resolved is `RESOLUTION_BLOCKED` with
  `NO_COMPLETED_ACTION`; given an owner, a summary, at least one Completed Action and none open, then
  Resolved succeeds.
- **AC-19** Given an Action being created while the Ticket is being resolved, when both run at once, then
  the Ticket never ends Resolved with an open Action.
- **AC-20** Given a Ticket with open Actions, when it is cancelled, then its open Actions become Cancelled
  in the same operation and Completed Actions are unchanged.
- **AC-21** Given a Ticket Resolved or Closed before Lab 4 with no Actions, then it remains valid, is counted
  by status, and Resolved to Closed is not blocked by the gate.
- **AC-22** Given the Ticket Detail status control, then only transitions allowed from the current status
  appear in the fixed order, and after a successful change the summary status updates without a reload.
- **AC-23** Given a Requester indicates "problem appears resolved", then the status does not change and the
  resolution gate still applies.
- **AC-24** Given a Ticket Resolved but not yet Closed, then the Reopen action makes Actions editable again
  and the Resolved to Reopened to Resolved cycle passes the gate only with its conditions met.

**Dashboards**
- **AC-25** Given seeded data, when the IT Staff dashboard is retrieved, then every count equals an
  independently written SQL query for the same figure.
- **AC-26** Given a Requester calls the staff dashboard, or staff call the Requester dashboard, then `403`;
  with no session, `401`.
- **AC-27** Given a dashboard card that opens a Ticket list, when the link is followed, then the list total
  equals the card's count.
- **AC-28** Given a user with no matching data, then every count shows `0`, every list shows its empty
  message, and a failed request shows a safe failure message with Retry.
- **AC-29** Given an Administrator, then the dashboard shows the staff figures without personal cards, with
  account counts, and no Create Ticket shortcut appears for staff or Administrator.
- **AC-30** Given a large data set, when each dashboard endpoint is called, then it answers within 1000 ms
  (performance smoke, not a benchmark).

**Shell, hardening and regression**
- **AC-31** Given each role signs in, then they land on Dashboard, see only their role's navigation, and the
  current page is marked.
- **AC-32** Given the Lab 4 migration is applied to Lab 3 data, then every existing row is preserved, Ticket
  `version` is 1, the rollback restores the Lab 3 shape, and running the seed twice changes no row count.
- **AC-33** Given a recoverable failure (validation, conflict or network), then the form keeps what the user
  entered.
- **AC-34** Given repeated clicking on a submit button, then one request is in flight and one record results.
- **AC-35** Given the earlier labs' behavior (authentication, My Tickets, Ticket Detail, Attachments, Public
  Comments, IT Staff Queue and Detail, Internal Notes, User Management), then it still works and every Lab 1
  to Lab 3 test still passes.
- **AC-36** Given an invalid drill-down filter value, then the list API answers `400 INVALID_QUERY` naming the
  parameter; given a valid one, then only matching Tickets are returned.
- **AC-37** Given desktop, tablet and mobile widths, then no Lab 4 screen scrolls horizontally, clips or
  overlaps content, focus is visible and every control works from the keyboard.

## 10. Definition of Done

**Product completion** (each box was ticked only after it was checked on the final release branch; the evidence
is named next to it)
- [x] Every FR, BR and AC above is implemented and maps to a passing automated test in
      `docs/lab-04/tests.md`, confirmed by a traceability script run on the release branch
      (`node server/scripts/check-traceability.mjs` on `main`: AC 37/37, FR 22/22, BR 40/40, 98 of 98 tests Pass).
- [x] `server/tests/lab-04/*`, `client/tests/lab-04/*`, `e2e/lab-04/*` and every Lab 1 to Lab 3 test pass from
      `lab4-staging` and again from `main`, with counts recorded in `tests.md` §8 (server 251, client 137,
      Playwright 212 on both); none is skipped, `.only`'d or deleted.
- [x] Every endpoint in `api-spec.md` has a direct API test for success and for each of its `401`, `403`, `400`,
      `404` and `409` cases that applies to it (`SEC-05` calls every Lab 4 endpoint without a session; `SEC-01`
      to `SEC-04` cover `403`; `API-14` and `FLT-01` to `FLT-02` cover `400` and `404`; `API-10`, `API-03`
      and `WF-01` cover `409`); the authorization matrix is enforced on the backend and proved by tests that do
      not use the screen.
- [x] The two concurrency guards (version check, idempotency key) and the row lock each have a test that
      fails when the guard is removed (mutation check), recorded in `tests.md` §7 (MUT-01 to MUT-08).
- [x] Dashboard figures match database queries, shown by an automated comparison (`SDASH-01`, `RDASH-04`,
      `SDASH-03`, `RDASH-05`) and a recorded `psql` session placed in the submission PDF (Part 5), where the
      API figures and independent SQL counts for the same user are equal.
- [x] Actions Taken, Requester and IT Staff dashboards, and the changed Ticket Detail screens conform to
      `ui-spec.md` at desktop, tablet and mobile widths, proved by the 66 screenshots in
      `artifacts/lab-04/screenshots/` that were each compared with the spec, the completed checklist in
      `ui-spec.md` §11, and the screenshot index with the six defects found and fixed in §13.
- [x] No console error, broken link, placeholder text, unfinished control or obsolete UI remains on any main
      screen (the FR-21 sweep in `e2e/lab-04/regression.spec.ts` visits every main screen of every role and
      fails on a console error, an uncaught exception, a `5xx` answer, placeholder text, an unnamed control or a
      dead link).
- [x] README setup, seed, migration (with the `pg_dump` advice), test and demonstration instructions are
      current. Checked on a fresh clone of `main` (`npm ci` in `server/` and `client/`, `prisma generate`,
      `tsc --noEmit` in both, `prisma migrate deploy` on the test database, then the server tests, the client
      tests and the traceability script, all passing); the demonstration steps are covered by `E2E-01` to
      `E2E-03`. Not repeated on a fresh clone: creating the PostgreSQL databases from nothing and the
      Playwright run, which use the developer's existing local databases.
- [x] The timing-sensitive Lab 3 test E2E-02 waits for its options before reading them (changed in Issue #84,
      `tests.md` §6).

**Course delivery**
- [x] Every feature branch is named `feature/<issue>-<slug>`, merged into `lab4-staging` through a
      peer-reviewed PR that the reviewer merged, then released to `main` through a release PR (#94; the later
      documentation-only follow-ups went through the same two steps: #95 with #96, and this Definition of Done update).
- [x] This contract (Issue #79) is merged into `lab4-staging` before any implementation PR is opened, so the
      specification demonstrably existed first (PR #87 merged 2026-10-30 14:20 UTC; PR #88 opened 14:36 UTC).
- [x] Every Issue is linked to its PR in the Development panel and moved through Backlog, Specified, Started,
      PR Review, (Fixing,) Done (Issues #79 to #86, all closed and in Done).
- [x] `docs/lab-04/reviewer.md` records both review directions with real comments, replies and approvals.
- [x] `docs/lab-04/ai-use.md` names the LLM, shows 6 to 10 prompts, and says plainly where AI drafted review
      messages.
- [ ] The submission is one PDF with headings "Answer Part 1" to "Answer Part 9" and working links. (The PDF is
      not a repository file; it is built from this repository after this change and submitted separately.)

## 11. Assumptions and Decisions

Each item resolves a point where the labsheet is silent or contradicts itself.

1. **Fields beyond the seven listed (labsheet §4.1 versus the rubric).** §4.1 lists seven fields, but the
   rubric asks the UI to show assign, status transition, complete, cancel and inactive-assignee rejection, and
   AC-01 mentions an "approved assignee". So an Action also has `assigneeId` and `actionStatus` (plus
   `version` and `clientRequestId`). The labsheet says "Action Date/Time" in §3 and §4.1 but "Action create
   date/time" in §8.3, so both exist: `actionAt` is what the staff member enters (when the work happened) and
   `createdAt` is the automatic record time.
2. **Requester visibility (§4.3 "where approved" versus §8.3 "all").** The Requester sees all Actions of their
   own Ticket, read-only, with every field (BR-10). Internal Notes remain invisible. The staff form warns that
   Action text is visible to the Requester.
3. **The resolution rule (§4.5 gives none).** BR-20 defines it: owner and summary (Lab 3), no open Action, at
   least one Completed Action. Follow-Up Required is a visible badge, not a blocker, because the follow-up may
   legitimately be a different Ticket or later visit; blocking on it would make some Tickets unresolvable.
   Cancelling a Ticket cancels its open Actions (BR-22) so a cancelled Ticket never keeps "open" work.
4. **Append-only (Part 7 rubric) versus "create and update" (§4.1).** Public Comments and Internal Notes are
   append-only (Lab 3 BR-24); Actions are editable only while Planned or In Progress, become read-only
   when Completed or Cancelled, and are never deleted (BR-11, BR-15). "Stable ordering" is the fixed Action
   order (BR-13) and the fixed transition order (BR-19).
5. **Metrics must match the database (Part 5 rubric).** Proved twice: an automated test compares each API
   figure with a separately written raw SQL query, and one `psql` session is captured for the report.
6. **Performance smoke (Part 3 rubric).** A Vitest test loads about 3000 Tickets and 2000 Actions into the
   test database, then requires each dashboard endpoint to answer within 1000 ms and to run a bounded number
   of queries. The generous limit keeps it from failing on a busy laptop; it detects a missing index or a
   per-row query, nothing finer.
7. **Concurrency (§6.1, §8.5).** Optimistic concurrency with an integer `version` (BR-16, BR-17) answering
   `409`, plus `clientRequestId` idempotency for Action creation (BR-18). Two simultaneous requests are tested
   for each, and each guard is removed once to show its test fails.
8. **Duplicate protection beyond Actions.** The single-flight guard (the submit button is disabled and ignored
   while a request is in flight) covers Ticket, Public Comment and Internal Note creation. A network retry
   after a lost response could still repeat one of those three; making them idempotent needs a schema change
   outside this sprint's approved scope, so it is listed as a known limitation.
9. **Administrator and Actions (labsheet §4.3 versus Lab 3 BR-36).** The Lab 4 text says Administrators
   create and update Actions, so they may; nothing else in Lab 3's read-only Administrator rule changes, so
   Lab 3's authorization tests keep passing. An Administrator cannot be an assignee or Ticket Owner (Lab 3
   BR-17), but may be "Performed by".
10. **Dashboard mockups (labsheet pages 5 and 6) are layout references only.** Where the mockup differs from
    §4.6 and the rubric, the text wins: the cards follow BR-29 and BR-30; the "from yesterday" figures are
    dropped (excluded, §3); Quick Actions contain only links the role may use, so IT Staff have no "Create
    Ticket" (they get 403 for it in Lab 3); the brand is spelled TokTickIT; the Requester mockup's In Progress
    card is folded into Open Tickets; and the IT Staff dashboard adds the "My Open Actions" card the rubric
    asks for.
11. **Dashboard as landing page.** Every role lands on `/dashboard` (BR-35). Lab 3 tests that assert the old
    landing pages are updated, not removed (BR-39). If this proves risky during hardening it can be reverted
    to a navigation entry only, with the Lab 3 landing pages restored.
12. **Recent activity.** "Last updated" on Tickets includes Action changes (BR-14) but not Comments or Notes,
    which Lab 3 does not write to the Ticket row; changing that would alter Lab 3 behavior for no stated
    benefit.
13. **Seed and evidence data are local-development data** with the documented local password only (Lab 3
    §7); no real credential enters the repository.
