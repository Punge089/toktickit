# Lab 4 API Contract

All endpoints are prefixed `/api`; all responses are JSON. This document adds to `docs/lab-03/api-spec.md`
and `docs/lab-02/api-spec.md`, which stay the contract for every endpoint not listed here. Session, cookie,
Origin check, middleware order (`requireAuth`, `requirePasswordCurrent`, `requireRole`), the standard error
shape and the pagination shape are exactly as in Lab 3 §0 and are not repeated. `specification.md` defines the
business rules (BR) and acceptance criteria (AC) these endpoints satisfy.

**Dates** are UTC ISO strings. **Free text** is plain text and is trimmed. **Error codes** introduced in
Lab 4 are listed in §10.

## 1. `GET /api/tickets/:id/actions`

Purpose: list the Actions Taken of one Ticket (FR-04, BR-10, BR-13, AC-08, AC-09). Auth: `REQUESTER` (own
Ticket only), `IT_STAFF`, `ADMINISTRATOR`. One route serves all three roles so the list is identical for
everyone who may see it (the same pattern as Lab 3 §7).

**200 OK**
```json
{
  "items": [
    { "id": 12, "ticketId": 42, "actionAt": "2026-10-28T09:30:00.000Z",
      "description": "Replaced the laptop battery.", "result": "Battery now holds charge.",
      "performedBy": { "id": 6, "fullName": "Michael Brown", "isActive": true },
      "assignee": { "id": 9, "fullName": "Siriporn IT", "isActive": true },
      "followUpRequired": true, "followUpNote": "Check battery health next week.",
      "attachmentNotes": "Photo of the old battery is in the Ticket attachments.",
      "actionStatus": "COMPLETED", "version": 3,
      "createdAt": "2026-10-28T09:31:00.000Z", "updatedAt": "2026-10-28T10:05:00.000Z" }
  ],
  "counts": { "open": 0, "completed": 1, "cancelled": 0 }
}
```
Ordered `actionAt` ascending, then `id` ascending. `counts.open` is Planned plus In Progress. A Ticket with no
Actions returns `{ "items": [], "counts": { "open": 0, "completed": 0, "cancelled": 0 } }`. No Internal Note
text appears anywhere in the response. **404** - Ticket does not exist, or belongs to another Requester (same
body as Lab 2 §6). **401/403** - per Lab 3 §0. **500** - standard shape.

## 2. `POST /api/staff/tickets/:id/actions`

Purpose: create an Action Taken (FR-01, FR-05, BR-01 to BR-09, BR-12, BR-18, AC-01, AC-03 to AC-07, AC-13,
AC-15). Auth: `IT_STAFF`, `ADMINISTRATOR`.

**Request**
```json
{ "clientRequestId": "7c1f2f66-1a4e-4a8c-9f6a-0b5d4e7a2c10",
  "actionAt": "2026-10-28T09:30:00.000Z",
  "description": "Replaced the laptop battery.",
  "result": "", "assigneeId": 9, "followUpRequired": false, "followUpNote": "",
  "attachmentNotes": "", "actionStatus": "PLANNED" }
```
`clientRequestId` is required (1 to 64 characters, letters, digits and hyphen). `actionAt` is optional and
defaults to now; it may not be later than 5 minutes after the server's clock. `description` is required
(1 to 2000). `assigneeId` is required and must be an active `IT_STAFF` user. `actionStatus` is optional and
defaults to `PLANNED`; it may be `PLANNED`, `IN_PROGRESS` or `COMPLETED` (`COMPLETED` needs a non-empty
`result`). A missing or non-integer `assigneeId` is `400`; an id that is not an active `IT_STAFF` user,
including one that does not exist, is `409 INVALID_ASSIGNEE`. `followUpRequired` defaults to `false`; when `true`, `followUpNote` must be non-empty. Any
`performedById`, `createdAt`, `version` or `ticketId` in the body is ignored (AC-05).

