# Lab 4 Test Plan and Results

Written before implementation, per Test DD (labsheet §10). Every row below starts as **Planned** and is
changed to **Pass** only in the PR that implements that test, once the test exists, runs and passes. Nothing in
this file is reconstructed afterwards from whatever the coding agent generated. Rows are
numbered per type (UNIT, API, WF, SEC, RDASH, SDASH, FLT, MIG, REG, UI, STY, RESP, E2E); these ids belong to
Lab 4 only and are unrelated to the Lab 3 ids of the same shape.

## 1. Test Strategy

Levels follow labsheet §10: unit (pure logic, no database or network), API and integration (Supertest against
the real test database), UI component (Vitest and React Testing Library, network mocked with `msw`), UI style
(class, attribute and aria assertions), responsive and accessibility (Playwright, three widths, computed focus
outline), authorization (direct API calls proving a role or ownership boundary regardless of the screen),
workflow (resolution gate, transitions, concurrency), migration and regression (Lab 3 to Lab 4 data, and every
earlier test), performance-smoke (dashboard endpoints on a large data set) and end-to-end (Playwright, real login).
Every Acceptance Criterion in `specification.md` §9 maps to at least one row (section 3).

Concurrency and idempotency are proved by sending two requests at the same moment, and each guard is removed
once to show its test fails (section 7).

## 2. Planned Tests

### Unit

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| UNIT-01 | BR-07, BR-08, AC-04 | Action input validator: description, result, note and attachment-note limits, follow-up rule, `actionAt` more than 5 minutes ahead | Valid input accepted; each rule violation names its own field; a note sent with follow-up off is discarded | `server/tests/lab-04/action-rules.unit.test.ts` | Pass |
| UNIT-02 | BR-09, AC-10, AC-11 | Action transition function for every (from, to) pair, and the Result requirement | Only Planned to In Progress, Completed, Cancelled and In Progress to Completed, Cancelled pass; Completed and Cancelled without a Result fail | `server/tests/lab-04/action-rules.unit.test.ts` | Pass |
| UNIT-03 | BR-20, AC-17, AC-18 | Resolution-gate function: open Actions only, no Completed Action, both, and a passing case | Returns `OPEN_ACTIONS`, `NO_COMPLETED_ACTION`, both, or no blockers as specified | `server/tests/lab-04/workflow-rules.unit.test.ts` | Pass |
| UNIT-04 | BR-19, AC-22 | Final status matrix against an independently written table, and the fixed order of `allowedTransitions` | Every pair matches the table in specification §5; the targets always come back in the documented column order | `server/tests/lab-04/workflow-rules.unit.test.ts` | Pass |
| UNIT-05 | BR-28 | The active-status set used by the dashboards and the `active` filter | Exactly New, Open, In Progress, Waiting for Requester, Reopened | `server/tests/lab-04/workflow-rules.unit.test.ts` | Pass |

### API - Actions Taken

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| API-01 | AC-01, BR-01, BR-03 | `POST /api/staff/tickets/:id/actions` with valid data as IT Staff | `201`; saved under that Ticket with `performedBy` the signed-in user, the chosen assignee, `version` 1 | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-02 | AC-05, BR-03 | Create with `performedById`, `createdAt`, `version` and `ticketId` in the body | Values ignored; Performed by is the session user; Action is on the URL's Ticket | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-03 | AC-03, BR-04, FR-05 | Create and reassign with an inactive IT Staff user, a Requester, an Administrator and a missing user as assignee | Each `409 INVALID_ASSIGNEE`, including an id that does not exist; a missing or non-integer id is `400`; nothing saved | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-04 | AC-04, BR-08 | Follow-Up Required with an empty or blank note; follow-up off with a note | `400` naming `followUpNote`; with follow-up off the stored note is null | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-05 | AC-11, BR-09 | Create or update to Completed or Cancelled without a Result | `400` naming `result`; the Action is unchanged | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-06 | AC-10, BR-09, FR-03 | PATCH an Action through Planned, In Progress, Completed, and through Cancelled; then an invalid pair | Valid steps `200` with `version` +1 each; invalid pair `409 INVALID_ACTION_TRANSITION` | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-07 | AC-12, BR-11 | PATCH a Completed and a Cancelled Action | `409 ACTION_LOCKED`; fields and `version` unchanged; no delete route exists (`404`) | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-08 | AC-13, BR-12 | Create and PATCH an Action on a Resolved, a Closed and a Cancelled Ticket | `409 ACTIONS_LOCKED` each time; allowed again on a Reopened Ticket | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-09 | AC-09, BR-13, FR-04 | List a Ticket with several Actions created out of order, then one with none | Ordered by `actionAt` then `id`; stable across two calls; empty Ticket returns empty items and zero counts | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-10 | AC-14, BR-16, FR-09 | PATCH with a stale `expectedVersion`; two simultaneous PATCHes with the same version | Stale `409 STALE_VERSION` with `currentVersion`, unchanged; of the two, exactly one `200` and one `409` | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-11 | AC-15, BR-18, FR-10 | POST the same `clientRequestId` twice in sequence, twice in parallel, and once from a different user | One row; repeat `200` with the same `id`; different user `409 DUPLICATE_REQUEST_KEY` | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-12 | BR-14 | Create and update an Action, then read the Ticket | Ticket `updatedAt` moved; Ticket `status`, `ownerId`, `itPriority` and `version` unchanged | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-13 | BR-04 | PATCH an Action whose assignee was deactivated later, leaving the assignee unchanged, then changing it to another inactive user | Unchanged accepted; changed to inactive `409 INVALID_ASSIGNEE` | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-14 | BR-25, BR-16 | Missing `expectedVersion`; an Action id from another Ticket; an unknown Ticket id | `400` with `fieldErrors.expectedVersion`; `404 ACTION_NOT_FOUND`; `404` | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-15 | BR-15, AC-12 | PATCH and DELETE on a Public Comment and on an Internal Note, next to an editable open Action | Comments and Notes have no edit or delete route (`404`); the open Action is still editable (append-only stays Lab 3 behavior) | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-16 | BR-02 | Create an Action on a Ticket with no owner, and one assigned to a staff member who is not the owner | Both `201`; Ticket owner unchanged | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |

### API - Ticket workflow

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| WF-01 | AC-17, BR-20, FR-07 | PATCH status to Resolved directly through the API while a Planned and an In Progress Action exist | `409 RESOLUTION_BLOCKED` with `OPEN_ACTIONS` and the open ids; status and `version` unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| WF-02 | AC-18, BR-20 | Resolve a Ticket with no Completed Action, then after one Action is Completed and none are open | First `409` with `NO_COMPLETED_ACTION`; second `200` Resolved | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| WF-03 | AC-19, BR-21 | Run a resolve request and an Action create at the same moment, repeatedly | Never both succeed with the Ticket Resolved and an open Action; each outcome is internally consistent | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| WF-04 | AC-20, BR-22, FR-08 | Cancel a Ticket that has Planned, In Progress and Completed Actions | Open Actions become Cancelled with the system Result and `version` +1; the Completed Action is untouched; all in one transaction | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| WF-05 | AC-21, BR-23 | A Resolved and a Closed Ticket with no Actions (legacy shape): Resolved to Closed, detail, and the Queue list | Close succeeds; both stay listed with their status and empty Action counts; no Action is invented (the dashboard count of these Tickets is asserted in SDASH-01) | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| WF-06 | AC-16, BR-17 | PATCH owner, IT Priority and status with a missing, a stale and a current `expectedVersion` | Missing `400`; stale `409 STALE_VERSION`; current `200` with `version` +1; Ticket unchanged on failure | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| WF-07 | AC-23, BR-24 | Requester indicates the problem appears resolved, then staff try Resolved with an open Action | Status unchanged by the indication; the gate still blocks | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| WF-08 | AC-24, BR-12 | Resolve, Reopen, add an Action, complete it, Resolve again | Actions blocked while Resolved, allowed after Reopen; second Resolve passes only when the gate is met | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| WF-09 | BR-25 | Requests that fail several checks at once (stale plus invalid transition, no owner plus open Action) | The first failing check in the documented order answers | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| WF-10 | AC-22, BR-26, FR-11 | Successful status change response | Returns the new status, `version` and `allowedTransitions` in matrix order | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| WF-11 | FR-06 | `GET /api/staff/tickets/:id` after Actions change | `version`, `actionCounts` and `resolutionBlockers` match the stored Actions | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |

### Security / Authorization

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| SEC-01 | AC-07, BR-05 | Requester and an unauthenticated caller POST and PATCH Actions; a first-login user does the same | `403 FORBIDDEN`; `401`; `403 PASSWORD_CHANGE_REQUIRED`; nothing created or changed | `server/tests/lab-04/authorization.api.test.ts` | Pass |
| SEC-02 | AC-08, BR-10 | Requester lists Actions on their own Ticket and on another Requester's; Internal Notes exist on both | Own: `200`, every field, no Internal Note text; another's: `404` identical to a missing Ticket | `server/tests/lab-04/authorization.api.test.ts` | Pass |
| SEC-03 | AC-06, BR-06 | Administrator creates and updates an Action, then tries owner, IT Priority, status, a Comment and a Note, and assigns an Action to an Administrator | Action writes `200` and `201`; every other write `403`; Administrator as assignee `409 INVALID_ASSIGNEE` | `server/tests/lab-04/authorization.api.test.ts` | Pass |
| SEC-04 | AC-26 | Each role calls both dashboard endpoints; an unauthenticated caller does too | Requester only on requester, staff roles only on staff; others `403`; no session `401` | `server/tests/lab-04/authorization.api.test.ts` | Planned |
| SEC-05 | BR-37, FR-20 | Every Lab 4 endpoint called once with no session | All `401` | `server/tests/lab-04/authorization.api.test.ts` | Partial: Actions endpoints pass (Issue 80); dashboards added in Issue 83 |
| SEC-06 | AC-02, BR-29 | Requester dashboard called with another user's id as `requesterId` in the query | Ignored; only the caller's figures | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |

### API - Dashboards and drill-down filters

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| RDASH-01 | AC-02, BR-29, FR-12 | Requester dashboard for a Requester who has Tickets in several statuses, with other Requesters' Tickets present | Metrics and lists contain only the caller's Tickets | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| RDASH-02 | BR-29, BR-33 | Attention and recent lists with more than 5 Tickets and ties on `updatedAt` | At most 5 each; attention oldest first; recent newest first then `id` descending; only the documented fields | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| RDASH-03 | AC-28, BR-32 | A Requester with no Tickets | Four metrics `0`; both lists empty | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| RDASH-04 | AC-25, BR-27 | Each requester metric against an independent raw SQL query on seeded data | Equal for every metric | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| RDASH-05 | AC-27, BR-32 | Each requester card against `GET /api/tickets` with the card's drill-down parameters | Card count equals `totalItems` | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| SDASH-01 | AC-25, BR-27, FR-13 | Every staff figure (status counts, unassigned, by priority, my assigned, my open Actions) against independent raw SQL, on data that includes legacy Resolved and Closed Tickets without Actions | Equal for every figure | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| SDASH-02 | BR-30, BR-31, FR-14 | The same endpoint as IT Staff and as Administrator | Staff: `personal` and `myActions` present, `accounts` null; Administrator: `personal` and `myActions` null, `accounts` counts correct | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| SDASH-03 | AC-27, BR-32 | Each staff card against `GET /api/staff/tickets` with its drill-down parameters | Card count equals `totalItems` for every Ticket-list card | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| SDASH-04 | BR-30, BR-33 | Urgent, recent and my-Actions lists with ties, more than 5 rows, a long description, and another staff member's Actions present | Documented order; at most 5; description cut to 120; only the caller's open Actions | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| SDASH-05 | AC-28, BR-32 | An IT Staff user who owns nothing and has no Actions | Personal figures `0`; lists empty where the user has no rows | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| SDASH-06 | AC-30, FR-16 | Load about 3000 Tickets and 2000 Actions, call each dashboard endpoint | Each answers within 1000 ms and runs no more than a bounded number of queries (performance smoke) | `server/tests/lab-04/dashboards.perf.test.ts` | Planned |
| SDASH-07 | BR-33 | Dashboard responses on data that has Internal Notes | No note text; response size independent of the number of Tickets | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| SDASH-08 | BR-34, BR-27 | Tickets updated at 23:59 UTC and 00:01 UTC on consecutive days, dashboards requested with the process time zone set to UTC and to Asia/Bangkok | Identical figures and list order in both zones; no figure depends on a calendar boundary | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| FLT-01 | AC-36, BR-36, FR-15 | `GET /api/tickets` with each of the 8 statuses, `active=true`, both together, and invalid values | Valid filters return only matching own Tickets; invalid `400 INVALID_QUERY` naming the parameter | `server/tests/lab-04/drilldown-filters.api.test.ts` | Planned |
| FLT-02 | AC-36, BR-36, FR-15 | `GET /api/staff/tickets` with `active=true`, combined with `owner` and `itPriority`, and invalid values | Only active matching Tickets; invalid `400` naming the parameter; Lab 3 parameters unchanged | `server/tests/lab-04/drilldown-filters.api.test.ts` | Planned |

