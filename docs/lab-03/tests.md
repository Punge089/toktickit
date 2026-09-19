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
| API-11 | BR-11 | Log in and inspect the session cookie; push the user's sessions past `expiresAt`; call `/api/auth/me`; log in again | Cookie is `HttpOnly`, `SameSite=Lax`, `Path=/` with `Max-Age` of about 8 hours; the expired session gets `401 UNAUTHENTICATED`; a new login works | `server/tests/lab-03/auth.api.test.ts` | **Pass** |

### Security / Authorization

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| SEC-01 | AC-03, BR-03 | Requester sends another user's id as `requesterId` in the body, in the query string, and on the legacy `X-Dev-Requester-Id` header while creating/listing tickets | All three ignored; only the authenticated user's own data is returned/created | `server/tests/lab-03/authorization.api.test.ts` | **Pass** |
| SEC-02 | AC-11 | Requester calls `GET /api/staff/tickets` and `GET /api/staff/tickets/:id` directly | Both `403 FORBIDDEN`, no ticket data in the body | `server/tests/lab-03/comments-notes.api.test.ts`, `server/tests/lab-03/staff-queue.api.test.ts` | **Pass** |
| SEC-03 | AC-04, AC-20 | Requester calls `GET`/`POST /api/staff/tickets/:id/notes` on their own ticket | Both `403`, no note content anywhere in the response | `server/tests/lab-03/comments-notes.api.test.ts` | **Pass** |
| SEC-04 | AC-29 | IT Staff and Requester each call every `/api/admin/*` endpoint (list, create, edit, initial password); an unauthenticated caller does the same; an Administrator who still must change their initial password calls the list | IT Staff and Requester: identical `403 FORBIDDEN` body with no user data on all four; no session: `401 UNAUTHENTICATED` on all four; the unchanged-password Administrator gets `403 PASSWORD_CHANGE_REQUIRED` | `server/tests/lab-03/authorization.api.test.ts` | **Pass** |
| SEC-05 | BR-36 | Every Requester-scoped endpoint plus `/api/auth/me` is called once unauthenticated | All return `401` | `server/tests/lab-03/authorization.api.test.ts` | **Pass** |
| SEC-06 | BR-13 | State-changing request with a mismatched `Origin` header vs. one with none vs. the correct one | Mismatched `Origin` → `403 ORIGIN_NOT_ALLOWED`; missing or matching `Origin` → normal handling | `server/tests/lab-03/authorization.api.test.ts` | **Pass** |
| SEC-07 | BR-39 | `GET /api/dev-requesters` | `404` — route no longer exists | `server/tests/lab-02/reference.api.test.ts` | **Pass** |
| SEC-08 | BR-36 | IT Staff attempts to write a Comment/Note/status change on a Ticket that belongs to a Requester, called with a Requester B's ticket id that does exist | Confirms `404` is used only for true nonexistence at Requester routes, and staff routes never 404 solely due to ownership | `server/tests/lab-03/comments-notes.api.test.ts` | **Pass** |

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
| REG-05 | BR-38 | `client/tests/lab-02/RequesterSelect.test.tsx`, repurposed, plus `zen-green.style.test.tsx`, `CreateTicket.test.tsx`, `MyTickets.test.tsx`, `RequesterTicketDetail.test.tsx`, `AttachmentSection.test.tsx` adapted to the session-cookie identity | Asserts `/select-requester` no longer exists (the catch-all Not Found screen renders) and that a guarded route without a session redirects to `/login`; every other Lab 2 client test's original assertions still pass under `AuthContext` | `client/tests/lab-02/*.test.tsx` | **Pass** |
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
| CMT-10 | BR-24 | `PATCH`, `PUT` and `DELETE` on an existing Comment and on an existing Note | All `404` (no such route); the Comment and the Note are unchanged | `server/tests/lab-03/comments-notes.api.test.ts` | **Pass** |