**201 Created** - the Action shape of §1, `version` 1, `performedBy` the signed-in user.

**200 OK** - the `clientRequestId` was already used on this Ticket by the same user: nothing is created and
the existing Action is returned in the same shape (BR-18, AC-15).

**400** - invalid or missing field, each named in `fieldErrors`:
```json
{ "error": "VALIDATION_FAILED", "message": "Fix the highlighted fields.",
  "fieldErrors": { "followUpNote": "Follow-up Note is required when a follow-up is needed." } }
```
**404** - Ticket does not exist. **409** - one of, in the order of specification BR-25:
```json
{ "error": "ACTIONS_LOCKED", "message": "Actions cannot be added while the ticket is Resolved, Closed or Cancelled." }
{ "error": "INVALID_ASSIGNEE", "message": "The assignee must be an active IT Staff user." }
{ "error": "DUPLICATE_REQUEST_KEY", "message": "This request key was already used by another user." }
```
**401/403** - per Lab 3 §0; a Requester gets `403 FORBIDDEN` (AC-07). **500** - standard shape.

## 3. `PATCH /api/staff/tickets/:id/actions/:actionId`

Purpose: edit an open Action, reassign it, or move its status (FR-02, FR-03, BR-04, BR-07 to BR-12, BR-16,
AC-03, AC-10 to AC-14). Auth: `IT_STAFF`, `ADMINISTRATOR`.

**Request** - `expectedVersion` plus at least one other field; any of `actionAt`, `description`, `result`,
`assigneeId`, `followUpRequired`, `followUpNote`, `attachmentNotes`, `actionStatus`.
```json
{ "expectedVersion": 2, "actionStatus": "COMPLETED", "result": "Battery now holds charge." }
```
The rules of §2 are applied to the Action as it would be after the change, so turning `followUpRequired`
on without a note is `400` even if only that field was sent. `performedById`, `ticketId`, `createdAt` and
`clientRequestId` cannot be changed and are ignored.

**200 OK** - the updated Action (§1 shape) with `version` increased by one, and the Ticket's `updatedAt`
touched (BR-14). **400** - `expectedVersion` missing or not an integer, no changeable field supplied, or a
field-level failure (`fieldErrors`). **404** - Ticket not found, or the Action does not exist on that
Ticket (`ACTION_NOT_FOUND`). **409** - one of, in this order:
```json
{ "error": "STALE_VERSION", "message": "This action was changed by someone else. Reload to see the latest version.", "currentVersion": 3 }
{ "error": "ACTION_LOCKED", "message": "A completed or cancelled action can no longer be changed." }
{ "error": "ACTIONS_LOCKED", "message": "Actions cannot be changed while the ticket is Resolved, Closed or Cancelled." }
{ "error": "INVALID_ACTION_TRANSITION", "message": "Cannot move an action from Planned to Planned." }
{ "error": "INVALID_ASSIGNEE", "message": "The assignee must be an active IT Staff user." }
```
The update is one statement of the form `UPDATE ... WHERE id = ? AND version = ?`; zero rows affected is
reported as `STALE_VERSION` (BR-16, AC-14). **401/403** - per Lab 3 §0. **500** - standard shape.

## 4. Changed: `PATCH /api/staff/tickets/:id/owner`, `/it-priority` and `/status`

Auth is unchanged: `IT_STAFF` only; an Administrator still receives `403` (Lab 3 BR-36, AC-06).

**Request additions (all three)** - `expectedVersion`, the Ticket `version` last seen. Examples:
```json
{ "ownerId": 6, "expectedVersion": 4 }
{ "itPriority": "HIGH", "expectedVersion": 4 }
{ "status": "RESOLVED", "resolutionSummary": "Replaced the battery under warranty.", "expectedVersion": 4 }
```
Missing or non-integer `expectedVersion` is `400` with `fieldErrors.expectedVersion` (AC-16). A change that
succeeds increments `Ticket.version` by one in the same conditional `UPDATE` and returns the updated Ticket
detail (§5), whose `version` and `allowedTransitions` are the new ones (BR-26, AC-22).