### Migration, seed and regression

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| MIG-01 | AC-32, FR-20 | Apply the Lab 4 migration SQL to a temporary schema holding Lab 3 shaped data (Users, Tickets, Attachments, Comments, Notes) | Every row still reachable and unchanged; Ticket `version` is 1 | `server/tests/lab-04/migration.test.ts` | Pass |
| MIG-02 | AC-32 | Apply the rollback SQL after MIG-01 | The Lab 3 shape returns and every Lab 3 row is still present | `server/tests/lab-04/migration.test.ts` | Pass |
| MIG-03 | AC-32 | Run `seedAll()` twice against the test database | No row count changes on the second run | `server/tests/lab-04/seed.lab4.test.ts` | Pass |
| MIG-04 | AC-21, AC-28, AC-09 | Seeded data after `seedAll()` | All 8 statuses; Tickets with zero, one and three or more Actions; a legacy Resolved Ticket without Actions; open Actions for at least two staff users; a staff user and a Requester with zero figures | `server/tests/lab-04/seed.lab4.test.ts` | Pass |
| REG-01 | AC-35, BR-39 | Every Lab 1, Lab 2 and Lab 3 server test file, with the changes listed in section 6 applied | All pass; none skipped or deleted | `server/tests/lab-01`, `server/tests/lab-02`, `server/tests/lab-03` | Planned |
| REG-02 | AC-35, BR-39 | Every Lab 1, Lab 2 and Lab 3 client test file, with the changes listed in section 6 applied | All pass; none skipped or deleted | `client/tests/lab-01`, `client/tests/lab-02`, `client/tests/lab-03` | Planned |
| REG-03 | AC-35, BR-39 | Every Lab 2 and Lab 3 end-to-end spec, with the changes listed in section 6 applied | All pass; none skipped or deleted | `e2e/lab-02`, `e2e/lab-03` | Planned |
| REG-04 | AC-35, FR-20 | Representative flows through the real UI: login, My Tickets, Ticket Detail, Attachments, Public Comments, Queue, Staff Detail, Internal Notes, User Management | Each works for its role after Lab 4 | `e2e/lab-04/regression.spec.ts` | Planned |

### UI component (Vitest + React Testing Library)

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| UI-01 | AC-28, BR-35, FR-13 | StaffDashboard renders every card and list from a mocked response | Labels, values and link targets match api-spec §8; no Create Ticket control | `client/tests/lab-04/StaffDashboard.test.tsx` | Planned |
| UI-02 | AC-28, BR-32 | StaffDashboard with all-zero data | Every card shows `0`; each list shows its empty message | `client/tests/lab-04/StaffDashboard.test.tsx` | Planned |
| UI-03 | AC-28 | StaffDashboard while loading and on API failure, then Retry | Skeletons while loading; failure callout with Retry; no stale numbers; Retry reloads | `client/tests/lab-04/StaffDashboard.test.tsx` | Planned |
| UI-04 | AC-29, BR-31, FR-14 | StaffDashboard as Administrator | No My Assigned, My Open Actions or My Queue; Accounts card links to Users; read-only note shown | `client/tests/lab-04/StaffDashboard.test.tsx` | Planned |
| UI-05 | AC-02, BR-29, FR-12 | RequesterDashboard with data and with empty lists | Four cards with links; attention and recent lists; empty messages | `client/tests/lab-04/RequesterDashboard.test.tsx` | Planned |
| UI-06 | AC-28 | RequesterDashboard loading, zero data and API failure | Skeletons, `0` values and messages, failure callout with Retry | `client/tests/lab-04/RequesterDashboard.test.tsx` | Planned |
| UI-07 | AC-31, BR-35, FR-17 | Shell for each role, and the `/` redirect | Dashboard plus the role's own entries only; `aria-current` on the current page; lands on `/dashboard` | `client/tests/lab-04/ShellDrillDown.test.tsx` | Planned |
| UI-08 | AC-27, FR-15 | My Tickets and the Queue opened with `status`, `active`, `owner` and `itPriority` in the URL | Filters applied to the request and shown; chip removable; Clear filters empties the URL | `client/tests/lab-04/ShellDrillDown.test.tsx` | Planned |
| UI-09 | AC-01, FR-01 | ActionsTaken create form submits valid data | One POST with a `clientRequestId`; panel closes; list refreshes; polite status shown | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-10 | AC-04, AC-11, FR-19 | Create and edit with invalid fields | Messages directly under each field; entered values kept; first invalid field focused | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-11 | AC-34, BR-38 | Double click and double Enter on Save, then a retry after failure | Exactly one request in flight; the retry reuses the same `clientRequestId` | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-12 | AC-03 | Server answers `INVALID_ASSIGNEE` | Message under Assignee; entered data kept | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-13 | AC-14 | Server answers `STALE_VERSION` on an Action edit, then Reload latest | Banner shown; the user's text kept until Reload; reload shows the new version | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-14 | AC-10, AC-12 | Start, Complete (with and without a Result) and Cancel on an open Action; open a Completed Action | Complete without a Result focuses Result; Cancel asks to confirm; a final Action has no Edit button and shows plain text | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-15 | AC-13 | Staff Ticket Detail on a Resolved, Closed and Cancelled Ticket | Add and edit controls hidden with the explanation; the list still readable | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-16 | AC-06 | Staff Ticket Detail as Administrator | Add Action and edit controls present; owner, priority and status shown as plain text | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-17 | AC-08 | Requester Ticket Detail with and without Actions | Read-only section with every field; no write controls; empty message | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-18 | AC-09 | Several Actions in different statuses | All listed in API order with the right badges and follow-up marker | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-19 | AC-22, FR-06 | Status select on Ticket Detail for each current status | Only the current value and `allowedTransitions` offered, in matrix order | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pass |
| UI-20 | AC-17, FR-07 | Resolved chosen while `resolutionBlockers` has entries; server then answers `RESOLUTION_BLOCKED` | Reason text shown and Update disabled; the server answer shows the same reasons and keeps the typed Resolution Summary (the link to the Actions tab is added with that tab in Issue 82 and asserted in UI-14) | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pass |
| UI-21 | AC-22, BR-26, FR-11 | A successful status change | The header status badge and version are replaced from the response without reloading | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pass |
| UI-22 | AC-16 | `STALE_VERSION` on owner, IT Priority and status | Banner with Reload latest; the chosen value stays visible | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pass |
| UI-23 | AC-20 | Choosing Cancelled on a Ticket | Confirmation mentions that open actions will be cancelled | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pass |
| UI-24 | AC-33, FR-19 | Create Ticket, Public Comment and Internal Note forms after a server failure | Entered data kept; one request per click | `client/tests/lab-04/FormHardening.test.tsx` | Planned |

