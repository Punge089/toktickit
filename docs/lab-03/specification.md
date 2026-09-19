# Lab 3 Sprint Engineering Specification

**Author:** Bannasorn Thongkorn — 67070503420 — GitHub: @Punge089
**Course:** CPE 334, Semester 1/2026

## 1. Sprint Goal

By the end of Sprint 3, TokTickIT replaces the temporary Development Requester selector with real
authentication and server-enforced, role-based authorization for three roles — Requester, IT Staff, and
Administrator. A Requester keeps every Lab 2 ticket function under their authenticated identity and gains
Public Comments and a "Problem Appears Resolved" indicator. IT Staff gain a shared Ticket Queue and an
operational Ticket Detail screen to claim/reassign ownership, set IT Priority, move a Ticket through an
approved status workflow, and separate public communication (Comments) from private operational notes
(Internal Notes). An Administrator gets a minimalist User Management screen to create, edit, activate or
deactivate, and reset the initial password of user accounts. Every existing Lab 2 Ticket and Attachment
keeps its correct owner across the migration.

## 2. Stakeholder Request Interpretation

The Development Requester selector was a Lab 2 testing shortcut; the system now needs real users who log
in with an email and password, and whose role — not a hidden UI control — determines what they can see
and do. Requesters keep using the ticket functions built in Lab 2, but their identity now comes from an
authenticated session instead of a dropdown. IT Staff need a professional queue to find and prioritize
work, claim or hand off a Ticket, and communicate with the Requester through Public Comments while
keeping private Internal Notes separate. IT Staff remain the only role that formally resolves or closes a
Ticket; a Requester can only flag that the problem appears resolved. Administrators get a deliberately
small screen for the account-management work every course-lab system needs (create a user, fix a typo in
their email, deactivate someone who left, reset a forgotten password) — nothing more. Every protected
screen and API call must check role and, where relevant, ownership on the backend; a button that is merely
hidden or disabled in the UI is not authorization.

## 3. Scope

### Included
- Login with email/password, mandatory first-login password change, logout, and current-user retrieval.
- Server-side session (httpOnly cookie), password hashing, and role-based access control for every
  protected endpoint and screen.
- Migration of the Lab 2 `RequesterUser` model into a `User` model with roles, credentials, and
  activation state, preserving every existing Ticket's and Attachment's ownership.
- Continued Requester ownership of every Lab 2 ticket/attachment function, now scoped to the
  authenticated session instead of `X-Dev-Requester-Id`.
- Requester Public Comments and the "Problem Appears Resolved" action.
- IT Staff Ticket Queue: search, filter, sort, pagination, ownership and status visibility.
- IT Staff Ticket Detail: claim/reassign ownership, IT Priority, permitted status transitions, Public
  Comments, Internal Notes, existing Attachments.
- Minimalist Administrator User Management: list, search, optional role filter, create, edit, activate/
  deactivate, and reset-initial-password, with the mandated safety rules (no self-deactivation, no last
  active Administrator removal).
- Zen Green UI extensions reusing Lab 2 tokens and components; responsive behavior at desktop, tablet,
  and mobile for every new and existing screen.

### Excluded (labsheet §4.2)
- Email invitations, password-reset email, multi-factor authentication, social login, single sign-on,
  and account unlocking/administrator-approval workflows.
- Self-registration and Requester-created accounts.
- Actions Taken by IT Staff (deferred to Lab 4).
- Formal SLA calculation, escalation rules, and notification services.
- Dashboards and KPI analytics beyond the simple queue counts already visible in the list itself.
- Multi-tenant organizations, departments, and customer administration.
- Multiple roles assigned to one user.
- User deletion, bulk user operations, import/export, and account-history screens.
- Department, organization, profile-photo, and other extended user-profile management.
- Email delivery of initial passwords or reset links.
- Mandatory pagination, multi-column sorting, or multiple simultaneous filters on the user list.
- Editing or deleting a Public Comment or Internal Note once posted (append-only in Lab 3).

## 4. Functional Requirements

- **FR-01** The system authenticates a user by email and password and, on success, establishes a
  server-side session identified by an httpOnly cookie.
- **FR-02** The system requires a user whose account is marked as needing a password change to submit a
  new valid password before any other screen or protected endpoint becomes reachable.
- **FR-03** The system provides a Logout action that invalidates the current session on the server, not
  only on the client.
- **FR-04** The system provides `GET /api/auth/me`, returning the authenticated user's id, full name,
  email, role, and password-change requirement, and `401` when there is no valid session.
- **FR-05** The system shows each authenticated user only the navigation destinations permitted for their
  role, and independently enforces the same restriction on the backend for every corresponding endpoint.