**Check order** for `/status` follows specification BR-25: `400` validation, `404`, `409 STALE_VERSION`,
`409 TICKET_CLOSED`, `409 INVALID_TRANSITION`, `409 OWNER_REQUIRED`, `409 RESOLUTION_BLOCKED`. `/owner` and
`/it-priority` follow the same order with their own rules from Lab 3 §11 and §12.

**New 409 bodies**
```json
{ "error": "STALE_VERSION", "message": "This ticket was changed by someone else. Reload to see the latest version.", "currentVersion": 5 }
{ "error": "RESOLUTION_BLOCKED", "message": "Finish or cancel the open actions, and complete at least one action, before resolving.",
  "blockers": ["OPEN_ACTIONS"], "openActionIds": [14, 15] }
```
`blockers` holds `OPEN_ACTIONS`, `NO_COMPLETED_ACTION`, or both (AC-17, AC-18). The Resolved gate runs inside
one transaction that locks the Ticket row (`SELECT ... FOR UPDATE`); Action writes lock the same row
(BR-21, AC-19).

**Cancel cascade (BR-22, AC-20).** A successful move to `CANCELLED` also sets every `PLANNED` and
`IN_PROGRESS` Action of the Ticket to `CANCELLED`, incrementing each Action's `version`, in the same
transaction. If the Result is empty it is set to "Cancelled automatically because the Ticket was cancelled."

## 5. Changed: `GET /api/staff/tickets/:id`

Same body as Lab 3 §9, plus:
```json
{ "version": 4,
  "actionCounts": { "open": 1, "completed": 2, "cancelled": 0 },
  "resolutionBlockers": ["OPEN_ACTIONS"] }
```
`resolutionBlockers` is the list of action-related reasons the Ticket could not be Resolved right now (empty
when none); owner and summary are not repeated there. The UI uses it only to explain a disabled Resolved
option; the backend gate of §4 remains the authority. Auth unchanged (`IT_STAFF` and `ADMINISTRATOR` read).
The Requester route `GET /api/tickets/:id` is unchanged.

## 6. Changed: list filters for drill-down

Both changes are additive and keep every existing parameter.

| Endpoint | Change |
|---|---|
| `GET /api/tickets` (Requester's My Tickets) | `status` now accepts any of the 8 `TicketStatus` values (Lab 2 accepted only `NEW`); new `active=true` (statuses `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `REOPENED`). `active` other than `true` is `400`. `status` and `active` may be sent together and both must match. |
| `GET /api/staff/tickets` (Ticket Queue) | new `active=true`, same meaning and validation. All Lab 3 parameters unchanged. |

Invalid values are `400 INVALID_QUERY` naming the parameter (AC-36). The Lab 2 test that asserts only `NEW` is
a valid `status` is updated to the new rule, not removed. `appliedFilters` in both responses gains
`"active": true|null`.

## 7. `GET /api/dashboard/requester`

Purpose: the signed-in Requester's summary (FR-12, BR-27, BR-28, BR-29, BR-32, BR-33, AC-02, AC-26 to AC-28).
Auth: `REQUESTER`. Scope is always the session's user id; any `requesterId` in the query is ignored (Lab 3
BR-03).