### UI style

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| STY-01 | BR-40, AC-37 | Action status badges and the follow-up marker | Four distinct classes, each with visible text, never colour alone | `client/tests/lab-04/lab4.style.test.tsx` | Pass |
| STY-02 | AC-37 | Stylesheet colour literals in the Lab 4 sections of `zen-green.css` (Lab 3 and earlier rules are untouched) | Only `--zen-*` tokens, no hex, `rgb` or `hsl` literal | `client/tests/lab-04/lab4.style.test.tsx` | Pass |
| STY-03 | BR-10, AC-08 | Shared label on the Action form and the Internal Notes lock label | Both present, each with its own text and `aria-label` | `client/tests/lab-04/lab4.style.test.tsx` | Pass |
| STY-04 | AC-37, FR-22 | Accessibility attributes on the new screens | `aria-current` on nav, `aria-invalid` and `aria-describedby` on invalid fields, `role=status` on saved messages, the Action form is not a dialog | `client/tests/lab-04/lab4.style.test.tsx` | Partial: Action form attributes pass (Issue 82); nav aria-current added in Issue 83 |

### Responsive and end-to-end (Playwright)

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| RESP-01 | AC-37, FR-22 | IT Staff Dashboard (including loaded, zero, failure and Administrator states) at 1280, 850 and 375 px | No horizontal page scroll; screenshots saved under `artifacts/lab-04/screenshots/staff-dashboard/` | `e2e/lab-04/responsive.spec.ts` | Planned |
| RESP-02 | AC-37, FR-22 | Requester Dashboard at three widths | No horizontal scroll; screenshots saved under `requester-dashboard/` | `e2e/lab-04/responsive.spec.ts` | Planned |
| RESP-03 | AC-37, FR-22 | Actions Taken on staff and Requester Ticket Detail at three widths, including create, validation, edit, final, stale and locked states | No horizontal scroll; table becomes cards below 992 px; screenshots under `actions-taken/` | `e2e/lab-04/responsive.spec.ts` | Partial: no horizontal scroll at 1280, 850 and 375 px and the table-to-cards switch pass (Issue 82); screenshots of every state come in Issue 85 |
| RESP-04 | AC-37, FR-22 | Ticket workflow controls at three widths | No horizontal scroll; screenshots under `ticket-workflow/` | `e2e/lab-04/responsive.spec.ts` | Planned |
| RESP-05 | AC-37, FR-22 | Keyboard-only walk through the dashboard cards, the Action form and the status control | A visible outline on every control reached, measured from computed style; screenshots under `focus/` | `e2e/lab-04/responsive.spec.ts` | Planned |
| E2E-01 | AC-01, AC-03, AC-06, AC-08, AC-10, AC-11, AC-12 | Staff creates, assigns, edits, starts, completes and cancels Actions; an inactive assignee is refused; the Requester then sees the Actions read-only; Administrator creates one | Every step shows the expected result in the real UI; the Requester view has no write controls | `e2e/lab-04/actions-taken-flow.spec.ts` | Pass |
| E2E-02 | AC-16, AC-17, AC-18, AC-20, AC-22, AC-24 | Resolve is blocked with an open Action; complete it and resolve; two browser sessions cause a stale conflict; cancel cascades; reopen and resolve again | Each outcome as specified; the summary status updates without a reload | `e2e/lab-04/ticket-resolution.spec.ts` | Planned |
| E2E-03 | AC-27, AC-28, AC-29, AC-31 | Each role logs in, sees its dashboard and navigation, follows every card, and the count matches the list; zero-data and Administrator views | Landing on Dashboard; list totals equal card counts; zero states and the Administrator variant correct | `e2e/lab-04/dashboards.spec.ts` | Planned |