### Administrator

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| ADM-01 | FR-17 | `GET /api/admin/users` with `search` and `role` combined; search by email; name ordering; the active-Administrator count with a filter that matches nobody; an invalid `role` and an over-long `search` | Only matching users returned (case-insensitive, name or email); `fullName` order; `activeAdministratorCount` counted over all users; no `passwordHash`; invalid values `400 INVALID_QUERY` with the field named | `server/tests/lab-03/users-admin.api.test.ts` | **Pass** |
| ADM-02 | AC-25, BR-33 | Create a user with an email that exists in a different case (`Aran@...` vs `aran@...`); edit a user's email to one another user has, in any case; re-send a user's own email | Create and edit: `409 EMAIL_TAKEN`, nothing created or changed; re-sending one's own email is accepted | `server/tests/lab-03/users-admin.api.test.ts` | **Pass** |
| ADM-03 | BR-28 | Create a user with a policy-violating initial password, with an invalid role string, with a two-element role array, and with an empty body / malformed email / over-long name / non-boolean `isActive`; create a valid user and an inactive one | Invalid input: `400` naming each field in `fieldErrors`; valid: `201`, email stored lowercased, `mustChangePassword` true, hash is not the plaintext, first login returns `mustChangePassword: true`; the inactive user gets `403 ACCOUNT_INACTIVE` | `server/tests/lab-03/users-admin.api.test.ts` | **Pass** |
| ADM-04 | BR-29 | Edit a user's name/email/role/active state, one field at a time and all together; an empty edit, an invalid role, a bad email, an unknown id | `200`; only supplied fields change; invalid input `400`; unknown id `404 USER_NOT_FOUND` | `server/tests/lab-03/users-admin.api.test.ts` | **Pass** |
| ADM-05 | AC-27, BR-31 | Administrator attempts to deactivate their own account, and separately to change their own role; separately re-sends their own role and active state unchanged while renaming themselves | Deactivate and role change `409` (`CANNOT_DEACTIVATE_SELF` / `CANNOT_CHANGE_OWN_ROLE`), account and session unchanged; the unchanged re-send is `200` | `server/tests/lab-03/users-admin.api.test.ts` | **Pass** |
| ADM-06 | AC-28, BR-32 | Two Administrators (every other Administrator taken out of play for the test, then restored) deactivate each other in the same instant, then demote each other in the same instant; and one deactivates the other when the caller stays active, after which the survivor tries to deactivate themselves | Each race: exactly one `200` and one `409 LAST_ACTIVE_ADMIN`, and one active Administrator remains; the non-racing case is `200` and the survivor then hears `CANNOT_DEACTIVATE_SELF`. Removing the row lock makes both race tests fail | `server/tests/lab-03/users-admin.api.test.ts` | **Pass** |
| ADM-07 | AC-26, BR-30, BR-35 | `POST .../initial-password`, then log in with the new password from a fresh client, then attempt to reuse the old session's cookie; a policy-violating or missing password; an unknown user; a legacy user with no password hash; deactivating a user whose session is open | New login succeeds with `mustChangePassword: true` and every other endpoint is `403 PASSWORD_CHANGE_REQUIRED`; old session cookie and old password rejected; a rejected password changes nothing and the sessions survive; the legacy user can log in with the new password; deactivation deletes the sessions and login then gives `403 ACCOUNT_INACTIVE` until reactivated | `server/tests/lab-03/users-admin.api.test.ts` | **Pass** |
| ADM-08 | AC-29 | IT Staff and Requester call every `/api/admin/*` endpoint, including a create and an edit that would succeed for an Administrator | All `403 FORBIDDEN`; no user created or changed; the target's email never appears in a response | `server/tests/lab-03/users-admin.api.test.ts` (also covered by SEC-04) | **Pass** |
| ADM-09 | BR-34 | Administrator calls `DELETE /api/admin/users/:id` | `404` (no such route); the user still exists | `server/tests/lab-03/users-admin.api.test.ts` | **Pass** |

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
| UI-13 | AC-25 | Create User panel submitted, mocked `409 EMAIL_TAKEN` | Message under the Email field (linked with `aria-describedby`, field `aria-invalid`), panel stays open, no success toast | `client/tests/lab-03/UserManagement.test.tsx` | **Pass** |
| UI-14 | AC-27, AC-28 | Edit panel opened on the current user's own account (another active Administrator exists); on the current user's own account when they are the only active Administrator; on a different Administrator that the list reports as the only active one (`activeAdministratorCount: 1`); and on an inactive Administrator | Role select and Active switch disabled with the matching caption(s): only the self caption in the first case, both captions in the second, only "At least one active Administrator must remain." in the third; enabled with no caption for the inactive one | `client/tests/lab-03/UserManagement.test.tsx` | **Pass** |
| UI-15 | AC-21 | Requester Ticket Detail, click "Problem Appears Resolved", confirm | Button replaced by the resolved indicator after the mocked success response | `client/tests/lab-03/RequesterComments.test.tsx` | **Pass** |
| UI-16 | AC-19 | Post a Public Comment from Requester Ticket Detail, mocked success | New comment appears at the end of the list with the current user's name | `client/tests/lab-03/RequesterComments.test.tsx` | **Pass** |
| UI-17 | FR-17 | User Management list with four mocked users | Columns Name, Email, Role, Status, Action; role and Active/Inactive badges with text; an Edit button per row; no pager | `client/tests/lab-03/UserManagement.test.tsx` | **Pass** |
| UI-18 | FR-17, ui-spec §9 (empty/no-results/failure) | Change the role filter and type a search; a search with no matches; an empty user table; a failed load then Retry; a `403` | Refetch carries `search` and `role`; no-results copy with Clear filters, which restores the list; distinct empty copy; failure callout with Retry that recovers; forbidden message | `client/tests/lab-03/UserManagement.test.tsx` | **Pass** |
| UI-19 | AC-25, BR-28 | Fill and save the Create User panel; save an empty form; save a bad email and a password missing a rule | POST body is exactly the trimmed form; panel closes, list refetches, "User saved." shown; invalid forms show field-level messages and make no request | `client/tests/lab-03/UserManagement.test.tsx` | **Pass** |
| UI-20 | BR-29 | Edit a user's role and active state; press Save with no changes | PATCH body contains only `role` and `isActive`; no request and "No changes to save." when nothing changed; edit mode has no password field until the disclosure is opened | `client/tests/lab-03/UserManagement.test.tsx` | **Pass** |
| UI-21 | AC-26, BR-30 | Open "Set new initial password" in edit mode | Collapsed by default (`aria-expanded`); "Set password" stays disabled until every policy rule is met; then POSTs `initialPassword`, confirms the user must change it at next login, clears the field, keeps the panel open | `client/tests/lab-03/UserManagement.test.tsx` | **Pass** |
| UI-22 | BR-31, BR-32, ui-spec §9 (safe failure) | Save with a mocked `409 LAST_ACTIVE_ADMIN`; save with a mocked `500` | The refusal is an alert at the top of the panel and no field is marked invalid; the `500` shows a safe message and keeps what was typed | `client/tests/lab-03/UserManagement.test.tsx` | **Pass** |
| UI-23 | AC-02, AC-10 | Shell rendered for a Requester whose `mustChangePassword` is true, on `/change-password` | No navigation landmark and no menu button (nothing to bounce to); the user's name and the way out remain | `client/tests/lab-03/AppShellRoles.test.tsx` | **Pass** |

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
| RESP-01 | AC-30 | Login initial, invalid, inactive and busy states, and Change Password with the checklist part-way met, at 375/850/1280px | No horizontal scroll at any width (asserted before every screenshot); 15 screenshots saved to `authentication/` | `e2e/lab-03/responsive.spec.ts` | **Pass** |
| RESP-02 | AC-30 | Requester My Tickets, Ticket Detail of a new ticket, a ticket with a Public Comment thread, and a resolved ticket with the Requester's own indicator, at 3 widths; at 375px the menu button must be white on the header | No horizontal scroll; Internal Notes never appear on the Requester screens; 12 screenshots saved to `requester/` | `e2e/lab-03/responsive.spec.ts` | **Pass** |
| RESP-03 | AC-30 | Ticket Queue loaded (table at 1280px, cards at 850 and 375px), empty and failure (API responses mocked), real no-results, and a Requester denied at the URL, at 3 widths | No horizontal scroll at any width, including the 10-column desktop table; 15 screenshots saved to `staff-queue/` | `e2e/lab-03/responsive.spec.ts` | **Pass** |
| RESP-04 | AC-30 | Staff Ticket Detail with Public Comments, Internal Notes, Attachments, the missing-Resolution-Summary validation, a resolved ticket, and the read-only Administrator view, at 3 widths | No horizontal scroll; 18 screenshots saved to `staff-ticket-detail/` | `e2e/lab-03/responsive.spec.ts` | **Pass** |
| RESP-05 | AC-30 | User Management list, create panel, field validation, duplicate-email conflict, edit panel with the set-new-initial-password section, own-account edit, and an IT Staff member denied at the URL, at 3 widths | No horizontal scroll (list table with the panel open, single-pane below 992px); 21 screenshots saved to `user-management/` | `e2e/lab-03/responsive.spec.ts` | **Pass** |
| RESP-06 | ui-spec §13 (focus) | Keyboard focus on the Login field and button, shell nav link and identity button, Queue search, filter, row and pager, Staff Detail tab and select, and the User Management button, panel field, Active switch and Cancel | Every control reports a visible outline (computed style); 5 screenshots saved to `focus/` for judging colour and contrast by eye | `e2e/lab-03/responsive.spec.ts` | **Pass** |