**200 OK**
```json
{
  "generatedAt": "2026-10-30T03:00:00.000Z",
  "metrics": { "openTickets": 3, "waitingForYou": 1, "resolved": 5, "closed": 12 },
  "attention": [ { "id": 42, "ticketNumber": "TKT-2026-000042", "summary": "Laptop battery drains quickly",
                   "currentStatus": "WAITING_FOR_REQUESTER", "itPriority": "MEDIUM",
                   "updatedAt": "2026-10-29T08:00:00.000Z" } ],
  "recent": [ { "id": 45, "ticketNumber": "TKT-2026-000045", "summary": "Need new monitor",
                "currentStatus": "IN_PROGRESS", "itPriority": "LOW", "updatedAt": "2026-10-30T02:10:00.000Z" } ]
}
```
Calculations (BR-29): `openTickets` = own Tickets in the active statuses; `waitingForYou` = own
`WAITING_FOR_REQUESTER`; `resolved` = own `RESOLVED`; `closed` = own `CLOSED`. `attention` = own
`WAITING_FOR_REQUESTER`, oldest `updatedAt` first, at most 5. `recent` = own Tickets of any status, newest
`updatedAt` first, then `id` descending, at most 5. With no Tickets: all four metrics `0` and both lists `[]`.
**401/403** - a staff or Administrator caller is `403 FORBIDDEN`. **500** - standard shape.

**Drill-down (client routes)**

| Card or list | Opens | Count equals the list total of |
|---|---|---|
| Open Tickets | `/tickets?active=true` | `GET /api/tickets?active=true` |
| Waiting for You | `/tickets?status=WAITING_FOR_REQUESTER` | `GET /api/tickets?status=WAITING_FOR_REQUESTER` |
| Resolved | `/tickets?status=RESOLVED` | `GET /api/tickets?status=RESOLVED` |
| Closed | `/tickets?status=CLOSED` | `GET /api/tickets?status=CLOSED` |
| A Ticket row in either list | `/tickets/:id` | n/a |
| "View all" on Recently Updated | `/tickets` | n/a |

## 8. `GET /api/dashboard/staff`

Purpose: the IT Staff operational summary, also read by Administrators (FR-13, FR-14, BR-27, BR-28, BR-30 to
BR-33, AC-25 to AC-30). Auth: `IT_STAFF`, `ADMINISTRATOR`.

**200 OK (IT Staff)**
```json
{
  "generatedAt": "2026-10-30T03:00:00.000Z", "role": "IT_STAFF",
  "statusCounts": { "NEW": 14, "OPEN": 23, "IN_PROGRESS": 18, "WAITING_FOR_REQUESTER": 7 },
  "unassigned": 5,
  "activeByPriority": { "URGENT": 2, "HIGH": 9, "MEDIUM": 30, "LOW": 21 },
  "personal": { "myAssigned": 16, "myOpenActions": 4 },
  "urgentTickets": [ { "id": 42, "ticketNumber": "TKT-2026-000042", "summary": "VPN down for finance",
                       "currentStatus": "OPEN", "itPriority": "URGENT",
                       "owner": { "id": 6, "fullName": "Michael Brown" }, "updatedAt": "2026-10-30T01:00:00.000Z" } ],
  "recentTickets": [ { "id": 45, "ticketNumber": "TKT-2026-000045", "summary": "Need new monitor",
                       "currentStatus": "IN_PROGRESS", "itPriority": "LOW", "owner": null,
                       "updatedAt": "2026-10-30T02:10:00.000Z" } ],
  "myActions": [ { "id": 14, "ticketId": 42, "ticketNumber": "TKT-2026-000042",
                   "description": "Check the VPN gateway logs.", "actionAt": "2026-10-30T02:00:00.000Z",
                   "actionStatus": "IN_PROGRESS", "followUpRequired": false } ],
  "accounts": null
}
```
For an `ADMINISTRATOR`: `"role": "ADMINISTRATOR"`, `personal` and `myActions` are `null` (BR-31), and
```json
"accounts": { "activeRequesters": 5, "activeItStaff": 3, "activeAdministrators": 1, "inactive": 2 }
```
Calculations (BR-30; "active" is BR-28): `statusCounts` counts all Tickets by that status;
`unassigned` = no owner and active; `activeByPriority` = active Tickets by `itPriority`;
`personal.myAssigned` = owner is the caller and active; `personal.myOpenActions` = Actions assigned to the
caller with status `PLANNED` or `IN_PROGRESS`. `urgentTickets` = active Tickets with `itPriority` `URGENT` or
`HIGH`, Urgent first, then oldest `updatedAt`, at most 5. `recentTickets` = any status, newest `updatedAt`
first, at most 5. `myActions` = the caller's open Actions by `actionAt`, then `id`, at most 5; `description`
is cut to 120 characters. Empty data gives `0` counts and `[]` lists. Internal Note text is never included.
**401/403** - a Requester is `403 FORBIDDEN`. **500** - standard shape.