- **FR-06** The system lets a Requester create, list, search, filter, sort, and paginate their own Tickets
  using their authenticated identity, ignoring any Requester id supplied by the client.
- **FR-07** The system lets a Requester view Ticket Detail and manage Attachments (add, download,
  soft-remove) only for Tickets they own, identically to Lab 2 except for the identity source.
- **FR-08** The system lets a Requester post a Public Comment on their own Ticket.
- **FR-09** The system lets a Requester indicate that a problem appears resolved, without changing the
  Ticket's formal status, and prevents indicating it twice on the same open period.
- **FR-10** The system provides IT Staff a Ticket Queue covering every Ticket, with search, filters,
  sorting, and pagination.
- **FR-11** The system lets IT Staff open a Ticket Detail screen for any Ticket, showing ownership, IT
  Priority, status, Public Comments, Internal Notes, and existing Attachments.
- **FR-12** The system lets IT Staff claim an unassigned Ticket or reassign an assigned one to another
  active IT Staff user.
- **FR-13** The system lets IT Staff set or change a Ticket's IT Priority independently of Requested
  Priority.
- **FR-14** The system lets IT Staff move a Ticket's status only along the approved transition matrix
  (§5), requiring an owner before active work begins and a Resolution Summary before Resolved.
- **FR-15** The system lets IT Staff post Public Comments and Internal Notes on any Ticket; Internal
  Notes are never returned to a Requester.
- **FR-16** The system lets an Administrator view the Ticket Queue, Ticket Detail, Public Comments, and
  Internal Notes read-only, without ownership, priority, status, comment, or note-writing access.
- **FR-17** The system lets an Administrator view a list of Users with search by name or email and an
  optional role filter.
- **FR-18** The system lets an Administrator create a user with a full name, a unique email, exactly one
  role, an activation state, and an initial password.
- **FR-19** The system lets an Administrator edit a user's full name, email, role, and activation state.
- **FR-20** The system lets an Administrator set a new initial password for any user, forcing that user to
  change it at their next login and revoking that user's existing sessions.
- **FR-21** The system prevents an Administrator from deactivating or changing the role of their own
  account, and prevents any edit that would leave zero active Administrators.
- **FR-22** The system migrates every existing Lab 2 `RequesterUser` into the `User` model, preserving
  Ticket and Attachment ownership, and removes the Development Requester selector, its stored client
  state, and the `X-Dev-Requester-Id` header entirely.
- **FR-23** The system presents loading, empty, no-results, validation-failure, forbidden, not-found,
  conflict, and safe API-failure feedback on every new and migrated screen.
- **FR-24** The system extends the Zen Green visual language consistently to Login, Change Password, the
  role-aware application shell, the IT Staff Ticket Queue and Detail screens, and User Management.

## 5. Business Rules

**Authentication**
- **BR-01** Only an active user with valid credentials may authenticate.
- **BR-02** A user marked as requiring a password change cannot enter the normal application until a new
  valid password is saved.
- **BR-06** After 5 consecutive failed login attempts for the same email within a 15-minute window,
  further attempts for that email are rejected with `429` until the window passes; a successful login
  resets the counter. This is a temporary throttle, not an account lock — it requires no administrator
  action to clear, since account unlocking is explicitly out of scope (§4.2).
- **BR-07** Passwords are stored only as the output of a salted, computationally expensive one-way hash
  (scrypt); the plaintext password is never persisted or logged anywhere, including error logs.
- **BR-08** A password (self-chosen or Administrator-set as an initial password) must be 8-72 characters
  and include at least one uppercase letter, one lowercase letter, one digit, and one special character.
- **BR-09** When changing a password, the new password must differ from the user's current password, and
  the confirmation field must match the new password exactly.
- **BR-10** Logging out deletes the session record on the server and clears the session cookie; the same
  session token is rejected on any later request.
- **BR-11** A session expires automatically 8 hours after login regardless of activity; an expired session
  is treated identically to having no session at all.
- **BR-12** An inactive user's credentials are never accepted. If the supplied password is wrong, the
  response is the same generic invalid-credentials message used for any failed login (revealing nothing
  about whether the account exists or is active). Only a *correct* password against an inactive account
  reveals — via a distinct, still-generic message — that the account is inactive.
- **BR-13** A state-changing request whose `Origin` header, when present, does not match the configured
  client origin is rejected regardless of an otherwise-valid session cookie.

**Identity and ownership**
- **BR-03** The authenticated user identity, not a `requesterId` supplied by the client, determines
  ownership of Requester operations.
- **BR-14** `GET /api/auth/me` returns the authenticated user's id, full name, email, role, and
  `mustChangePassword` flag, and never includes the password hash.
