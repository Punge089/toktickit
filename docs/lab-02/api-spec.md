# Lab 2 API Contract

All endpoints are prefixed `/api`. All responses are JSON. All Requester-scoped endpoints require the
`X-Dev-Requester-Id` header (see §0). This document is the source of truth for request/response shapes;
`specification.md` §5/§9 defines the business rules and acceptance criteria these endpoints satisfy.

## 0. Requester identity and shared conventions

Every endpoint under "Requester-scoped" below requires:

```
X-Dev-Requester-Id: <integer RequesterUser id>
```

| Condition | Status | Body |
|---|---|---|
| Header missing or not an integer | `400` | `{ "error": "MISSING_REQUESTER", "message": "X-Dev-Requester-Id header is required" }` |
| Header value does not match any RequesterUser | `400` | `{ "error": "UNKNOWN_REQUESTER", "message": "No Development Requester with that id" }` |
| Header resolves to an inactive RequesterUser | `403` | `{ "error": "REQUESTER_INACTIVE", "message": "This Development Requester is no longer active" }` |

**Standard error shape** (used for all 4xx/5xx unless noted otherwise):
```json
{ "error": "SHORT_CODE", "message": "human-readable, safe to display", "fieldErrors": { "summary": "..." } }
```
`fieldErrors` is present only on `400` validation failures and omitted otherwise. Unexpected server errors
always return `500 { "error": "INTERNAL_ERROR", "message": "Something went wrong. Please try again." }` —
never a raw stack trace or DB error message.

**Pagination metadata shape** (list endpoints):
```json
{ "page": 1, "pageSize": 10, "totalItems": 34, "totalPages": 4, "sort": "createdAt:desc" }
```

---

## 1. `GET /api/categories`

Purpose: active ticket categories for the Create Ticket dropdown and My Tickets filter.
Auth: none (reference data, not Requester-scoped).

**200 OK**
```json
[{ "id": 1, "name": "Account and Access" }, { "id": 2, "name": "Hardware" }]
```
Ordered by `id` asc. Only `isActive: true` rows. `500` on DB failure, per the standard shape.

## 2. `GET /api/related-systems`

Purpose: active related systems for Create Ticket and My Tickets filter.
Auth: none.

**200 OK**
```json
[{ "id": 1, "name": "Email" }, { "id": 2, "name": "Campus Wi-Fi" }]
```
Ordered by `id` asc. Only `isActive: true` rows. `500` on DB failure.

## 3. `GET /api/dev-requesters`

Purpose: active Development Requesters for the Requester Selection screen.
Auth: none (this endpoint is what makes selection possible in the first place).

**200 OK**
```json
[{ "id": 1, "fullName": "Aran Suksawat", "email": "aran.s@example.dev" }]
```
Ordered by `fullName` asc. Only `isActive: true` rows (BR-06). Empty array (not an error) when zero active
Requesters exist — the frontend renders the empty-selector state (AC-16) rather than treating `[]` as
failure. `500` on DB failure → frontend renders the failure state (AC-15).

## 4. `POST /api/tickets`

Purpose: create a Ticket for the selected Requester (BR-01–BR-04, AC-01, AC-04, AC-05).
Auth: Requester-scoped.

**Request** (`multipart/form-data` — allows optional attachments in the same request; see note below)
```
fields: summary, description, categoryId, relatedSystemId, requestedPriority
files:  attachments[] (0–5 files, each ≤5MB, jpg/jpeg/png/webp/pdf)
```
Field constraints: `summary` trimmed 5–120 chars · `description` trimmed 20–4000 chars · `categoryId` /
`relatedSystemId` must reference active rows · `requestedPriority` ∈ `LOW|MEDIUM|HIGH|URGENT`.

**201 Created**
```json
{
  "id": 42, "ticketNumber": "TKT-2026-000042", "requesterId": 7,
  "summary": "Laptop battery drains quickly", "description": "...", "categoryId": 2,
  "relatedSystemId": 7, "requestedPriority": "MEDIUM", "itPriority": null,
  "currentStatus": "NEW", "createdAt": "2026-08-24T10:15:00.000Z", "updatedAt": "2026-08-24T10:15:00.000Z",
  "attachments": [{ "id": 5, "originalFilename": "battery.jpg", "acceptedFor": "upload succeeded" }],
  "attachmentErrors": []
}
```
If one or more attached files fail validation (bad type/size) or fail to save while the Ticket itself is
valid, the Ticket is still created (BR-19); the response is still `201`, `attachmentErrors` lists which files
failed and why, and the client shows a partial-success message directing the Requester to Ticket Detail
to retry those files. This is the one endpoint where per-item failure does not change the top-level status
code, because the Ticket resource itself was created successfully.

