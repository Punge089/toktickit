# Lab 3 Test Plan and Results

Written before implementation, per Test DD (labsheet §10). Every row below is planned first — the
**Result** column starts as **Planned** and is only changed to **Pass** once that specific test exists,
runs, and passes on `main`, per the PR it was implemented in. This file is not reconstructed afterward
from whatever the coding agent happened to generate.

## 1. Test Strategy

Seven levels, matching labsheet §10: unit (pure logic, no DB/network), API/integration (Supertest against
the real test database), UI component (Vitest + RTL, network mocked via `msw`), UI style
(class/attribute/aria assertions, not pixels), security/authorization (direct API calls proving a role or
ownership boundary holds regardless of what the UI would show), migration/regression (the Lab 2 → Lab 3
data migration, and every adapted Lab 2 test), and end-to-end (Playwright, full stack, real login).
Every Acceptance Criterion in `specification.md` §9 maps to at least one row below (§3).

## 2. Planned Tests

### Unit

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| UNIT-01 | BR-08 | Password policy validator: length, upper/lower/digit/special | Accepts a compliant password; rejects one missing each rule individually | `server/tests/lab-03/password.unit.test.ts` | **Pass** |
| UNIT-02 | BR-07, BR-09 | `hashPassword`/`verifyPassword` round trip; wrong password; same password fails "must differ" check | Correct password verifies true, wrong verifies false, hash is never the plaintext | `server/tests/lab-03/password.unit.test.ts` | **Pass** |
| UNIT-03 | BR-19–BR-23 | Transition-matrix function for every (from, to) pair in specification.md §5, checked against an independently written table | Listed pairs return allowed; every other pair, including same-status, returns rejected | `server/tests/lab-03/transitions.unit.test.ts` | **Pass** |
| UNIT-04 | §6.3, AC-24 | Queue query parser: valid and invalid `sort`/`status`/`itPriority`/`categoryId`/`owner`/`page`/`pageSize`/`search`, and repeated parameters | Valid values parse to the expected filter object; each invalid value returns the specific field name that failed | `server/tests/lab-03/staff-queue.api.test.ts` (`parseQueueQuery` exercised directly) | **Pass** |

### API — Authentication

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| API-01 | AC-01 | `POST /api/auth/login` valid credentials | `200`; session cookie set; body has role and `mustChangePassword` | `server/tests/lab-03/auth.api.test.ts` | **Pass** |
| API-02 | AC-05 | Login with wrong password, and separately with an unknown email | Both `401 INVALID_CREDENTIALS`, identical message | `server/tests/lab-03/auth.api.test.ts` | **Pass** |
| API-03 | AC-06 | Login with correct password on an inactive account | `403 ACCOUNT_INACTIVE` | `server/tests/lab-03/auth.api.test.ts` | **Pass** |
| API-04 | AC-07, BR-06 | 5 failed attempts then a 6th (even with the correct password) within the window | First 5 return `401`; 6th returns `429` with `Retry-After`; resets after a successful login | `server/tests/lab-03/auth.api.test.ts` | **Pass** |
| API-05 | AC-02, BR-02 | A `mustChangePassword` user calls a protected endpoint on the new session middleware chain before changing password | `403 PASSWORD_CHANGE_REQUIRED`; `/me`, `/logout`, `/change-password` remain reachable | `server/tests/lab-03/auth.api.test.ts` | **Pass** |
| API-06 | BR-08, BR-09 | `POST /api/auth/change-password` with a policy-violating password, a mismatched confirmation, and the same-as-current password | Each `400` with the specific `fieldErrors` key | `server/tests/lab-03/auth.api.test.ts` | **Pass** |
| API-07 | BR-02 | Successful change-password on a first-login user | `mustChangePassword` becomes `false`; every other endpoint is now reachable | `server/tests/lab-03/auth.api.test.ts` | **Pass** |
| API-08 | BR-09 | Successful change-password while a second session (different login) exists for the same user | The second session's next request is `401`; the session used to change the password still works | `server/tests/lab-03/auth.api.test.ts` | **Pass** |
| API-09 | AC-08, BR-10 | `POST /api/auth/logout` then reuse of the old cookie | Logout `204`; the reused cookie gets `401` on `/me` | `server/tests/lab-03/auth.api.test.ts` | **Pass** |
| API-10 | FR-04 | `GET /api/auth/me` with no cookie | `401` | `server/tests/lab-03/auth.api.test.ts` | **Pass** |