**Drill-down (client routes)**

| Card or list | Opens | Count equals the list total of |
|---|---|---|
| New | `/staff/queue?status=NEW` | `GET /api/staff/tickets?status=NEW` |
| Open | `/staff/queue?status=OPEN` | `...?status=OPEN` |
| In Progress | `/staff/queue?status=IN_PROGRESS` | `...?status=IN_PROGRESS` |
| Waiting for Requester | `/staff/queue?status=WAITING_FOR_REQUESTER` | `...?status=WAITING_FOR_REQUESTER` |
| Unassigned | `/staff/queue?owner=unassigned&active=true` | `...?owner=unassigned&active=true` |
| My Assigned | `/staff/queue?owner=me&active=true` | `...?owner=me&active=true` |
| Urgent, High, Medium, Low | `/staff/queue?itPriority=<value>&active=true` | `...?itPriority=<value>&active=true` |
| My Open Actions | the list on the same page (each row opens `/staff/tickets/:id`) | no list screen |
| A Ticket row in any list | `/staff/tickets/:id` | n/a |
| Accounts (Administrator) | `/admin/users` | no equivalent count |

The Ticket Queue and My Tickets pages read `status`, `owner`, `itPriority` and `active` from the URL when
they open (FR-15).

## 9. Unchanged but re-verified

All Lab 1 to Lab 3 endpoints behave as documented, including `GET /api/health`, the Requester Ticket,
Attachment, Comment and "problem appears resolved" endpoints, the staff Queue, notes and assignable-users
endpoints, and the Administrator user endpoints. Where a Lab 3 request shape changed (§4, §6) the old tests
are updated in the PR that changes the behavior.

## 10. Error codes added in Lab 4, and status summary

| Code | Status | When |
|---|---|---|
| `STALE_VERSION` | 409 | `expectedVersion` differs from the stored version (Action or Ticket); body includes `currentVersion` |
| `RESOLUTION_BLOCKED` | 409 | Moving to Resolved while an Action is open or none is Completed; body includes `blockers` |
| `INVALID_ASSIGNEE` | 409 | Assignee is not an active IT Staff user |
| `INVALID_ACTION_TRANSITION` | 409 | Action status change not in the Action matrix |
| `ACTION_LOCKED` | 409 | Editing a Completed or Cancelled Action |
| `ACTIONS_LOCKED` | 409 | Creating or changing an Action while the Ticket is Resolved, Closed or Cancelled |
| `DUPLICATE_REQUEST_KEY` | 409 | `clientRequestId` already used by a different user on the Ticket |
| `ACTION_NOT_FOUND` | 404 | No such Action on that Ticket |

| Status | Meaning in Lab 4 |
|---|---|
| `200` | Retrieval, update, or an idempotent replay of an Action creation |
| `201` | Action Taken created |
| `400` | Missing or invalid field, missing `expectedVersion`, invalid query parameter |
| `401` / `403` | No session / role or password-change gate forbids it (unchanged from Lab 3) |
| `404` | Ticket or Action missing, or another Requester's Ticket (indistinguishable) |
| `409` | Conflict with current state: any code in the table above, or a Lab 3 conflict code |
| `500` | Unexpected failure; the body never leaks internal detail |