### End-to-End

| Test ID | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|
| E2E-01 | AC-01, AC-02, AC-05–AC-11 | 8 tests: wrong password and unknown email give one safe message and clear the password; inactive account; busy state; first login held on Change Password (URL bounce and `403 PASSWORD_CHANGE_REQUIRED`, weak and mismatched and wrong-current password, then a valid change); shell identity and Log Out with Back, typed URLs and direct API calls all refused afterwards; role home and navigation for each role; each role denied the others' URLs and APIs; the removed selector route | Every step matches its AC; the final direct-access attempts land on Login or `401`, never on the protected screen | `e2e/lab-03/authentication.spec.ts` | **Pass** |
| E2E-02 | AC-12–AC-22 | 4 tests. (1) Requester creates a ticket and comments; IT Staff finds it in the Queue, claims it, sets IT Priority, moves it to In Progress, posts a Public Comment and an Internal Note; the Requester sees the comment but not the note (and `403` from the notes API); the Requester marks it resolved; IT Staff sees the indicator, needs a Resolution Summary, resolves it; a second IT Staff member reassigns it and closes it with a confirmation; the Requester sees the outcome. (2) The Status control offers only the matrix's transitions and an unowned ticket is refused In Progress. (3) Attachment continuity: IT Staff list and download a Requester's attachment but cannot add or remove one (UI and API). (4) Direct API calls by each role against Internal Notes, the Queue and the ticket operations | Each step's visible state matches the API state; every `403`/`401`/`404` is the one the authorization matrix gives | `e2e/lab-03/staff-ticket-flow.spec.ts` | **Pass** |
| E2E-03 | AC-25–AC-29 | 6 tests: list, search and role filter (no pager); create with empty/weak input, a duplicate email in different case, then a valid user who is held on Change Password at first login; edit name/role/active and deactivation ending the session; set a new initial password (old session dead, next login forced to change); self-deactivate and self-demote blocked on the screen and by the API, including with a second Administrator; Requester and IT Staff denied the screen and all four APIs | Every step matches its AC | `e2e/lab-03/user-administration.spec.ts` | **Pass** |