### Security / Authorization

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| SEC-01 | AC-03, BR-03 | Requester sends another user's id as `requesterId` in the body, in the query string, and on the legacy `X-Dev-Requester-Id` header while creating/listing tickets | All three ignored; only the authenticated user's own data is returned/created | `server/tests/lab-03/authorization.api.test.ts` | **Pass** |
| SEC-02 | AC-11 | Requester calls `GET /api/staff/tickets` and `GET /api/staff/tickets/:id` directly | Both `403 FORBIDDEN`, no ticket data in the body | `server/tests/lab-03/comments-notes.api.test.ts` (and `staff-queue.api.test.ts` for the list half of SEC-02) | **Pass** |
| SEC-03 | AC-04, AC-20 | Requester calls `GET`/`POST /api/staff/tickets/:id/notes` on their own ticket | Both `403`, no note content anywhere in the response | `server/tests/lab-03/comments-notes.api.test.ts` (and `staff-queue.api.test.ts` for the list half of SEC-02) | **Pass** |
| SEC-04 | AC-29 | IT Staff and Requester each call every `/api/admin/*` endpoint | All `403`; unauthenticated caller gets `401` on the same endpoints | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| SEC-05 | BR-36 | Every Requester-scoped endpoint plus `/api/auth/me` is called once unauthenticated | All return `401` | `server/tests/lab-03/authorization.api.test.ts` | **Pass** |
| SEC-06 | BR-13 | State-changing request with a mismatched `Origin` header vs. one with none vs. the correct one | Mismatched `Origin` → `403 ORIGIN_NOT_ALLOWED`; missing or matching `Origin` → normal handling | `server/tests/lab-03/authorization.api.test.ts` | **Pass** |
| SEC-07 | BR-39 | `GET /api/dev-requesters` | `404` — route no longer exists | `server/tests/lab-02/reference.api.test.ts` | **Pass** |
| SEC-08 | BR-36 | IT Staff attempts to write a Comment/Note/status change on a Ticket that belongs to a Requester, called with a Requester B's ticket id that does exist | Confirms `404` is used only for true nonexistence at Requester routes, and staff routes never 404 solely due to ownership | `server/tests/lab-03/comments-notes.api.test.ts` (and `staff-queue.api.test.ts` for the list half of SEC-02) | **Pass** |

