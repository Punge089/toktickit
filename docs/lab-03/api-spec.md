# Lab 3 API Contract

All endpoints are prefixed `/api`. All responses are JSON unless noted. Identity travels as an httpOnly
session cookie (`tt_session`), never a header, and every state-changing request is subject to the Origin
check in §0. `specification.md` §5/§9 defines the business rules and acceptance criteria these endpoints
satisfy. Lab 2 endpoints not listed here (categories, related-systems, attachments) are unchanged in
shape — only their auth source changes, from §0 below instead of `X-Dev-Requester-Id`.

## 0. Session, middleware order, and shared conventions

**Cookie**: `tt_session`, httpOnly, `SameSite=Lax`, `path=/`, `secure` when `NODE_ENV=production`,
absolute expiry 8 hours from login (`SESSION_TTL_HOURS`, BR-11). Set on successful login, cleared on
logout. The cookie value is a random 32-byte token; the server stores only its SHA-256 hash in `Session`.

**CORS**: `origin: CLIENT_ORIGIN` (default `http://localhost:5173`), `credentials: true`. The client sends
every request with `credentials: "include"`.

**Origin check (BR-13)**: for `POST`/`PATCH`/`DELETE` requests, if an `Origin` header is present and does
not equal `CLIENT_ORIGIN`, the request is rejected before any other check:
```json
{ "error": "ORIGIN_NOT_ALLOWED", "message": "Request origin is not allowed." }
```
`403`. A request with no `Origin` header (e.g. a same-origin browser navigation, `curl`, or Supertest) is
not rejected by this check — SameSite=Lax already blocks a cross-site browser form/fetch from attaching
the cookie in the first place, so the two mechanisms cover different attack shapes.

**Middleware order for every protected route**: `requireAuth` → `requirePasswordCurrent` →
`requireRole(...)`.

| Check | Failure status | Body |
|---|---|---|
| No valid, unexpired session | `401` | `{ "error": "UNAUTHENTICATED", "message": "Please log in." }` |
| Session valid, but `mustChangePassword` is true and the route isn't `/me`, `/logout`, or `/change-password` | `403` | `{ "error": "PASSWORD_CHANGE_REQUIRED", "message": "Change your password to continue." }` |
| Session valid, password current, but role not permitted | `403` | `{ "error": "FORBIDDEN", "message": "You do not have access to this resource." }` |

**Standard error shape** (unless noted otherwise):
```json
{ "error": "SHORT_CODE", "message": "human-readable, safe to display", "fieldErrors": { "email": "..." } }
```
`fieldErrors` is present only on `400` validation failures. Unexpected server errors always return
`500 { "error": "INTERNAL_ERROR", "message": "Something went wrong. Please try again." }` — never a raw
stack trace or DB error message.

**Pagination metadata shape** (list endpoints):
```json
{ "page": 1, "pageSize": 10, "totalItems": 34, "totalPages": 4, "sort": "createdAt:desc" }
```

---

## 1. `POST /api/auth/login`

Purpose: authenticate and establish a session (BR-01, BR-06, BR-07, BR-12, AC-01, AC-05, AC-06, AC-07).
Auth: none.

**Request**
```json
{ "email": "aran.suksawat@example.dev", "password": "TokTick-Dev#2026" }
```

**200 OK** — sets `tt_session` cookie.
```json
{ "user": { "id": 1, "fullName": "Aran Suksawat", "email": "aran.suksawat@example.dev",
            "role": "REQUESTER", "mustChangePassword": false } }
```
**400** — missing/malformed `email` or `password`.
**401** — wrong password or unknown email, identical body either way:
```json
{ "error": "INVALID_CREDENTIALS", "message": "Invalid email or password." }
```
**403** — correct password, inactive account:
```json
{ "error": "ACCOUNT_INACTIVE", "message": "This account is inactive. Contact your administrator." }
```
**429** — 5th+ failed attempt for this email within 15 minutes, `Retry-After` header set:
```json
{ "error": "TOO_MANY_ATTEMPTS", "message": "Too many failed attempts. Try again later." }
```
**500** — standard shape.