- **BR-15** A Requester-scoped Ticket or Attachment operation is always scoped to the authenticated
  user's id; a Ticket that exists but belongs to another Requester returns the same not-found response as
  a Ticket that does not exist at all (carried over from Lab 2 BR-10/BR-28).
- **BR-16** Each user has exactly one of the roles Requester, IT Staff, or Administrator; changing a
  user's role replaces the existing role, it never adds a second one.
- **BR-33** Email addresses are unique across all users, compared case-insensitively after trimming;
  creating or editing a user to an email already in use is rejected as a conflict.

**Comments and Internal Notes**
- **BR-04** Public Comments are visible to the Requester, IT Staff, and Administrator. Internal Notes are
  visible only to IT Staff and Administrator.
- **BR-24** Public Comments and Internal Notes can only be created, never edited or deleted, in Lab 3.
- **BR-25** A Comment or Note body must be non-empty after trimming and at most 2000 characters.
- **BR-26** Comment and Note bodies are rendered as plain text, never as HTML, preserving line breaks, so
  a body cannot inject markup into the page.
- **BR-27** The author and creation time of every Comment and Note are set by the backend from the
  authenticated session and are never accepted from the client.

**Ticket ownership, IT Priority, and status**
- **BR-17** A Ticket's owner, if set, must be an active IT Staff user; assigning an inactive user, a
  Requester, or (per the Assumptions in §11) an Administrator is rejected.
- **BR-18** IT Priority is copied from Requested Priority at Ticket creation and can be changed
  afterward only by IT Staff.
- **BR-19** A Ticket's status may only move along the approved Status Transition Matrix (§5a); an
  unlisted transition, or a transition to the Ticket's current status, is rejected as a conflict.
- **BR-20** Moving a Ticket to In Progress, Waiting for Requester, or Resolved requires the Ticket to
  already have an owner; otherwise the request is rejected For the same reason, a Ticket cannot be unassigned while its
  status is In Progress, Waiting for Requester, or Resolved (`409 OWNER_REQUIRED`).
- **BR-21** Moving a Ticket to Resolved requires a non-empty Resolution Summary of at most 2000
  characters, which is visible to the Requester.
- **BR-22** Closed and Cancelled Tickets accept no further status transition, ownership change, IT
  Priority change, Comment, or Internal Note; all such requests are rejected as a conflict.
- **BR-23** Moving a Ticket to Reopened clears any earlier "problem appears resolved" indication from the
  Requester.
- **BR-05** A Requester may indicate that the problem appears resolved, but cannot formally set the
  Ticket to Resolved or Closed.

**Administration**
- **BR-28** An Administrator creates a user with a full name, a unique email, exactly one role, an
  activation state, and an initial password meeting BR-08; the created user's `mustChangePassword` is
  `true`.
- **BR-29** An Administrator may update a user's full name, email, role, and activation state; the email
  must remain unique.
- **BR-30** An Administrator may set a new initial password for any user; this forces
  `mustChangePassword` to `true` and immediately deletes that user's existing sessions.
- **BR-31** An Administrator cannot deactivate or change the role of their own account.
- **BR-32** The system rejects any edit that would leave zero active Administrators (deactivating or
  changing the role of the last one).
- **BR-34** Lab 3 has no user-deletion capability; removing access is always done by deactivating the
  account.
- **BR-35** Deactivating a user, or resetting their initial password, deletes all of that user's existing
  sessions immediately.
- **BR-36** An Administrator may view the Ticket Queue, Ticket Detail, Public Comments, and Internal
  Notes, but cannot claim/reassign ownership, change IT Priority or status, or post a Comment or Note;
  those operations are performed only by IT Staff (§4.3, §11 Assumptions).

**Safety and regression**
- **BR-37** Every protected endpoint distinguishes unauthenticated (`401`), authenticated-but-forbidden
  (`403`), invalid input (`400`), missing resource (`404`), conflicting state (`409`), and unexpected
  server failure (`500`), and none of these responses reveal whether another user's protected resource
  exists.
- **BR-38** Every Lab 2 Requester-facing function (create, list, search/filter/sort/paginate, view
  detail, attachment upload/download/soft-remove) continues to work unchanged except that the Requester
  identity now comes from the authenticated session instead of a header.
- **BR-39** The Development Requester selector, its `sessionStorage` state, the Change Requester action,
  and the `X-Dev-Requester-Id` header are removed entirely; no code path accepts that header as an
  identity source.

### Authorization Matrix

Legend: ✅ full access · ✅ own = only the caller's own resource · 👁 read-only · 403 = authenticated but
forbidden · 401 = unauthenticated.