## 3. Acceptance-Criterion Traceability

| AC | Covered by |
|---|---|
| AC-01 | API-01, E2E-01 |
| AC-02 | API-05, UI-23, E2E-01 |
| AC-03 | SEC-01 |
| AC-04 | SEC-03, CMT-02 |
| AC-05 | API-02, UI-01, E2E-01 |
| AC-06 | API-03, UI-02, E2E-01 |
| AC-07 | API-04, UI-02, E2E-01 |
| AC-08 | API-09, E2E-01 |
| AC-09 | SEC-05, E2E-01 |
| AC-10 | UI-06, UI-23, E2E-01 |
| AC-11 | SEC-02, UI-07, E2E-01 |
| AC-12 | QUE-05, E2E-02 |
| AC-13 | DET-01, E2E-02 |
| AC-14 | DET-02, E2E-02 |
| AC-15 | DET-04, E2E-02 |
| AC-16 | DET-05, UI-10 |
| AC-17 | DET-06, UI-11, E2E-02 |
| AC-18 | DET-07, E2E-02 |
| AC-19 | CMT-01, UI-16, E2E-02 |
| AC-20 | CMT-02, SEC-03, E2E-02 |
| AC-21 | CMT-07, UI-15, E2E-02 |
| AC-22 | CMT-08 |
| AC-23 | QUE-01, UI-08 |
| AC-24 | QUE-02 |
| AC-25 | ADM-02, ADM-03, UI-13, UI-19, E2E-03 |
| AC-26 | ADM-07, UI-21, E2E-03 |
| AC-27 | ADM-05, UI-14, E2E-03 |
| AC-28 | ADM-05, ADM-06, UI-14, E2E-03 |
| AC-29 | SEC-04, ADM-08, E2E-03 |
| AC-30 | RESP-01, RESP-02, RESP-03, RESP-04, RESP-05, RESP-06 |