### Migration and Regression

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| MIG-01 | §7 Migration Decisions | Apply the Lab 3 migration SQL to a temporary schema seeded with Lab-2-shaped rows (a legacy Requester, a Ticket with `itPriority = null`, an Attachment with uploader/remover) | Same rows reachable via `User`/`Ticket`; FK references unchanged; `itPriority` backfilled to `requestedPriority` | `server/tests/lab-03/migration.test.ts` | **Pass** |
| MIG-02 | §7 Migration Decisions | A migrated Requester's `passwordHash` after the migration but before the seed password is applied | `passwordHash` is `null` and `mustChangePassword` is `true` — such a user cannot log in until a password is set | `server/tests/lab-03/migration.test.ts` | **Pass** |
| MIG-03 | labsheet §5.3 | Run `seedAll()` twice against the test DB | Second run changes no row counts; ≥4 active + ≥1 inactive Requester, ≥3 active + ≥1 inactive IT Staff, ≥1 active Administrator all present | `server/tests/lab-03/seed.lab3.test.ts` | **Pass** |
| MIG-04 | labsheet §5.3 | Seeded Tickets after `seedAll()` | All 8 statuses represented at least once; at least one assigned and one unassigned Ticket; Resolved/Closed Tickets have a `resolutionSummary` | `server/tests/lab-03/seed.lab3.test.ts` | **Pass** |
| REG-01 | BR-37, BR-38 | `server/tests/lab-02/create-ticket.api.test.ts`, adapted to log in instead of sending `X-Dev-Requester-Id`; adds a since-deactivated-session case and an IT Staff role-boundary case | Same assertions as Lab 2, all passing under session auth (8/8) | `server/tests/lab-02/create-ticket.api.test.ts` | **Pass** |
| REG-02 | BR-37, BR-38 | `server/tests/lab-02/my-tickets.api.test.ts`, adapted | Same assertions, session-authenticated (11/11) | `server/tests/lab-02/my-tickets.api.test.ts` | **Pass** |
| REG-03 | BR-37, BR-38 | `server/tests/lab-02/ticket-detail.api.test.ts`, adapted | Same assertions, session-authenticated (5/5) | `server/tests/lab-02/ticket-detail.api.test.ts` | **Pass** |
| REG-04 | BR-37, BR-38 | `server/tests/lab-02/attachments.api.test.ts`, adapted | Same assertions, session-authenticated (7/7) | `server/tests/lab-02/attachments.api.test.ts` | **Pass** |
| REG-05 | BR-38 | `client/tests/lab-02/RequesterSelect.test.tsx`, repurposed, plus `zen-green.style.test.tsx`, `CreateTicket.test.tsx`, `MyTickets.test.tsx`, `RequesterTicketDetail.test.tsx`, `AttachmentSection.test.tsx` adapted to the session-cookie identity | Asserts `/select-requester` no longer exists and redirects to `/login`; every other Lab 2 client test's original assertions still pass under `AuthContext` | `client/tests/lab-02/*.test.tsx` | **Pass** |
| REG-06 | BR-38 | `e2e/lab-02/requester-ticket-flow.spec.ts` and `responsive.spec.ts`, adapted to log in via the real Login screen instead of the Dev Requester selector; "switching Requester" is logout + log back in | Full Lab 2 flow (create → find → remove attachment → cross-Requester 404) plus all 27 responsive/visual screenshots still pass end to end (28/28) | `e2e/lab-02/requester-ticket-flow.spec.ts`, `e2e/lab-02/responsive.spec.ts` | **Pass** |

### Queue

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| QUE-01 | AC-23 | Combine `search` + `status` + `itPriority` + `owner=me` + `sort=itPriority:desc` on a seeded set of Tickets | Only Tickets matching every condition, in the requested order | `server/tests/lab-03/staff-queue.api.test.ts` | **Pass** |
| QUE-02 | AC-24 | Invalid `sort`, invalid `status`, invalid `pageSize` values, one at a time | Each `400 INVALID_QUERY` naming that parameter | `server/tests/lab-03/staff-queue.api.test.ts` | **Pass** |
| QUE-03 | §6.3 | `owner=unassigned` and `owner=<id>` | Returns exactly the unassigned Tickets, then exactly that owner's Tickets | `server/tests/lab-03/staff-queue.api.test.ts` | **Pass** |
| QUE-04 | §6.3 | `page` beyond `totalPages` | `200` with empty `items` and correct `totalItems`/`totalPages`, not a `400` | `server/tests/lab-03/staff-queue.api.test.ts` | **Pass** |
| QUE-05 | AC-12 | A Ticket created via the Requester API | Its `itPriority` in the Queue response equals its `requestedPriority` | `server/tests/lab-03/staff-queue.api.test.ts` | **Pass** |
| QUE-06 | BR-36, FR-10, FR-16 | IT Staff and Administrator read the Queue; Requester and an unauthenticated caller do not; `GET /api/staff/assignable-users` lists only active IT Staff | `200` for both staff roles; Requester `403 FORBIDDEN` with no ticket data; no session `401`; inactive staff and Requesters absent from assignable users | `server/tests/lab-03/staff-queue.api.test.ts` | **Pass** |