| Operation | Unauthenticated | Requester | IT Staff | Administrator |
|---|---|---|---|---|
| Login | ✅ | ✅ | ✅ | ✅ |
| Logout, current user, change own password | 401 | ✅ | ✅ | ✅ |
| Create/list/view/manage own Tickets & Attachments | 401 | ✅ own | 403 | 403 |
| Post Public Comment on own Ticket | 401 | ✅ own | 403 | 403 |
| Indicate "Problem Appears Resolved" | 401 | ✅ own | 403 | 403 |
| View Ticket Queue | 401 | 403 | ✅ | 👁 |
| View any Ticket Detail | 401 | 403 (own ticket via Requester route instead) | ✅ | 👁 |
| Claim / reassign Ticket owner | 401 | 403 | ✅ | 403 |
| Set / change IT Priority | 401 | 403 | ✅ | 403 |
| Change Ticket status | 401 | 403 | ✅ | 403 |
| Post Public Comment (staff route) | 401 | 403 | ✅ | 403 |
| Create Internal Note | 401 | 403 | ✅ | 403 |
| Read Internal Notes | 401 | 403 (content never returned) | ✅ | 👁 |
| List / search Users | 401 | 403 | 403 | ✅ |
| Create / edit User, reset initial password | 401 | 403 | 403 | ✅ |

Every 403 and 401 cell above has at least one dedicated test in
`server/tests/lab-03/authorization.api.test.ts`.

### Status Transition Matrix

Only IT Staff may change status. Required statuses (labsheet §4.5): New, Open, In Progress, Waiting for
Requester, Resolved, Closed, Reopened, Cancelled.

| From \ To | Open | In Progress | Waiting for Requester | Resolved | Closed | Reopened | Cancelled |
|---|---|---|---|---|---|---|---|
| **New** | ✅ | ✅ (owner req.) | — | — | — | — | ✅ |
| **Open** | — | ✅ (owner req.) | ✅ (owner req.) | ✅ (owner + summary) | — | — | ✅ |
| **In Progress** | — | — | ✅ | ✅ (owner + summary) | — | — | ✅ |
| **Waiting for Requester** | — | ✅ | — | ✅ (owner + summary) | — | — | ✅ |
| **Resolved** | — | — | — | — | ✅ | ✅ | — |
| **Reopened** | — | ✅ (owner req.) | ✅ (owner req.) | ✅ (owner + summary) | — | — | ✅ |
| **Closed** | *(terminal — no transition out)* | | | | | | |
| **Cancelled** | *(terminal — no transition out)* | | | | | | |

Rules that apply on top of the table (see BR-19–BR-23):
- A transition not marked with ✅ in the row for the current status is rejected as `409
  INVALID_TRANSITION`, including a "transition" to the same status.
- "(owner req.)" — the Ticket must already have an owner or the request is rejected as `409
  OWNER_REQUIRED`.
- "(owner + summary)" — the Ticket must have an owner **and** the request must include a Resolution
  Summary (1-2000 characters) or the request is rejected (`409 OWNER_REQUIRED` or `400`, respectively).
- Moving to Closed or Cancelled requires the UI to ask for confirmation before submitting.
- Reopened clears any earlier "problem appears resolved" indication (BR-23).

## 6. UI Specification Summary

Full detail lives in `docs/lab-03/ui-spec.md`. Summary of what it governs:
- **New screens**: Login, Change Password, Forbidden, Not Found, IT Staff Ticket Queue, IT Staff Ticket
  Detail, Administrator User Management.
- **Migrated screens**: application shell (role-aware navigation, authenticated user name/role display,
  Logout), Requester Ticket Detail (adds Public Comments and "Problem Appears Resolved").
- **Removed screens**: Development Requester Selection, and the Change Requester action from the shell.
- **Component reuse**: every Lab 2 Zen Green token, field/button/badge state, and layout convention
  carries over unchanged; new badges are added for the 8 Ticket statuses, IT Priority, and the 3 roles.
- **Internal Notes vs. Public Comments**: visually distinct treatment (separate tabs, a locked-note
  visual marker, and a different composer label) so private content cannot be posted publicly by mistake.
- **Responsive rules**: unchanged breakpoints from Lab 2 (desktop ≥992px / tablet 768-991px / mobile
  <768px); the Queue and User Management tables both collapse to a card layout below 992px.

## 7. Data Changes

New/changed models on top of the Lab 2 schema (`server/prisma/schema.prisma`); `Category`,
`RelatedSystem`, and `TicketCounter` are unchanged.