### Functional requirements and business rules

Every FR and BR in `specification.md` maps to at least one row above. (AC traceability is the table
before this one.)

| FR | Covered by |
|---|---|
| FR-01 | API-01, API-02, API-03, UI-01, E2E-01 |
| FR-02 | API-05, API-06, API-07, UI-04, UI-05, UI-23, E2E-01 |
| FR-03 | API-09, E2E-01 |
| FR-04 | API-01, API-10, UI-06 |
| FR-05 | UI-06, UI-07, UI-23, E2E-01 |
| FR-06 | REG-01, REG-02, REG-05, REG-06, SEC-01 |
| FR-07 | REG-03, REG-04, REG-05, REG-06, E2E-02 |
| FR-08 | CMT-01, UI-16, E2E-02 |
| FR-09 | CMT-07, CMT-08, UI-15, E2E-02 |
| FR-10 | QUE-01 to QUE-06, UI-08, UI-08b, UI-09, UI-09b |
| FR-11 | DET-01 to DET-09, UI-10, UI-11, UI-12, E2E-02 |
| FR-12 | DET-01, DET-02, DET-03, E2E-02 |
| FR-13 | DET-09, QUE-05, E2E-02 |
| FR-14 | UNIT-03, DET-04 to DET-08, UI-10, UI-11, E2E-02 |
| FR-15 | CMT-01, CMT-02, CMT-04, CMT-05, CMT-06, UI-12, E2E-02 |
| FR-16 | QUE-06, CMT-03, E2E-02 |
| FR-17 | ADM-01, UI-17, UI-18, E2E-03 |
| FR-18 | ADM-02, ADM-03, UI-13, UI-19, E2E-03 |
| FR-19 | ADM-04, UI-20, E2E-03 |
| FR-20 | ADM-07, UI-21, E2E-03 |
| FR-21 | ADM-05, ADM-06, UI-14, E2E-03 |
| FR-22 | MIG-01, MIG-02, MIG-03, MIG-04 |
| FR-23 | UI-01, UI-02, UI-03, UI-09, UI-09b, UI-18, UI-22, RESP-01 to RESP-05, E2E-01 |
| FR-24 | STY-01, STY-02, STY-03, RESP-01 to RESP-06, UI-23 |