### Staff Ticket Detail

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| DET-01 | AC-13 | `PATCH .../owner` claiming an unassigned Ticket | `200`; owner set; reflected in a subsequent Queue fetch | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | **Pass** |
| DET-02 | AC-14 | `PATCH .../owner` reassigning from IT Staff A to IT Staff B | `200`; owner becomes B | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | **Pass** |
| DET-03 | BR-17 | `PATCH .../owner` with a Requester's id, and with an inactive IT Staff id | Both `409 INVALID_OWNER` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | **Pass** |
| DET-04 | AC-15, BR-20 | `PATCH .../status` to `IN_PROGRESS` on an unassigned Ticket | `409 OWNER_REQUIRED`; status unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | **Pass** |
| DET-05 | AC-16, BR-19 | `PATCH .../status` to a status not reachable from the current one (e.g. `NEW` → `CLOSED` directly) | `409 INVALID_TRANSITION`; status unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | **Pass** |
| DET-06 | AC-17, BR-21 | `PATCH .../status` to `RESOLVED` with no `resolutionSummary`, and separately with one 2001 characters long | Both `400` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | **Pass** |
| DET-07 | AC-18, BR-22 | `PATCH .../owner`, `.../it-priority`, `.../status` on a `CLOSED` Ticket | All three `409 TICKET_CLOSED` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | **Pass** |
| DET-08 | BR-23 | Move a Ticket to `REOPENED` after the Requester had set `requesterResolvedAt` | `requesterResolvedAt` is cleared (`null`) in the response | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | **Pass** |
| DET-09 | FR-13 | `PATCH .../it-priority` to each of the 4 `Priority` values | `200`; value persists independently of `requestedPriority` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | **Pass** |

### Comments and Internal Notes

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| CMT-01 | AC-19, BR-04 | Requester posts a Public Comment; IT Staff then fetches the same Ticket's comments | IT Staff sees the comment with the correct `authorName`/`authorRole`/`createdAt` from the backend | `server/tests/lab-03/comments-notes.api.test.ts` | **Pass** |
| CMT-02 | AC-20, BR-04 | IT Staff posts an Internal Note; Requester then requests notes on their own ticket | Requester gets `403`, zero note content anywhere in the response | `server/tests/lab-03/comments-notes.api.test.ts` | **Pass** |
| CMT-03 | BR-36 (§11 Assumption) | Administrator reads notes (allowed), then attempts to `POST` a note | `GET` `200`; `POST` `403` | `server/tests/lab-03/comments-notes.api.test.ts` | **Pass** |
| CMT-04 | BR-25 | Post an empty (whitespace-only) comment, and separately a 2001-character comment | Both `400`, no row created | `server/tests/lab-03/comments-notes.api.test.ts` | **Pass** |
| CMT-05 | BR-26 | Post a comment body containing `<script>` and `<b>` tags | Stored and returned as literal text; UI test STY-04 confirms it never renders as markup | `server/tests/lab-03/comments-notes.api.test.ts` | **Pass** |
| CMT-06 | BR-27 | Post a comment supplying a spoofed `authorId` and `createdAt` in the body | Both ignored; author is the session user, `createdAt` is server time | `server/tests/lab-03/comments-notes.api.test.ts` | **Pass** |
| CMT-07 | AC-21, BR-05 | Requester calls `POST /api/tickets/:id/problem-resolved` on an Open Ticket | `200`; `requesterResolvedAt` set; `currentStatus` unchanged | `server/tests/lab-03/comments-notes.api.test.ts` | **Pass** |
| CMT-08 | AC-22 | Calling `problem-resolved` a second time on the same open period | `409 TICKET_NOT_ACTIVE` | `server/tests/lab-03/comments-notes.api.test.ts` | **Pass** |
| CMT-09 | BR-22 | Comment/Note/problem-resolved calls on a `CLOSED` Ticket | All rejected with `409` | `server/tests/lab-03/comments-notes.api.test.ts` | **Pass** |