## 3. Acceptance-Criterion Traceability

| AC | Covered by |
|---|---|
| AC-01 | API-01, UI-09, E2E-01 |
| AC-02 | SEC-06, RDASH-01, UI-05 |
| AC-03 | API-03, UI-12, E2E-01 |
| AC-04 | UNIT-01, API-04, UI-10 |
| AC-05 | API-02 |
| AC-06 | SEC-03, UI-16, E2E-01 |
| AC-07 | SEC-01 |
| AC-08 | SEC-02, UI-17, STY-03, E2E-01 |
| AC-09 | API-09, MIG-04, UI-18 |
| AC-10 | UNIT-02, API-06, UI-14, E2E-01 |
| AC-11 | UNIT-02, API-05, UI-10, E2E-01 |
| AC-12 | API-07, API-15, UI-14, E2E-01 |
| AC-13 | API-08, UI-15 |
| AC-14 | API-10, UI-13 |
| AC-15 | API-11 |
| AC-16 | WF-06, UI-22, E2E-02 |
| AC-17 | UNIT-03, WF-01, UI-20, E2E-02 |
| AC-18 | UNIT-03, WF-02, E2E-02 |
| AC-19 | WF-03 |
| AC-20 | WF-04, UI-23, E2E-02 |
| AC-21 | WF-05, MIG-04 |
| AC-22 | UNIT-04, WF-10, UI-19, UI-21, E2E-02 |
| AC-23 | WF-07 |
| AC-24 | WF-08, E2E-02 |
| AC-25 | RDASH-04, SDASH-01 |
| AC-26 | SEC-04 |
| AC-27 | RDASH-05, SDASH-03, UI-08, E2E-03 |
| AC-28 | RDASH-03, SDASH-05, MIG-04, UI-01, UI-02, UI-03, UI-06, E2E-03 |
| AC-29 | UI-04, E2E-03 |
| AC-30 | SDASH-06 |
| AC-31 | UI-07, E2E-03 |
| AC-32 | MIG-01, MIG-02, MIG-03 |
| AC-33 | UI-24 |
| AC-34 | UI-11 |
| AC-35 | REG-01, REG-02, REG-03, REG-04 |
| AC-36 | FLT-01, FLT-02 |
| AC-37 | STY-01, STY-02, STY-04, RESP-01, RESP-02, RESP-03, RESP-04, RESP-05 |

### Functional requirements and business rules

| FR | Covered by |
|---|---|
| FR-01 | UI-09, API-01, E2E-01, API-02 |
| FR-02 | API-07, API-15, UI-14, E2E-01, API-10, UI-13 |
| FR-03 | API-06, UNIT-02, UI-14, E2E-01 |
| FR-04 | API-09, SEC-02, UI-17, STY-03, E2E-01, MIG-04, UI-18 |
| FR-05 | API-03, UI-12, E2E-01 |
| FR-06 | WF-11, UI-19, UNIT-04, WF-10, UI-21, E2E-02 |
| FR-07 | WF-01, UI-20, UNIT-03, E2E-02, WF-02 |
| FR-08 | WF-04, UI-23, E2E-02 |
| FR-09 | API-10, UI-13, WF-06, UI-22, E2E-02 |
| FR-10 | API-11 |
| FR-11 | WF-10, UI-21, UNIT-04, UI-19, E2E-02 |
| FR-12 | RDASH-01, UI-05, SEC-06 |
| FR-13 | SDASH-01, UI-01, RDASH-04 |
| FR-14 | SDASH-02, UI-04, E2E-03 |
| FR-15 | FLT-01, FLT-02, UI-08, RDASH-05, SDASH-03, E2E-03 |
| FR-16 | SDASH-06, RDASH-04, SDASH-01 |
| FR-17 | UI-07, E2E-03 |
| FR-18 | RDASH-03, SDASH-05, MIG-04, UI-01, UI-02, UI-03, UI-06, E2E-03 |
| FR-19 | UI-10, UI-24, UI-11 |
| FR-20 | SEC-05, MIG-01, REG-04, REG-01, REG-02, REG-03 |
| FR-21 | REG-01, REG-02, REG-03, REG-04 |
| FR-22 | STY-04, RESP-01, RESP-02, RESP-03, RESP-04, RESP-05, STY-01, STY-02 |