## 2. `POST /api/auth/logout`

Purpose: invalidate the current session (BR-10, AC-08). Auth: any authenticated caller, including a user
who must still change their password.

**204 No Content** — deletes the session row and clears the cookie. Idempotent: called with no valid
session, still returns `204`.

## 3. `GET /api/auth/me`

Purpose: current authenticated identity (BR-14, FR-04). Auth: any authenticated caller.

**200 OK**
```json
{ "id": 1, "fullName": "Aran Suksawat", "email": "aran.suksawat@example.dev",
  "role": "REQUESTER", "mustChangePassword": false }
```
**401** — no valid session.

## 4. `POST /api/auth/change-password`

Purpose: self-service password change, including the mandatory first-login change (BR-02, BR-08, BR-09,
AC-02). Auth: any authenticated caller (allowed even when `mustChangePassword` is true).

**Request**
```json
{ "currentPassword": "TokTick-Dev#2026", "newPassword": "N3w!Passw0rd", "confirmPassword": "N3w!Passw0rd" }
```

**200 OK** — clears `mustChangePassword`, deletes every *other* session for this user (BR: changing your
password logs out other devices, keeps this one).
```json
{ "user": { "id": 1, "fullName": "Aran Suksawat", "email": "aran.suksawat@example.dev",
            "role": "REQUESTER", "mustChangePassword": false } }
```
**400** — policy violation, mismatch confirmation, or wrong current password (deliberately `400`, not
`401`, so the client does not treat it as a session failure):
```json
{ "error": "VALIDATION_FAILED", "message": "Fix the highlighted fields.",
  "fieldErrors": { "currentPassword": "Current password is incorrect." } }
```
**401** — no valid session. **500** — standard shape.

---

## 5. Requester Ticket and Attachment endpoints (Lab 2, unchanged shapes)

`POST /api/tickets`, `GET /api/tickets`, `GET /api/tickets/:id`, `POST /api/tickets/:id/attachments`,
`GET /api/attachments/:id`, `GET /api/attachments/:id/download`, `DELETE /api/attachments/:id` — every
request/response shape, status code, and business rule is exactly as documented in
`docs/lab-02/api-spec.md` §4-§10, with two changes:
- Auth is `requireAuth` + `requireRole("REQUESTER")` instead of the `X-Dev-Requester-Id` header; the
  owning Requester is `req.user!.id` (BR-03, AC-03). A `requesterId` in the request body or query string
  is parsed for backward-compatible client code, then explicitly ignored.
- `POST /api/tickets` additionally sets `itPriority = requestedPriority` on creation (AC-12); the `201`
  response's `itPriority` field is therefore never `null` in Lab 3.

## 6. `POST /api/tickets/:id/problem-resolved`

Purpose: Requester indicates a problem appears resolved, without changing formal status (BR-05, BR-23,
AC-21, AC-22). Auth: `REQUESTER`, owner of the Ticket only.

**200 OK**
```json
{ "requesterResolvedAt": "2026-09-20T09:00:00.000Z" }
```
**404** — Ticket not found or not owned (same body as Lab 2 §6). **409** — already indicated on this open
period, or the Ticket is `RESOLVED`/`CLOSED`/`CANCELLED`:
```json
{ "error": "TICKET_NOT_ACTIVE", "message": "This ticket cannot be marked resolved by the requester right now." }
```
**500** — standard shape.

## 7. `GET /api/tickets/:id/comments` and `POST /api/tickets/:id/comments`