### Administrator

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| ADM-01 | FR-17 | `GET /api/admin/users` with `search` and `role` combined | Only matching users returned | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| ADM-02 | AC-25, BR-33 | Create a user with an email that exists in a different case (`Aran@...` vs `aran@...`) | `409 EMAIL_TAKEN` | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| ADM-03 | BR-28 | Create a user with a policy-violating initial password, and separately an invalid role string | Both `400` | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| ADM-04 | BR-29 | Edit a user's name/email/role/active state, one field at a time and all together | `200`; only supplied fields change | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| ADM-05 | AC-27, BR-31 | Administrator attempts to deactivate their own account, and separately to change their own role | Both `409` (`CANNOT_DEACTIVATE_SELF` / `CANNOT_CHANGE_OWN_ROLE`); account unchanged | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| ADM-06 | AC-28, BR-32 | With exactly one active Administrator, attempt to deactivate them, then attempt to change their role, from a second admin session created for the test | Both `409 LAST_ACTIVE_ADMIN` | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| ADM-07 | AC-26, BR-30 | `POST .../initial-password`, then log in with the new password from a fresh client, then attempt to reuse the old session's cookie | New login succeeds with `mustChangePassword: true`; old session cookie now `401` | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| ADM-08 | AC-29 | IT Staff and Requester call every `/api/admin/*` endpoint | All `403` | `server/tests/lab-03/users-admin.api.test.ts` (also covered by SEC-04) | Planned |

### UI Component

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| UI-01 | AC-05 | Login form submitted, mocked `401 INVALID_CREDENTIALS` | Generic error message rendered; password field cleared | `client/tests/lab-03/Login.test.tsx` | **Pass** |
| UI-02 | AC-06, AC-07 | Login form, mocked `403 ACCOUNT_INACTIVE` and mocked `429 TOO_MANY_ATTEMPTS` | Each renders its own distinct message | `client/tests/lab-03/Login.test.tsx` | **Pass** |
| UI-03 | §3 (Submitting state) | Submit Login with a slow mocked response | Button shows busy state, fields become read-only | `client/tests/lab-03/Login.test.tsx` | **Pass** |
| UI-04 | BR-08 | Change Password form, typing progressively closer to a compliant password | Each policy-checklist row ticks independently as its own rule becomes true | `client/tests/lab-03/ChangePassword.test.tsx` | **Pass** |
| UI-05 | BR-09 | Change Password form, confirm field not matching new password | Save/Continue disabled; mismatch message shown | `client/tests/lab-03/ChangePassword.test.tsx` | **Pass** |
| UI-06 | AC-10 | Shell rendered with a mocked Requester `/me`, then a mocked IT Staff `/me`, then a mocked Administrator `/me` | Nav links and role badge differ correctly for each | `client/tests/lab-03/AppShellRoles.test.tsx` | **Pass** |
| UI-07 | AC-11 | Requester-role shell attempts to render the Queue route | Forbidden screen shown; no queue fetch made (asserted via the mock network call count) | `client/tests/lab-03/AppShellRoles.test.tsx` | **Pass** |
| UI-08 | AC-23 | Ticket Queue table, mocked multi-page result set, change a filter and the sort control | Refetch fires with the new query params; page resets to 1 | `client/tests/lab-03/StaffTicketQueue.test.tsx` | **Pass** |
| UI-09 | §7 (empty/no-results) | Queue mocked with 0 tickets ever, and separately 0 matches with a filter active | Distinct empty vs. no-results copy | `client/tests/lab-03/StaffTicketQueue.test.tsx` | **Pass** |
| UI-08b | §7 | Queue rows with an assigned owner, an unassigned Ticket, an inactive owner, and `requesterResolvedAt` set | Owner name / "Unassigned" / "(inactive)" render; both priority badges, status badge, an Open link to `/staff/tickets/:id`; the "Requester reports resolved" tag appears beside, not instead of, the status | `client/tests/lab-03/StaffTicketQueue.test.tsx` | **Pass** |
| UI-09b | §7 | Queue API failure then Retry; 403 from the API | Failure callout with Retry that recovers; forbidden message | `client/tests/lab-03/StaffTicketQueue.test.tsx` | **Pass** |
| UI-10 | AC-16 | Staff Ticket Detail's Status `<select>`, Ticket currently `RESOLVED` | Options list contains only `Closed` and `Reopened` | `client/tests/lab-03/StaffTicketDetail.test.tsx` | **Pass** |
| UI-11 | AC-17 | Submit Status change to Resolved with an empty Resolution Summary | Client-side validation blocks submission; no PATCH fired | `client/tests/lab-03/StaffTicketDetail.test.tsx` | **Pass** |
| UI-12 | BR-04 | Staff Ticket Detail with mocked comments and notes | Notes render inside the visually distinct panel (§8 of ui-spec.md); comments do not | `client/tests/lab-03/StaffTicketDetail.test.tsx` | **Pass** |
| UI-13 | AC-25 | Create User panel submitted, mocked `409 EMAIL_TAKEN` | Field-level message under Email | `client/tests/lab-03/UserManagement.test.tsx` | Planned |
| UI-14 | AC-27, AC-28 | Edit panel opened on the current user's own account, and separately on the only active Administrator | Active toggle and Role select disabled with the explanatory caption in both cases | `client/tests/lab-03/UserManagement.test.tsx` | Planned |
| UI-15 | AC-21 | Requester Ticket Detail, click "Problem Appears Resolved", confirm | Button replaced by the resolved indicator after the mocked success response | `client/tests/lab-03/RequesterComments.test.tsx` | **Pass** |
| UI-16 | AC-19 | Post a Public Comment from Requester Ticket Detail, mocked success | New comment appears at the end of the list with the current user's name | `client/tests/lab-03/RequesterComments.test.tsx` | **Pass** |