| BR | Covered by |
|---|---|
| BR-01 | API-01 |
| BR-02 | API-16 |
| BR-03 | API-01, API-02 |
| BR-04 | API-03, API-13 |
| BR-05 | SEC-01 |
| BR-06 | SEC-03 |
| BR-07 | UNIT-01 |
| BR-08 | UNIT-01, API-04 |
| BR-09 | UNIT-02, API-05, API-06 |
| BR-10 | SEC-02, STY-03 |
| BR-11 | API-07 |
| BR-12 | API-08, WF-08 |
| BR-13 | API-09 |
| BR-14 | API-12 |
| BR-15 | API-15 |
| BR-16 | API-10, API-14 |
| BR-17 | WF-06 |
| BR-18 | API-11 |
| BR-19 | UNIT-04 |
| BR-20 | UNIT-03, WF-01, WF-02 |
| BR-21 | WF-03 |
| BR-22 | WF-04 |
| BR-23 | WF-05 |
| BR-24 | WF-07 |
| BR-25 | API-14, WF-09 |
| BR-26 | WF-10, UI-21 |
| BR-27 | RDASH-04, SDASH-01, SDASH-08 |
| BR-28 | UNIT-05 |
| BR-29 | SEC-06, RDASH-01, RDASH-02, UI-05 |
| BR-30 | SDASH-02, SDASH-04 |
| BR-31 | SDASH-02, UI-04 |
| BR-32 | RDASH-03, RDASH-05, SDASH-03, SDASH-05, UI-02 |
| BR-33 | RDASH-02, SDASH-04, SDASH-07 |
| BR-34 | SDASH-08 |
| BR-35 | UI-01, UI-07 |
| BR-36 | FLT-01, FLT-02 |
| BR-37 | SEC-05 |
| BR-38 | UI-11 |
| BR-39 | REG-01, REG-02, REG-03 |
| BR-40 | STY-01 |

A script (`server/scripts/check-traceability.mjs`, added with the evidence PR) re-derives these tables from the
rows above and from `specification.md`, and fails if any FR, BR or AC has no test. The script that produced
this plan reported no uncovered item.

## 4. Responsive and Visual Checklist