| Model | Purpose |
|---|---|
| `User` | Evolved from `RequesterUser` (renamed, not dropped). Every authenticated identity: Requester, IT Staff, or Administrator. |
| `Session` | One row per active login; the httpOnly cookie carries a token whose hash is looked up here. |
| `PublicComment` | Append-only communication on a Ticket, visible to Requester, IT Staff, and Administrator (BR-04). |
| `InternalNote` | Append-only operational note on a Ticket, visible only to IT Staff and Administrator (BR-04). |
| `Ticket` | Gains `ownerId`, `resolutionSummary`, `requesterResolvedAt`; `itPriority` becomes required; `TicketStatus` gains 7 values. |

### Fields, types and nullability

**`User`** (renamed from `RequesterUser`; `department` kept for existing rows, shown nowhere in Lab 3 UI).

| Field | Type | Req. | Key / default | Notes |
|---|---|---|---|---|
| `id` | Int | yes | PK, autoincrement | Unchanged from `RequesterUser.id` — every existing FK still resolves |
| `fullName` | String | yes | | |
| `email` | String | yes | unique | Stored trimmed + lowercased (BR-33) |
| `department` | String | no | | Legacy Lab 2 field; migration keeps it, no Lab 3 screen shows it |
| `role` | `Role` | yes | default `REQUESTER` | One of `REQUESTER`, `IT_STAFF`, `ADMINISTRATOR` (BR-16) |
| `passwordHash` | String | no | | `null` until an Administrator or the migration sets one; such a user cannot log in |
| `mustChangePassword` | Boolean | yes | default `true` | Gates all but `/me`, `/logout`, `/change-password` (BR-02) |
| `isActive` | Boolean | yes | default `true` | Unchanged meaning from Lab 2 |
| `createdAt` | DateTime | yes | default `now()` | |
| `updatedAt` | DateTime | yes | `@updatedAt` | New in Lab 3 |

**`Session`** — new.

| Field | Type | Req. | Key / default | Notes |
|---|---|---|---|---|
| `id` | Int | yes | PK, autoincrement | |
| `tokenHash` | String | yes | unique | SHA-256 of the random session token; the raw token never touches the DB |
| `userId` | Int | yes | FK to `User`, cascade delete | |
| `createdAt` | DateTime | yes | default `now()` | |
| `expiresAt` | DateTime | yes | | Absolute 8-hour expiry (BR-11) |

**`PublicComment`** and **`InternalNote`** — identical shape, separate tables so a query for one can never
accidentally return the other.

| Field | Type | Req. | Key / default | Notes |
|---|---|---|---|---|
| `id` | Int | yes | PK, autoincrement | |
| `ticketId` | Int | yes | FK to `Ticket` | |
| `authorId` | Int | yes | FK to `User` | Set from the session, never the client (BR-27) |
| `body` | String | yes | | Trimmed, 1-2000 chars (BR-25) |
| `createdAt` | DateTime | yes | default `now()` | |

**`Ticket`** — additions on top of the Lab 2 columns.

| Field | Type | Req. | Key / default | Notes |
|---|---|---|---|---|
| `ownerId` | Int | no | FK to `User` | Must reference an active IT Staff user when set (BR-17) |
| `itPriority` | `Priority` | **yes (was optional)** | backfilled from `requestedPriority` | No longer nullable after migration (labsheet §4 risk table) |
| `resolutionSummary` | String | no | | Required only when status becomes `RESOLVED` (BR-21) |
| `requesterResolvedAt` | DateTime | no | | Set by the Requester's "Problem Appears Resolved" action; cleared on Reopen (BR-23) |
| `currentStatus` | `TicketStatus` | yes | default `NEW` | Enum gains 7 values (below) |

### Enums

| Enum | Values | Why |
|---|---|---|
| `Role` | `REQUESTER`, `IT_STAFF`, `ADMINISTRATOR` | One value per user (BR-16); a DB enum so an invalid role can never be stored |
| `TicketStatus` | `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CLOSED`, `REOPENED`, `CANCELLED` | The 8 statuses labsheet §4.5 requires; `ALTER TYPE ... ADD VALUE` keeps every existing `NEW` row valid |
| `Priority` | unchanged (`LOW`, `MEDIUM`, `HIGH`, `URGENT`) | Reused for both `requestedPriority` and `itPriority` |

### Migration Decisions

Migration `lab3_users_roles_workflow` is additive only — no table is dropped and no existing row is
rewritten to an incompatible shape.

1. **`RequesterUser` is renamed to `User`**, not dropped and recreated, via `ALTER TABLE ... RENAME TO`.
   Every existing foreign key (`Ticket.requesterId`, `Attachment.uploadedById`, `Attachment.removedById`)
   keeps pointing at the same rows without being touched, so existing Ticket and Attachment ownership is
   preserved by construction rather than by a data-copy step that could go wrong.