### UI Style

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| STY-01 | §1 of ui-spec.md | Internal Note panel vs. Public Comment panel, rendered together | Different background token/class; the note panel has the lock-icon `aria-label` | `client/tests/lab-03/lab3.style.test.tsx` | **Pass** |
| STY-02 | §1 of ui-spec.md | Role badge for each of the 3 roles | Correct token class per role, text label always present (never color-only) | `client/tests/lab-03/lab3.style.test.tsx` | **Pass** |
| STY-03 | §1 of ui-spec.md | Status badge for each of the 8 statuses | Distinct token class per status, all 8 render without a fallback/unstyled case | `client/tests/lab-03/lab3.style.test.tsx` | **Pass** |
| STY-04 | BR-26 | Comment body containing `<script>` rendered in the DOM | Appears as literal text (`textContent`), never parsed as an element | `client/tests/lab-03/RequesterComments.test.tsx` | **Pass** |

### Responsive

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| RESP-01 | AC-30 | Login + Change Password at 375/850/1280px | No horizontal scroll; screenshots saved to `authentication/` | `e2e/lab-03/responsive.spec.ts` | Planned |
| RESP-02 | AC-30 | Requester Ticket Detail (comments + resolved) at 3 widths | No horizontal scroll; screenshots saved to `requester/` | `e2e/lab-03/responsive.spec.ts` | Planned |
| RESP-03 | AC-30 | Ticket Queue (table → card collapse) at 3 widths | No horizontal scroll at any width, including the 9-column desktop table; screenshots to `staff-queue/` | `e2e/lab-03/responsive.spec.ts` | Planned |
| RESP-04 | AC-30 | Staff Ticket Detail (comments + notes tabs) at 3 widths | No horizontal scroll; screenshots to `staff-ticket-detail/` | `e2e/lab-03/responsive.spec.ts` | Planned |
| RESP-05 | AC-30 | User Management (list + panel collapse) at 3 widths | No horizontal scroll; screenshots to `user-management/` | `e2e/lab-03/responsive.spec.ts` | Planned |