**400 Bad Request** — Ticket-level validation failure (nothing saved):
```json
{ "error": "VALIDATION_FAILED", "message": "Fix the highlighted fields.",
  "fieldErrors": { "summary": "Summary must be 5–120 characters.", "categoryId": "Select a category." } }
```
**403** — inactive Requester (§0). **500** — standard shape.

Note on transport: Create Ticket is `multipart/form-data` rather than JSON specifically because it
optionally carries files in the same request as the initial submission — this is the one endpoint in the
contract that isn't plain JSON, and it is called out here explicitly for that reason.

## 5. `GET /api/tickets`

Purpose: the selected Requester's own tickets — searchable, filterable, sortable, paginated
(BR-11–BR-13, AC-10–AC-14).
Auth: Requester-scoped.

**Query parameters**

| Param | Values | Default | Invalid-value behavior |
|---|---|---|---|
| `search` | free text, matched against `ticketNumber` + `summary` | — (no filter) | none possible, any string is valid |
| `categoryId` | integer | — | non-integer → `400` |
| `relatedSystemId` | integer | — | non-integer → `400` |
| `requestedPriority` | `LOW\|MEDIUM\|HIGH\|URGENT` | — | other value → `400` |
| `status` | `NEW` (only value in Lab 2) | — | other value → `400` |
| `sort` | `createdAt:asc\|createdAt:desc\|updatedAt:asc\|updatedAt:desc\|ticketNumber:asc\|ticketNumber:desc\|requestedPriority:asc\|requestedPriority:desc` | `createdAt:desc` | other value → `400` |
| `page` | integer ≥1 | `1` | <1, non-integer, or beyond `totalPages` → `400` |
| `pageSize` | `10\|20\|50` | `10` | other value → `400` |

`400` body names the offending parameter and its accepted values, e.g.
`{ "error": "INVALID_QUERY", "message": "pageSize must be 10, 20, or 50.", "fieldErrors": { "pageSize": "..." } }`
(BR-13 — never silently clamps or ignores an invalid value).

**200 OK**
```json
{
  "data": [{ "id": 42, "ticketNumber": "TKT-2026-000042", "summary": "Laptop battery drains quickly",
             "categoryId": 2, "categoryName": "Hardware", "requestedPriority": "MEDIUM",
             "currentStatus": "NEW", "createdAt": "...", "updatedAt": "..." }],
  "meta": { "page": 1, "pageSize": 10, "totalItems": 3, "totalPages": 1, "sort": "createdAt:desc",
            "appliedFilters": { "search": null, "categoryId": null, "relatedSystemId": null,
                                 "requestedPriority": null, "status": null } }
}
```
Results always scoped to the requesting Requester's own `requesterId` (BR-09); this is not a filter the
client can override. Secondary sort is always `id:desc` (BR-12) — not exposed as a parameter. Empty
`data` with no filters/search active means the empty state (AC-12); empty `data` with any filter/search
active means the no-results state (AC-11) — the frontend distinguishes these using `appliedFilters`.

## 6. `GET /api/tickets/:id`

Purpose: one owned Ticket's full detail, including its attachments (AC-03, BR-10, BR-28).
Auth: Requester-scoped.

**200 OK**
```json
{
  "id": 42, "ticketNumber": "TKT-2026-000042", "requesterId": 7, "requesterName": "Aran Suksawat",
  "summary": "...", "description": "...", "categoryId": 2, "categoryName": "Hardware",
  "relatedSystemId": 7, "relatedSystemName": "Corporate Laptop", "requestedPriority": "MEDIUM",
  "itPriority": null, "currentStatus": "NEW", "createdAt": "...", "updatedAt": "...",
  "attachments": [
    { "id": 5, "originalFilename": "battery.jpg", "mimeType": "image/jpeg", "sizeBytes": 812344,
      "uploadedAt": "...", "removedAt": null, "removalReason": null },
    { "id": 6, "originalFilename": "old-log.pdf", "mimeType": "application/pdf", "sizeBytes": 40211,
      "uploadedAt": "...", "removedAt": "2026-08-24T11:00:00.000Z", "removalReason": "Wrong file, replaced by battery.jpg" }
  ]
}
```
**404 Not Found** — `id` does not exist, *or* exists but belongs to a different Requester (BR-10):
```json
{ "error": "TICKET_NOT_FOUND", "message": "Ticket not found." }
```
Both cases return the identical body and status — this is intentional (§9 AC-03), so a client cannot
distinguish "no such ticket" from "not yours." **403** — inactive Requester. **500** — standard shape.