| BR | Covered by |
|---|---|
| BR-01 | API-01, API-02, API-03 |
| BR-02 | API-05, API-07, UI-23, E2E-01 |
| BR-03 | SEC-01, REG-01 |
| BR-04 | CMT-01, CMT-02, CMT-03, SEC-03, E2E-02 |
| BR-05 | CMT-07, E2E-02 |
| BR-06 | API-04 |
| BR-07 | UNIT-02, ADM-03 |
| BR-08 | UNIT-01, API-06, ADM-03, UI-04, UI-19 |
| BR-09 | UNIT-02, API-06, UI-05 |
| BR-10 | API-09, E2E-01 |
| BR-11 | API-11 |
| BR-12 | API-02, API-03, UI-02, E2E-01 |
| BR-13 | SEC-06 |
| BR-14 | API-01, API-10 |
| BR-15 | REG-02, REG-03, REG-04, E2E-02 |
| BR-16 | ADM-03, ADM-04 |
| BR-17 | DET-03, QUE-06 |
| BR-18 | QUE-05, DET-09, E2E-02 |
| BR-19 | UNIT-03, DET-05, UI-10, E2E-02 |
| BR-20 | DET-04, E2E-02 |
| BR-21 | DET-06, UI-11, E2E-02 |
| BR-22 | DET-07, CMT-09, E2E-02 |
| BR-23 | DET-08 |
| BR-24 | CMT-10 |
| BR-25 | CMT-04 |
| BR-26 | CMT-05, STY-04 |
| BR-27 | CMT-06 |
| BR-28 | ADM-03, UI-19 |
| BR-29 | ADM-04, UI-20 |
| BR-30 | ADM-07, UI-21, E2E-03 |
| BR-31 | ADM-05, UI-14, E2E-03 |
| BR-32 | ADM-06, UI-14 |
| BR-33 | ADM-02 |
| BR-34 | ADM-09 |
| BR-35 | ADM-07, E2E-03 |
| BR-36 | CMT-03, QUE-06, E2E-02 |
| BR-37 | SEC-02, SEC-04, SEC-05, E2E-01, E2E-02 |
| BR-38 | REG-01 to REG-06 |
| BR-39 | SEC-01, SEC-07, REG-05, E2E-01 |

## 4. Responsive and Visual Checklist

Completed in `ui-spec.md` §13, item by item, against the screenshots in
`artifacts/lab-03/screenshots/` (86 images: 81 screen states at desktop, tablet and mobile, plus 5 keyboard-focus
captures). Each screenshot was viewed and compared with `ui-spec.md`; the defects that viewing found are listed
in `ui-spec.md` §13 together with their fixes and the tests that now guard them.

## 5. Test Commands

```bash
# unit + API + authorization + migration (Vitest + Supertest, uses server/.env.test)
cd server && npm test

# UI component + UI style (Vitest + React Testing Library)
cd client && npm test

# responsive + E2E (Playwright, run from repo root; playwright.config.ts starts both dev servers,
# runs one worker, removes leftover e2e.* users and re-seeds the dev database first)
npx playwright test
npx playwright test e2e/lab-03      # Lab 3 only (100 tests); writes artifacts/lab-03/screenshots
```

## 6. Final Results

Run on 2026-09-19 from the PR #68 branch (`feature/68-e2e-evidence`, which is `lab3-staging` plus this PR; the
release PR adds nothing else), with the commands in section 5, after `tsc --noEmit` passed in `server/` and
`client/`. Output below is copied from those runs (file order sorted, timings omitted). The same commands are
re-run on `lab3-staging` after this PR merges and on `main` after the release, and the numbers must match.