Purpose: Public Comments on a Ticket (BR-04, BR-24-BR-27, AC-19). Auth: `REQUESTER` (owner only; another
Requester's Ticket answers `404` like a missing one), `IT_STAFF` (read and post on any Ticket), `ADMINISTRATOR`
(read only; `POST` is `403`). This one route serves all three roles so the thread is identical for everyone
who may see it.

**GET 200 OK**
```json
[{ "id": 3, "authorId": 1, "authorName": "Aran Suksawat", "authorRole": "REQUESTER",
   "body": "Thanks for the update.", "createdAt": "2026-09-19T11:45:00.000Z" }]
```
Ordered `createdAt asc`.

**POST request**
```json
{ "body": "Still happening after the restart." }
```
**201 Created** — same shape as one GET item. **400** — empty/too-long body (BR-25):
```json
{ "error": "VALIDATION_FAILED", "message": "Comment cannot be empty.", "fieldErrors": { "body": "..." } }
```
**404** — Ticket not found/not owned. **409** — Ticket is `CLOSED`/`CANCELLED` (BR-22). **500** —
standard shape.

---

## 8. `GET /api/staff/tickets`

Purpose: the shared Ticket Queue — searchable, filterable, sortable, paginated (§6.3 of the labsheet,
AC-23, AC-24). Auth: `IT_STAFF`, `ADMINISTRATOR` (read).

**Query parameters**

| Param | Values | Default | Invalid-value behavior |
|---|---|---|---|
| `search` | free text (≤100 chars), matched against `ticketNumber`, `summary`, requester `fullName` | — | none possible |
| `status` | one of the 8 `TicketStatus` values | — | other value → `400` |
| `itPriority` | `LOW\|MEDIUM\|HIGH\|URGENT` | — | other value → `400` |
| `categoryId` | integer | — | non-integer → `400` |
| `owner` | `me\|unassigned\|<integer userId>` | — | other value → `400` |
| `sort` | `createdAt\|updatedAt\|ticketNumber\|itPriority\|currentStatus`, optionally `:asc`/`:desc` | `createdAt:desc` | other value → `400` |
| `page` | integer ≥1 | `1` | non-integer or <1 → `400` |
| `pageSize` | `10\|20\|50` | `10` | other value → `400` |

`400` body names the offending parameter, matching the Lab 2 `INVALID_QUERY` shape. A `page` beyond
`totalPages` returns an empty `items` array with correct metadata, not a `400` (unlike Lab 2 — the Queue
is shared and its size changes constantly, so an operator paging past the end is a normal, not an error,
condition).

**200 OK**
```json
{
  "items": [{ "id": 42, "ticketNumber": "TKT-2026-000042", "createdAt": "...", "updatedAt": "...",
              "summary": "Laptop battery drains quickly", "categoryName": "Hardware",
              "requestedPriority": "MEDIUM", "itPriority": "MEDIUM", "currentStatus": "OPEN",
              "owner": { "id": 6, "fullName": "Michael Brown", "isActive": true }, "requesterName": "Jennifer Anderson",
              "requesterResolvedAt": null }],
  "page": 1, "pageSize": 10, "totalItems": 87, "totalPages": 9, "sort": "createdAt:desc",
  "appliedFilters": { "search": null, "status": null, "itPriority": null, "categoryId": null, "owner": null }
}
```
`owner` is `null` when unassigned; `owner.isActive` lets the UI mark a since-deactivated owner "(inactive)" (ui-spec.md §7). `appliedFilters.owner` echoes `me`, `unassigned`, or the user id as a string. Every invalid parameter is reported together in `fieldErrors`. **401/403** — per §0. **500** — standard shape.

## 9. `GET /api/staff/tickets/:id`

Purpose: full operational detail for one Ticket (FR-11, AC-13-AC-18). Auth: `IT_STAFF`,
`ADMINISTRATOR` (read).

**200 OK** — same fields as Lab 2's `GET /api/tickets/:id`, plus `ownerId`/`ownerName`,
`resolutionSummary`, `requesterResolvedAt`, and attachment list unchanged from Lab 2 shape. **404** —
Ticket does not exist (no ownership concept restricts staff visibility, so there is no "belongs to
someone else" case here). **401/403** — per §0. **500** — standard shape.

## 10. `GET /api/staff/assignable-users`

Purpose: the list offered by the Queue's Owner filter (Issue 65) and by claim/reassign (BR-17, Issue 66). Auth: `IT_STAFF`, `ADMINISTRATOR` (read-only names, since an Administrator may read the Queue).

**200 OK**
```json
[{ "id": 6, "fullName": "Michael Brown" }, { "id": 9, "fullName": "Siriporn IT" }]
```
Active `IT_STAFF` users only, ordered by `fullName`. **401/403** — per §0.

## 11. `PATCH /api/staff/tickets/:id/owner`

Purpose: claim or reassign ownership (BR-17, AC-13, AC-14). Auth: `IT_STAFF`.

**Request**
```json
{ "ownerId": 6 }
```
`ownerId: null` unassigns. **200 OK** — updated Ticket detail shape (§9). **400** — `ownerId` missing/not
an integer/null-but-not-explicit. **404** — Ticket not found. **409** —
```json
{ "error": "INVALID_OWNER", "message": "Owner must be an active IT Staff user." }
```
or, when unassigning (`ownerId: null`) a Ticket that is In Progress, Waiting for Requester, or Resolved (BR-20):
```json
{ "error": "OWNER_REQUIRED", "message": "An owner is required while a ticket is In Progress, Waiting for Requester, or Resolved." }
```
or, if the Ticket is `CLOSED`/`CANCELLED`:
```json
{ "error": "TICKET_CLOSED", "message": "This ticket's owner can no longer be changed." }
```
**401/403** — per §0. **500** — standard shape.

## 12. `PATCH /api/staff/tickets/:id/it-priority`

Purpose: change IT Priority (BR-18). Auth: `IT_STAFF`.

**Request**
```json
{ "itPriority": "HIGH" }
```
**200 OK** — updated Ticket detail shape. **400** — invalid enum value. **404** — Ticket not found.
**409 `TICKET_CLOSED`** — Ticket is `CLOSED`/`CANCELLED`. **401/403** — per §0. **500** — standard shape.

## 13. `PATCH /api/staff/tickets/:id/status`

Purpose: move a Ticket through the Status Transition Matrix (specification.md §5a; BR-19-BR-23; AC-15-
AC-18). Auth: `IT_STAFF`.

**Request**
```json
{ "status": "RESOLVED", "resolutionSummary": "Replaced the battery under warranty." }
```
`resolutionSummary` required only when `status` is `RESOLVED`.

**200 OK** — updated Ticket detail shape. **400** — invalid `status` enum value, or `RESOLVED` without a
valid `resolutionSummary` (1-2000 chars). **404** — Ticket not found. **409** —
```json
{ "error": "INVALID_TRANSITION", "message": "Cannot move from Open to Reopened." }
```
or
```json
{ "error": "OWNER_REQUIRED", "message": "Assign an owner before starting work on this ticket." }
```
or `TICKET_CLOSED` if already terminal. **401/403** — per §0. **500** — standard shape.

## 14. `GET /api/staff/tickets/:id/notes` and `POST /api/staff/tickets/:id/notes`

Purpose: Internal Notes (BR-04, BR-24-BR-27, AC-04, AC-20). Auth: `IT_STAFF` (read/write),
`ADMINISTRATOR` (read only, per specification.md §11's Assumptions).

**GET 200 OK** — same shape as Public Comments (§7), field `authorRole` always `IT_STAFF` or
`ADMINISTRATOR`. A `REQUESTER` calling this endpoint receives `403 FORBIDDEN` with no note content
(AC-04, AC-20) — the check happens before the Ticket is even looked up. **POST** — `IT_STAFF` only;
`ADMINISTRATOR` gets `403`. Same validation/response shape as Public Comments §7, plus `409
TICKET_CLOSED` on a terminal Ticket.

---

## 15. `GET /api/admin/users`

Purpose: search/list users (FR-17). Auth: `ADMINISTRATOR`.

**Query**: `search` (name/email substring, ≤100 chars), `role` (one of the 3 `Role` values, optional).
Invalid `role` → `400`.

**200 OK**
```json
{ "items": [{ "id": 1, "fullName": "Aran Suksawat", "email": "aran.suksawat@example.dev",
              "role": "REQUESTER", "isActive": true }] }
```
Never includes `passwordHash`. **401/403** — per §0. **500** — standard shape.

## 16. `POST /api/admin/users`

Purpose: create a user (BR-28, AC-25). Auth: `ADMINISTRATOR`.

**Request**
```json
{ "fullName": "Ekkachai New", "email": "ekkachai.new@example.dev", "role": "REQUESTER",
  "isActive": true, "initialPassword": "Temp#Passw0rd1" }
```
**201 Created** — user shape from §15's `items`. **400** — missing field, invalid role, or
`initialPassword` failing the password policy (specification.md BR-08). **409 `EMAIL_TAKEN`** — email
already in use (case-insensitive). **401/403** — per §0. **500** — standard shape.

## 17. `PATCH /api/admin/users/:id`

Purpose: edit a user (BR-29, BR-31, BR-32, AC-27, AC-28). Auth: `ADMINISTRATOR`.

**Request** (all fields optional, at least one required)
```json
{ "fullName": "Aran S.", "email": "aran.s@example.dev", "role": "IT_STAFF", "isActive": false }
```
**200 OK** — updated user shape. **400** — invalid role/email format. **404** — user not found.
**409** — one of:
```json
{ "error": "EMAIL_TAKEN", "message": "..." }
{ "error": "CANNOT_DEACTIVATE_SELF", "message": "You cannot deactivate your own account." }
{ "error": "CANNOT_CHANGE_OWN_ROLE", "message": "You cannot change your own role." }
{ "error": "LAST_ACTIVE_ADMIN", "message": "At least one active Administrator must remain." }
```
**401/403** — per §0. **500** — standard shape.

## 18. `POST /api/admin/users/:id/initial-password`

Purpose: reset a user's password and force a change at next login (BR-30, AC-26). Auth: `ADMINISTRATOR`.

**Request**
```json
{ "initialPassword": "Temp#Passw0rd2" }
```
**200 OK** — sets `mustChangePassword = true`, deletes every session belonging to that user.
```json
{ "id": 1, "mustChangePassword": true }
```
**400** — policy violation. **404** — user not found. **401/403** — per §0. **500** — standard shape.

---

## 19. Removed from Lab 2

`GET /api/dev-requesters` is removed. Calling it returns `404` (route no longer exists), verified by a
regression test rather than left undocumented.

## 20. HTTP status code summary

| Status | Meaning in this API |
|---|---|
| `200` | Successful retrieval, update, or action. |
| `201` | Ticket, Attachment, Comment, Note, or User created. |
| `204` | Logout succeeded (no body). |
| `400` | Malformed input: missing/invalid field, invalid query parameter, policy violation. |
| `401` | No valid, unexpired session. |
| `403` | Authenticated, but the role (or password-change gate) forbids this operation. |
| `404` | Resource does not exist, or (for Requester-scoped Lab 2 endpoints) exists but is not owned by the caller — deliberately indistinguishable. |
| `409` | Request conflicts with current resource state (invalid transition, owner required, ticket closed, duplicate email, last admin, already resolved-by-requester). |
| `410` | Removed Attachment's file requested for download (unchanged from Lab 2). |
| `413` / `415` | Attachment upload limits, unchanged from Lab 2. |
| `429` | Login throttled after repeated failures. |
| `500` | Unexpected server-side failure; body never leaks internal detail. |