2. **New `User` columns get safe defaults**: `role` defaults to `REQUESTER` (every existing row was a
   Lab 2 Requester), `mustChangePassword` defaults to `true`, and `passwordHash` is nullable so a
   migrated row is valid — but cannot log in — before it has a password. The idempotent seed script
   (§5.3, `server/prisma/seed.ts`) then converges every named seeded account to its documented state: a
   single local-development password (`SEED_PASSWORD`) is assigned to each, with `mustChangePassword`
   set to `false` for the original Lab 2 Requesters (already "onboarded" for convenient local testing)
   and left `true` for one dedicated account that exists specifically to demonstrate the mandatory
   first-login change. A migrated account that the seed script never names (a real production migration
   would have more than five) keeps the migration's own default of `passwordHash = null`,
   `mustChangePassword = true`, and simply cannot authenticate until an Administrator sets its initial
   password (BR-30).
3. **`TicketStatus` gains its 7 new values with `ALTER TYPE ... ADD VALUE`**, one statement per value,
   never in the same transaction that uses the new value — PostgreSQL forbids using a new enum value
   before the transaction that added it commits. Every existing Ticket keeps `currentStatus = NEW`
   unchanged.
4. **`itPriority` is backfilled before being made required**: `UPDATE "Ticket" SET "itPriority" =
   "requestedPriority" WHERE "itPriority" IS NULL`, then `ALTER COLUMN ... SET NOT NULL`. This satisfies
   the labsheet's explicit instruction that "the migration must fill IT Priority of old tickets with the
   value of Requested Priority."
5. **`Session`, `PublicComment`, and `InternalNote` are new tables**; none of them can affect existing
   data because nothing references them yet.
6. **Migration correctness is tested directly** (`server/tests/lab-03/migration.test.ts`): a temporary
   Postgres schema is seeded with Lab-2-shaped data (a `RequesterUser`, a `Ticket` with `itPriority =
   null`, an `Attachment` with an uploader and a remover), the Lab 3 migration SQL is applied to it, and
   the test asserts the same rows are still reachable through the new `User`/`Ticket` shape with the
   correct backfilled `itPriority` and unbroken uploader/remover references.

**Seed (labsheet §5.3):** `server/prisma/seed.ts` seeds idempotently (an `upsert` whose `update` clause
actually updates the row, not `update: {}`) so a repeated run converges rather than duplicating: at least
4 active + 1 inactive Requester (the 5 already in Lab 2), at least 3 active + 1 inactive IT Staff, at least
1 active Administrator, realistic Tickets spread across all 8 statuses/4 priorities/assigned-and-unassigned
ownership, and example Comments/Notes containing no sensitive information. All seeded passwords are a
single documented local-development value (never a real personal password), stated in the README and
never committed as a literal default with no override — it is read from `SEED_PASSWORD` with a fallback
value used only outside `NODE_ENV=production`.

## 8. API Contract

Full contract lives in `docs/lab-03/api-spec.md`. Summary of the endpoint groups added or changed in
Lab 3 (all Lab 2 endpoints are unchanged in shape, only in how identity is established):