### End-to-End

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| E2E-01 | AC-01, AC-02, AC-05–AC-10 | Full authentication flow: wrong login, inactive login, first-login change, shell identity, logout, direct-URL access after logout, Requester blocked from `/staff/queue` | Every step matches its AC; final direct-access attempt lands on Login, not the protected screen | `e2e/lab-03/authentication.spec.ts` | Planned |
| E2E-02 | AC-12–AC-21 | Requester creates a Ticket and comments → IT Staff finds it in the Queue, claims it, sets IT Priority, moves it to In Progress, posts a Public Comment and an Internal Note → Requester sees the comment but not the note → Requester marks it resolved → IT Staff resolves with a summary → closes with confirmation → a second IT Staff account reassigns before close | Each step's visible state (badges, comment list, resolved indicator) matches the API state | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| E2E-03 | AC-25–AC-29 | Admin lists/searches/filters users, creates one (then hits a duplicate-email error), edits one, resets an initial password and confirms forced change on next login, is blocked from self-deactivation and from removing the last Administrator, and Requester/IT Staff are blocked from `/admin/users` | Every step matches its AC | `e2e/lab-03/user-administration.spec.ts` | Planned |

## 3. Acceptance-Criterion Traceability

| AC | Covered by |
|---|---|
| AC-01 | API-01, E2E-01 |
| AC-02 | API-05, E2E-01 |
| AC-03 | SEC-01 |
| AC-04 | SEC-03, CMT-02 |
| AC-05 | API-02, UI-01, E2E-01 |
| AC-06 | API-03, UI-02, E2E-01 |
| AC-07 | API-04, UI-02, E2E-01 |
| AC-08 | API-09, E2E-01 |
| AC-09 | SEC-05, E2E-01 |
| AC-10 | UI-06, E2E-01 |
| AC-11 | SEC-02, UI-07, E2E-01 |
| AC-12 | QUE-05, E2E-02 |
| AC-13 | DET-01, E2E-02 |
| AC-14 | DET-02, E2E-02 |
| AC-15 | DET-04, E2E-02 |
| AC-16 | DET-05, UI-10 |
| AC-17 | DET-06, UI-11, E2E-02 |
| AC-18 | DET-07 |
| AC-19 | CMT-01, UI-16, E2E-02 |
| AC-20 | CMT-02, SEC-03, E2E-02 |
| AC-21 | CMT-07, UI-15, E2E-02 |
| AC-22 | CMT-08 |
| AC-23 | QUE-01, UI-08 |
| AC-24 | QUE-02 |
| AC-25 | ADM-02, UI-13, E2E-03 |
| AC-26 | ADM-07, E2E-03 |
| AC-27 | ADM-05, UI-14, E2E-03 |
| AC-28 | ADM-06, UI-14, E2E-03 |
| AC-29 | SEC-04, ADM-08, E2E-03 |
| AC-30 | RESP-01, RESP-02, RESP-03, RESP-04, RESP-05 |

## 4. Responsive and Visual Checklist

To be completed in PR 7 (#68) once `e2e/lab-03/responsive.spec.ts` produces the screenshots listed in
`ui-spec.md` §14. The checklist itself lives in `ui-spec.md` §13 and will be checked off there against
real screenshots, not assumed from a passing test suite (Kickoff Guide rule 4).

## 5. Test Commands

```bash
# unit + API + authorization + migration (Vitest + Supertest, uses server/.env.test)
cd server && npm test

# UI component + UI style (Vitest + React Testing Library)
cd client && npm test

# responsive + E2E (Playwright, run from repo root, needs both dev servers running
# or the configured webServer in playwright.config.ts)
npx playwright test
```

## 6. Final Results

To be filled in PR 7 (#68) with real counts from `lab3-staging`, then re-confirmed identical once released
to `main`, per the Kickoff Guide release checklist. Placeholder until then:

```
server:     Test Files  ?? passed   Tests  ?? passed
client:     Test Files  ?? passed   Tests  ?? passed
playwright:             ?? passed
```

## 7. Known Limitations or Deferred Tests

- The login throttle (BR-06) is exercised in-process against a single server instance; it does not model
  a multi-instance deployment sharing the throttle state, which is out of scope for a course lab.
- Session expiry (BR-11, 8 hours) is unit-level only over the stored `expiresAt` comparison; no test waits
  8 real hours for an integration-level expiry check.
- As in Lab 2, accessibility testing is limited to programmatic assertions (labels, `aria-*`, keyboard
  operability); a full screen-reader pass is out of scope.