```
server (cd server && npm test)
 ✓ tests/lab-01/categories.test.ts (1 tests)
 ✓ tests/lab-01/health.test.ts (1 tests)
 ✓ tests/lab-02/attachment-rules.unit.test.ts (6 tests)
 ✓ tests/lab-02/attachments.api.test.ts (7 tests)
 ✓ tests/lab-02/create-ticket.api.test.ts (8 tests)
 ✓ tests/lab-02/my-tickets.api.test.ts (11 tests)
 ✓ tests/lab-02/reference.api.test.ts (6 tests)
 ✓ tests/lab-02/seed.unit.test.ts (4 tests)
 ✓ tests/lab-02/ticket-detail.api.test.ts (5 tests)
 ✓ tests/lab-02/ticket-number.unit.test.ts (2 tests)
 ✓ tests/lab-03/auth.api.test.ts (13 tests)
 ✓ tests/lab-03/authorization.api.test.ts (12 tests)
 ✓ tests/lab-03/comments-notes.api.test.ts (15 tests)
 ✓ tests/lab-03/migration.test.ts (5 tests)
 ✓ tests/lab-03/password.unit.test.ts (5 tests)
 ✓ tests/lab-03/seed.lab3.test.ts (6 tests)
 ✓ tests/lab-03/staff-queue.api.test.ts (23 tests)
 ✓ tests/lab-03/staff-ticket-detail.api.test.ts (13 tests)
 ✓ tests/lab-03/transitions.unit.test.ts (5 tests)
 ✓ tests/lab-03/users-admin.api.test.ts (23 tests)

 Test Files  20 passed (20)
      Tests  171 passed (171)

client (cd client && npm test)
 ✓ tests/lab-01/App.test.tsx (3 tests)
 ✓ tests/lab-02/AttachmentSection.test.tsx (5 tests)
 ✓ tests/lab-02/CreateTicket.test.tsx (5 tests)
 ✓ tests/lab-02/MyTickets.test.tsx (6 tests)
 ✓ tests/lab-02/RequesterSelect.test.tsx (4 tests)
 ✓ tests/lab-02/RequesterTicketDetail.test.tsx (3 tests)
 ✓ tests/lab-02/zen-green.style.test.tsx (6 tests)
 ✓ tests/lab-03/AppShellRoles.test.tsx (7 tests)
 ✓ tests/lab-03/ChangePassword.test.tsx (5 tests)
 ✓ tests/lab-03/Login.test.tsx (6 tests)
 ✓ tests/lab-03/RequesterComments.test.tsx (7 tests)
 ✓ tests/lab-03/StaffTicketDetail.test.tsx (13 tests)
 ✓ tests/lab-03/StaffTicketQueue.test.tsx (8 tests)
 ✓ tests/lab-03/UserManagement.test.tsx (14 tests)
 ✓ tests/lab-03/lab3.style.test.tsx (3 tests)

 Test Files  15 passed (15)
      Tests  95 passed (95)

playwright (npx playwright test)
 e2e/lab-02/requester-ticket-flow.spec.ts: 1 passed
 e2e/lab-02/responsive.spec.ts: 27 passed
 e2e/lab-03/authentication.spec.ts: 8 passed
 e2e/lab-03/responsive.spec.ts: 82 passed
 e2e/lab-03/staff-ticket-flow.spec.ts: 4 passed
 e2e/lab-03/user-administration.spec.ts: 6 passed

 128 passed
```

| Suite | Files | Tests |
|---|---|---|
| Server: unit, API, authorization, migration, regression | 20 | 171 |
| Client: UI component, UI style, regression | 15 | 95 |
| Playwright: E2E and responsive (28 Lab 2 + 100 Lab 3) | 6 | 128 |
| **Total** | **41** | **394** |

Test counts in this file, `README.md` and the submission report must all equal the table above.

## 7. Known Limitations or Deferred Tests

- The login throttle (BR-06) is exercised in-process against a single server instance; it does not model
  a multi-instance deployment sharing the throttle state, which is out of scope for a course lab.
- Session expiry (BR-11, 8 hours) is tested by moving the stored `expiresAt` into the past (API-11) and by
  checking the cookie's `Max-Age`; no test waits 8 real hours.
- LAST_ACTIVE_ADMIN (BR-32) is reachable through the API only when two Administrators act on each other at
  the same moment (the caller is always an active Administrator, so a single one is stopped by the self rule
  first). ADM-06 therefore fires two simultaneous requests; the E2E test shows the sole seeded Administrator
  cannot deactivate or demote themselves, on the screen and by the API.
- The Queue "empty" and "failure" screenshots use mocked API responses (the seeded database always has
  Tickets, and a real 500 cannot be triggered on demand); every other screenshot is the real application
  against the real API.
- The E2E and screenshot runs use the development database, not the test database: they log in through the
  real screens with the documented seed accounts. `e2e/global-setup.ts` removes the throwaway `e2e.*` users
  and re-seeds before each run.
- As in Lab 2, accessibility testing is limited to programmatic assertions (labels, `aria-*`, keyboard
  operability); a full screen-reader pass is out of scope.