- **Auth**: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`,
  `POST /api/auth/change-password`.
- **Requester (unchanged paths, session-scoped instead of header-scoped)**: ticket create/list/detail,
  attachment add/metadata/download/soft-remove, plus new `POST /api/tickets/:id/problem-resolved` and
  `GET`/`POST /api/tickets/:id/comments`.
- **IT Staff / Administrator (read) queue and detail**: `GET /api/staff/tickets`,
  `GET /api/staff/tickets/:id`, `GET /api/staff/assignable-users`.
- **IT Staff (write)**: `PATCH /api/staff/tickets/:id/owner`, `PATCH .../it-priority`,
  `PATCH .../status`, `GET`/`POST /api/staff/tickets/:id/notes`.
- **Administrator**: `GET/POST /api/admin/users`, `PATCH /api/admin/users/:id`,
  `POST /api/admin/users/:id/initial-password`.
- **Removed**: `GET /api/dev-requesters` and the `X-Dev-Requester-Id` header are removed entirely.

Session identity travels as an httpOnly cookie (`tt_session`) set by login and cleared by logout, rather
than a request header — this is what makes a stolen client-side value (e.g. from `sessionStorage`, as
Lab 2 used) unable to impersonate a user, and it is what BR-03/AC-03 rely on: the body/query field
`requesterId` is parsed and then explicitly ignored by every Requester-scoped endpoint.

## 9. Acceptance Criteria

- **AC-01** Given an active user with valid credentials, when the user logs in, then the backend
  establishes authenticated access and returns the permitted user identity and role.
- **AC-02** Given a user who must change the initial password, when login succeeds, then normal
  application screens remain unavailable until a valid new password is saved.
- **AC-03** Given an authenticated Requester, when the client supplies another `requesterId`, then the
  backend still applies the authenticated identity and does not return another Requester's data.
- **AC-04** Given a Requester account, when an Internal Note endpoint is requested, then the operation
  is rejected without exposing note content.
- **AC-05** Given a user logs in with an incorrect password, when the login request is submitted, then a
  generic "Invalid email or password" message is shown and the response does not reveal whether that
  email belongs to an account.
- **AC-06** Given an inactive user's correct credentials, when login is submitted, then a message states
  the account is inactive without exposing any other account details.
- **AC-07** Given 5 failed login attempts for the same email within 15 minutes, when a 6th attempt is
  submitted, then it is rejected with `429`, and a correct password does not bypass the throttle until
  the window passes.
- **AC-08** Given a logged-in user, when they click Logout, then the session is invalidated and a later
  request using the old session cookie is treated as unauthenticated.
- **AC-09** Given a logged-out user, when they navigate directly to a Requester/Staff/Admin route URL,
  then they are redirected to Login instead of the route rendering.
- **AC-10** Given an authenticated user, when they view the application shell, then their name and role
  are shown and only the navigation permitted for their role appears.
- **AC-11** Given a Requester opens the IT Staff Ticket Queue or Administrator User Management URL
  directly, then a Forbidden screen is shown and no protected data is fetched.
- **AC-12** Given a Requester creates a Ticket, when it is saved, then its IT Priority equals its
  Requested Priority automatically.
- **AC-13** Given an IT Staff user opens an unassigned Ticket, when they click Claim, then the Ticket's
  owner becomes that IT Staff user, visible immediately in the Queue.
- **AC-14** Given a Ticket owned by IT Staff member A, when IT Staff member B reassigns it to
  themselves, then the owner updates to B for both of them.
- **AC-15** Given a Ticket with no owner, when IT Staff attempts to change its status to In Progress,
  then the request is rejected until an owner is set.
- **AC-16** Given a status not reachable from the Ticket's current status per the transition matrix, when
  IT Staff attempts that change, then the request is rejected and the status is unchanged.
- **AC-17** Given IT Staff changes a Ticket's status to Resolved without a Resolution Summary, then the
  change is rejected until a Resolution Summary is provided.
- **AC-18** Given a Ticket is Closed, when IT Staff attempts to change its owner, IT Priority, or status,
  then the request is rejected.
- **AC-19** Given a Requester posts a Public Comment, when IT Staff or the Requester views Ticket
  Detail, then the comment is visible to both with the correct author and timestamp from the backend.
- **AC-20** Given IT Staff creates an Internal Note, when the owning Requester requests that Ticket's
  notes, then the request is rejected and no note content is returned.
- **AC-21** Given a Requester clicks "Problem Appears Resolved" on an active Ticket, then the indicator
  appears in the Queue and Ticket Detail, and the Ticket's formal status does not change.
- **AC-22** Given a Requester has already indicated the problem appears resolved, when they repeat the
  action on the same open period, then the request is rejected as a conflict.
- **AC-23** Given Tickets across different statuses, priorities, and owners, when IT Staff searches,
  filters, sorts, and paginates the Queue, then only Tickets matching every applied condition appear, in
  the requested order, with correct pagination metadata.
- **AC-24** Given an invalid Queue query parameter, when the request is submitted, then a `400` response
  names the invalid parameter.
- **AC-25** Given an Administrator creates a user with an email already in use, then the request is
  rejected as a conflict and no user is created or changed.
- **AC-26** Given an Administrator sets a new initial password for a user, when that user next logs in
  with the new password, then they must change it before reaching any other screen, and any prior
  session of theirs is no longer valid.
- **AC-27** Given an Administrator attempts to deactivate their own account, then the request is
  rejected and the account remains active.
- **AC-28** Given exactly one active Administrator exists, when an attempt is made to deactivate that
  Administrator or change their role, then the request is rejected.
- **AC-29** Given a Requester, IT Staff user, or unauthenticated caller calls an Administrator-only
  endpoint directly, then the response is `403` (or `401` if unauthenticated) and no user data returns.
- **AC-30** Given the application is viewed at desktop, tablet, and mobile widths, when Login, Ticket
  Queue, Ticket Detail, and User Management are inspected at each width, then no horizontal page
  scrolling, clipped labels, or hidden buttons occur.

## 10. Definition of Done

**Product completion**
- [ ] Every FR/BR/AC above is implemented and traceable to at least one automated test in
      `docs/lab-03/tests.md`.
- [ ] `server/tests/lab-03/*`, `client/tests/lab-03/*`, `e2e/lab-03/*`, and every Lab 1/Lab 2 test all pass
      run from the final `main` branch, using the documented test commands; no test is skipped, `.only`'d,
      or commented out.
- [ ] Login, Change Password, the role-aware shell, Requester Ticket Detail, IT Staff Ticket Queue and
      Detail, and User Management conform to `ui-spec.md` at desktop, tablet, and mobile widths, verified
      by the Playwright screenshots in `artifacts/lab-03/screenshots/`.
- [ ] The API conforms to `api-spec.md`: every documented endpoint returns the documented shape and
      status codes for both success and every documented failure case.
- [ ] Authorization and ownership are enforced on the backend for every endpoint in §5a's matrix — not
      just hidden in the UI — verified by `authorization.api.test.ts` and `comments-notes.api.test.ts`.
- [ ] No `X-Dev-Requester-Id`, `requesterAuth`, or `RequesterSelect` remains anywhere in `server/src`,
      `client/src`, `server/tests`, `client/tests`, or `e2e`.
- [ ] README setup and test-running instructions are current for Lab 3 (new env vars, seeded accounts and
      their local-only passwords, new test/E2E commands).

**Course delivery**
- All Lab 3 work happens on feature branches named `feature/<issue-number>-<slug>`, merged into
  `lab3-staging` via peer-reviewed, approved Pull Requests, then released to `main` via one release Pull
  Request from `lab3-staging`.
- This contract (Issue #62, this PR) is merged into `lab3-staging` before any implementation Pull Request
  is opened, so the specification is verifiably in place before the coding agent begins Lab 3 work.
- Every Issue is linked to its Pull Request through the Development panel and moved through the full
  Backlog → Specified → Started → PR Review → (Fixing →) Done flow on the Project board.
- `docs/lab-03/reviewer.md` records both directions of peer review with real comments, responses, and
  approvals.
- `docs/lab-03/ai-use.md` documents the LLM(s) used and 6-10 key prompts with a brief reflection.
- The submission PDF uses the required `Answer Part 1`-`Answer Part 9` structure with working links.

## 11. Assumptions and Decisions

- **Administrator ticket access is read-only, and Ticket Owner is restricted to active IT Staff.**
  Labsheet §4.5 literally allows "an active IT Staff **or Administrator** user" as Ticket Owner, but §4.3
  states "Administrator and IT Staff responsibilities should remain conceptually separate... An
  Administrator does not automatically need to perform IT Staff Ticket operations **unless the approved
  authorization matrix explicitly permits it**." Since §4.3 makes non-permission the default, this
  specification's approved authorization matrix (§5a) does not extend ticket-operation rights to
  Administrator; the `owner` foreign key is restricted at the API layer to active `IT_STAFF` users. An
  Administrator retains read access to the Queue, Ticket Detail, Comments, and Internal Notes because
  BR-04 explicitly requires Internal Notes to be visible to Administrator as well as IT Staff.
- **Session over token-in-header.** A server-side session table with an httpOnly cookie was chosen over a
  stateless JWT specifically because logout (BR-10) and an Administrator's forced password reset (BR-30)
  both need to be able to invalidate a credential immediately; a signed, stateless token cannot be revoked
  before its own expiry without an additional server-side blocklist, which is just a session table under a
  different name.
- **Password hashing algorithm**: `scrypt` from Node's built-in `crypto` module, chosen over `bcrypt`
  specifically to avoid a native-addon dependency that needs a matching prebuilt binary per OS/Node
  version — relevant since this project is developed on Windows and graded elsewhere.
- **Login throttle, not account lock**: a 5-attempts/15-minute per-email throttle that resets on success
  or after the window, not a persisted lock a user cannot escape. Account unlocking and administrator
  approval workflows are explicitly out of scope (§4.2), so a mechanism that would need one is avoided.
- **Queue pagination and sort defaults**: page sizes `{10, 20, 50}` and default sort `createdAt:desc`,
  reused unchanged from the Lab 2 My Tickets contract, for one consistent pagination UX across the app.
- **Mockup items not built**: the "Forgot your password?" link and "Send password reset email" checkbox
  (page 8/11 of the handout) are not implemented, since password-reset email is explicitly excluded
  (§4.2); an Administrator instead types the initial password directly. The "Service Actions" tab shown
  in the Ticket Detail mockup (page 9) is Actions Taken, explicitly deferred to Lab 4. User-list
  pagination shown in the mockup (page 11) is explicitly not required by §8.5 and is not built.