## 7. `POST /api/tickets/:id/attachments`

Purpose: add a permitted attachment to an existing, owned Ticket (BR-20–BR-25, AC-06, AC-07).
Auth: Requester-scoped. Only the Ticket's owner may call this.

**Request** `multipart/form-data`, single field `file` (one file per call).

**201 Created**
```json
{ "id": 9, "ticketId": 42, "originalFilename": "screenshot.png", "mimeType": "image/png",
  "sizeBytes": 214000, "uploadedAt": "..." }
```
**400** — missing file part. **404** — Ticket not found / not owned (same as §6). **409 Conflict** — Ticket
already has 5 active attachments (BR-21):
```json
{ "error": "ATTACHMENT_LIMIT_REACHED", "message": "This ticket already has 5 active attachments." }
```
**413 Payload Too Large** — file exceeds 5 MB. **415 Unsupported Media Type** — extension/MIME type not
in the allowed set (BR-20). **500** — standard shape.

## 8. `GET /api/attachments/:id`

Purpose: one attachment's metadata (used by Ticket Detail; also independently testable).
Auth: Requester-scoped. Only the parent Ticket's owner may call this.

**200 OK** — same attachment shape as embedded in §6, for both active and removed attachments (BR-23
— metadata always visible). **404** — attachment does not exist, or its parent Ticket is not owned by the
requesting Requester (same non-distinguishing behavior as §6). **500** — standard shape.

## 9. `GET /api/attachments/:id/download`

Purpose: stream the file bytes of an active attachment (BR-23, AC-08).
Auth: Requester-scoped. Only the parent Ticket's owner may call this.

**200 OK** — binary stream, `Content-Type` = stored `mimeType`, `Content-Disposition: attachment;
filename="<originalFilename>"`. **404** — attachment/ticket not found or not owned. **410 Gone** —
attachment exists, is owned, but `removedAt` is not null:
```json
{ "error": "ATTACHMENT_REMOVED", "message": "This attachment has been removed and is no longer available." }
```
`410` is deliberately distinct from `404` here — the client already knows the attachment exists (it's
listed in Ticket Detail with a "removed" badge); the failure is "it existed but is gone," not "unknown
resource." **500** — standard shape.

## 10. `DELETE /api/attachments/:id`

Purpose: soft-remove an active attachment (BR-22–BR-24, AC-09).
Auth: Requester-scoped. Only the parent Ticket's owner may call this.

**Request body**
```json
{ "removalReason": "Wrong file, replaced by battery.jpg" }
```
`removalReason` required, trimmed, 5–200 chars (BR-24).

**200 OK**
```json
{ "id": 6, "removedAt": "2026-08-24T11:00:00.000Z", "removalReason": "Wrong file, replaced by battery.jpg" }
```
**400** — missing/too-short/too-long `removalReason`. **404** — attachment/ticket not found or not
owned. **409 Conflict** — attachment is already removed (`removedAt` already set):
```json
{ "error": "ALREADY_REMOVED", "message": "This attachment was already removed." }
```
**500** — standard shape.

## 11. HTTP status code summary

| Status | Meaning in this API |
|---|---|
| `200` | Successful retrieval, list, or soft-removal. |
| `201` | Ticket or Attachment created. |
| `400` | Malformed input: missing/invalid field, missing/invalid header, invalid query param. |
| `403` | Requester identity resolved but is inactive (BR-26). |
| `404` | Resource does not exist, or exists but is not owned by the requesting Requester (BR-10, BR-28) — deliberately indistinguishable from the client's point of view. |
| `409` | Request conflicts with current resource state (attachment limit reached; attachment already removed). |
| `410` | Resource existed, is still visible as metadata, but its underlying file is intentionally gone (removed attachment download). |
| `413` | Uploaded file exceeds the 5 MB limit. |
| `415` | Uploaded file's type is not in the allowed set. |
| `500` | Unexpected server-side failure; body never leaks internal detail. |