Completed in `ui-spec.md` §11, item by item, against the screenshots in `artifacts/lab-04/screenshots/`. Not
started yet; this section is filled in by the evidence PR (Issue #85).

## 5. Test Commands

```bash
# unit + API + authorization + workflow + migration + performance-smoke (Vitest + Supertest, uses server/.env.test)
cd server && npm test

# UI component + UI style (Vitest + React Testing Library)
cd client && npm test

# responsive + E2E (Playwright, run from the repo root; playwright.config.ts starts both dev servers,
# runs one worker, removes leftover e2e.* users and re-seeds the dev database first)
npx playwright test
npx playwright test e2e/lab-04      # Lab 4 only; writes artifacts/lab-04/screenshots
```

## 6. Changes to earlier tests (BR-39)

A Lab 1 to Lab 3 test is changed only when Lab 4 deliberately changes the behavior it asserts, in the PR that
changes that behavior, and it is listed here with the reason. Nothing is deleted, skipped or `.only`'d. This
table starts with the changes the contract already predicts and is completed with the real list in each PR.

| Test | Why it changes | Changed in |
|---|---|---|
| Lab 3 `staff-ticket-detail.api.test.ts`, all 18 owner, IT Priority and status requests by IT Staff | The request now carries `expectedVersion` (BR-17); a `patchTicket` helper sends the version stored at that moment, so each test still checks the rule it was written for | Issue #81 |
| Lab 3 `staff-ticket-detail.api.test.ts`, "requires a Resolution Summary ... and stores it" | Resolving now needs a Completed Action (BR-20), so the test records one before the successful resolve; the 400 assertions for a missing summary are unchanged | Issue #81 |
| Lab 3 `client/tests/lab-03/StaffTicketDetail.test.tsx`, fixture and 3 request-body assertions | The Ticket carries `version`, `actionCounts` and `resolutionBlockers`, and every change sends `expectedVersion` | Issue #81 |
| Lab 3 `e2e/lab-03/helpers.ts`, `responsive.spec.ts`, `staff-ticket-flow.spec.ts` | Fixture and flow requests send the Ticket version (new `patchTicket` helper), and tickets that reach Resolved first get a Completed Action (new `addCompletedAction` helper) | Issue #81 |
| `client/tests/msw/handlers.ts` (shared mock server) | Both Ticket Detail screens now read the Actions of their Ticket, so the default handler for `GET /api/tickets/:id/actions` answers an empty list; no assertion changed | Issue #82 |
| `server/prisma/cleanup-e2e-users.ts` (e2e set-up) | The Lab 4 e2e spec assigns Actions to a throwaway `e2e.*` staff user, and an Action restricts deleting its users, so the clean-up removes those Actions first | Issue #82 |
| Lab 2 `my-tickets.api.test.ts` assertion that only `NEW` is a valid `status` | `status` accepts all 8 values (BR-36) | Issue #83 |
| Lab 3 client and e2e tests that assert the landing page after login | Every role lands on `/dashboard` (BR-35) | Issue #83 |
| Lab 3 `e2e/lab-03/staff-ticket-flow.spec.ts` E2E-02 | Waits for the select options before reading them (timing-sensitive; test-only change) | Issue #84 |

## 7. Mutation checks (evidence procedures, recorded when run)

Each check removes one guard on a scratch copy of the code, runs the named tests and records that they fail;
the guard is then restored and the tests pass again. The outcome column stays **Not run** until it has been run.

| ID | Tests that must fail | Guard removed | Expected failure | Outcome |
|---|---|---|---|---|
| MUT-01 | API-10, UI-13 | Remove the `version` condition from the Action update (both the explicit comparison and the `WHERE version = ?` of the UPDATE) | API-10 fails (both parallel updates succeed or a stale update is accepted) | Run in Issue 80: API-10 and API-14 failed (`expected 200 to be 409`); guard restored, all 16 API tests pass. UI-13 is checked in Issue 82. |
| MUT-02 | API-11 | Remove the replay lookup, and separately the unique `(ticketId, clientRequestId)` index | API-11 fails (two rows exist) | Run in Issue 80: lookup removed with the index kept, API-11 failed (`expected 500 to be 200`, the unique index refused the duplicate); index dropped too, the suite could not even start because the seed upserts on that key. The index itself is also asserted by MIG-01. Both restored. |
| MUT-03 | WF-03 | Remove the Ticket row lock in the resolve path | WF-03 fails (Resolved with an open Action appears) | Run in Issue 81: WF-03 failed in 3 of 3 runs (`round 1: 200/201`, the resolve and the Action create both succeeded); lock restored, all 11 workflow tests pass. |
| MUT-04 | WF-01, WF-02 | Remove the resolution gate | WF-01 and WF-02 fail | Run in Issue 81: WF-01, WF-02, WF-07 and WF-08 failed; gate restored. |
| MUT-06 | WF-06 | Remove the version condition from the Ticket owner, IT Priority and status change (explicit comparison and conditional UPDATE) | WF-06 fails | Run in Issue 81: WF-04, WF-06 and WF-09 failed; guard restored. |
| MUT-05 | SEC-01 | Remove the role check from the Action write routes | SEC-01 fails | Run in Issue 80: SEC-01 failed (`expected 201 to be 403`); restored. SEC-03 is not expected to fail here because it also proves the Lab 3 owner, priority, status, Comment and Note routes stay 403 for an Administrator, and this mutation does not touch them. |

## 8. Final Results

Not run yet. The real output of the commands in section 5 is pasted here by the evidence PR after the suite is
run on `lab4-staging`, and again after the release on `main`, and the counts must match. Baseline before any
Lab 4 change, run on `main` at `421aea1` on 2026-10-30: server 171 passed (20 files), client 95 passed
(15 files); the Playwright baseline of 128 is taken from the Lab 3 report and is re-run before the first
implementation PR.

## 9. Known Limitations or Deferred Tests

- Ticket, Public Comment and Internal Note creation are protected against double clicks by the single-flight
  guard only (UI-11, UI-24). A retry after a lost network response is not made idempotent for those three
  (specification Assumption 8); only Actions Taken have a server-side key.
- The performance-smoke limit (1000 ms) detects a missing index or a per-row query, not small regressions.
- No automated axe-style accessibility scan is added; accessibility is covered by STY-04, RESP-05 and the
  manual checklist in `ui-spec.md` §11.
- Lab 3's timing-sensitive E2E-02 is fixed in Issue #84; until then it can fail on a busy machine.
