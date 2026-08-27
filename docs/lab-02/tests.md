# Lab 2 Test Plan and Results

This plan is written before implementation, per Test DD (labsheet §9). Every row is planned first; the
**Result** column starts as "Planned" and is updated to Pass/Fail only after the test actually runs — this
file is not reconstructed from whatever the coding agent happened to generate.

## 1. Test Strategy

Six levels, matching labsheet §9.2: unit (pure logic, no DB/network), API/integration (Supertest against a
real test database), UI component (Vitest + React Testing Library, mocked network via `msw`), UI style
(assert on required classes/attributes, not pixels), responsive (Playwright screenshots at 3 viewports),
and E2E (Playwright, full stack, real Requester-switch and attachment-removal flow). Every Acceptance
Criterion in `specification.md` §9 maps to at least one row below.

## 2. Planned Tests

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Result |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-01 | Ticket number format `TKT-YYYY-NNNNNN` | Matches regex, correct year | `server/tests/lab-02/ticket-number.unit.test.ts` | **Pass** |
| UNIT-02 | Unit | BR-01 | 20 concurrent ticket-number generations in the same year | All 20 numbers unique | `server/tests/lab-02/ticket-number.unit.test.ts` | **Pass** |
| UNIT-03 | Unit | BR-20 | File-type allowlist checker | Accepts jpg/jpeg/png/webp/pdf; rejects gif/exe/txt | `server/tests/lab-02/attachment-rules.unit.test.ts` | **Pass** |
| UNIT-04 | Unit | BR-21 | File-size boundary checker | Exactly 5MB passes; 5MB+1byte rejected | `server/tests/lab-02/attachment-rules.unit.test.ts` | **Pass** |
| UNIT-05 | Unit | BR-25 | Stored-filename generator | Output is a UUID + validated extension, never contains the original filename | `server/tests/lab-02/attachment-rules.unit.test.ts` | **Pass** |
| UNIT-06 | Unit | Issue #22 AC | Seed idempotency: run `seedAll()` twice against the test DB | Second run changes no row counts; 4 categories, ≥6 related systems, ≥4 active + ≥1 inactive Requester all present | `server/tests/lab-02/seed.unit.test.ts` | **Pass** |
| API-01 | API | AC-01 | `POST /api/tickets` valid payload | `201`; response has `ticketNumber`; row exists in DB with `currentStatus=NEW` | `server/tests/lab-02/create-ticket.api.test.ts` | **Pass** |
| API-02 | API | AC-04, BR-14–17 | `POST /api/tickets` missing `summary` | `400`; `fieldErrors.summary` present; no row created | `server/tests/lab-02/create-ticket.api.test.ts` | **Pass** |
| API-03 | API | BR-14 | `summary` at 4 and 121 chars (boundary) | Both `400`; 5 and 120 chars both `201` | `server/tests/lab-02/create-ticket.api.test.ts` | **Pass** |
| API-04 | API | BR-15 | `categoryId` referencing an inactive Category | `400` | `server/tests/lab-02/create-ticket.api.test.ts` | **Pass** |
| API-05 | API | §0, BR-26 | Request with inactive Requester header | `403` | `server/tests/lab-02/create-ticket.api.test.ts` | **Pass** |
| API-06 | API | BR-19 | Create with one valid + one oversized attachment | `201`; ticket saved; `attachmentErrors` lists the oversized file | `server/tests/lab-02/create-ticket.api.test.ts` | **Pass** |
| API-07 | API | AC-10, BR-09 | `GET /api/tickets` as Requester A vs Requester B | Each sees only their own tickets | `server/tests/lab-02/my-tickets.api.test.ts` | **Pass** |
| API-08 | API | BR-11 | `search=` matching a `ticketNumber` and separately a `summary` substring | Both return the matching ticket; unrelated tickets excluded | `server/tests/lab-02/my-tickets.api.test.ts` | **Pass** |
| API-09 | API | BR-12 | Two tickets with identical `createdAt`, sorted by `createdAt:desc` twice | Row order identical both times (secondary `id:desc` holds) | `server/tests/lab-02/my-tickets.api.test.ts` | **Pass** |
| API-10 | API | AC-13, BR-13 | `pageSize=7` and `page=999` | Both `400`, naming the invalid parameter | `server/tests/lab-02/my-tickets.api.test.ts` | **Pass** |
| API-11 | API | AC-11, AC-12 | List with 0 tickets ever vs. 0 tickets matching an active filter | `meta.appliedFilters` distinguishes the two cases correctly | `server/tests/lab-02/my-tickets.api.test.ts` | **Pass** |
| API-12 | API | AC-03, BR-10 | `GET /api/tickets/:id` for another Requester's ticket | `404`, identical body to a nonexistent id | `server/tests/lab-02/ticket-detail.api.test.ts` | **Pass** |
| API-13 | API | FR-05 | `GET /api/tickets/:id` for own ticket | `200`; includes nested `attachments` array | `server/tests/lab-02/ticket-detail.api.test.ts` | **Pass** |
| API-14 | API | AC-06, BR-21 | `POST .../attachments` on a ticket that already has 5 active attachments | `409 ATTACHMENT_LIMIT_REACHED`; count stays 5 | `server/tests/lab-02/attachments.api.test.ts` | **Pass** |
| API-15 | API | AC-07, BR-20 | Upload a `.exe` renamed to `.png` (mismatched magic bytes/mimetype) | `415`; not saved | `server/tests/lab-02/attachments.api.test.ts` | **Pass** |
| API-16 | API | AC-09, BR-22–24 | `DELETE /api/attachments/:id` with a valid reason on an owned, active attachment | `200`; `removedAt` set; active count decreases by 1 | `server/tests/lab-02/attachments.api.test.ts` | **Pass** |
| API-17 | API | BR-24 | `DELETE /api/attachments/:id` with `removalReason` = `"ok"` (4 chars) | `400` (below 5-char minimum) | `server/tests/lab-02/attachments.api.test.ts` | **Pass** |
| API-18 | API | AC-08, BR-23 | `GET /api/attachments/:id/download` on a removed attachment | `410 ATTACHMENT_REMOVED` | `server/tests/lab-02/attachments.api.test.ts` | **Pass** |
| API-19 | API | §10 (ownership, general) | Requester B calls add/download/remove-attachment on Requester A's ticket's attachment | `404` for all three, no data leaked or mutated | `server/tests/lab-02/attachments.api.test.ts` | **Pass** |
| API-20 | API | FR-01, BR-06 | `GET /api/dev-requesters` with one active + one inactive seeded Requester | Only the active one is returned | `server/tests/lab-02/reference.api.test.ts` | **Pass** |
| API-21 | API | Issue #24 AC | `GET /api/categories` with one category deactivated | Deactivated category excluded; 500 on simulated DB failure | `server/tests/lab-02/reference.api.test.ts` | **Pass** |
| API-22 | API | Issue #24 AC | `GET /api/related-systems` success + simulated DB failure | ≥6 active systems, ordered by id; 500 on simulated DB failure | `server/tests/lab-02/reference.api.test.ts` | **Pass** |
| UI-01 | UI component | AC-02 | Visiting `/tickets` with no Requester selected | Redirected to `/select-requester` | `client/tests/lab-02/RequesterSelect.test.tsx` | **Pass** |
| UI-02 | UI component | AC-16 | Requester Selection screen, mocked empty active-Requester list | Empty-state message shown; dropdown and Continue are not rendered at all (not merely disabled) | `client/tests/lab-02/RequesterSelect.test.tsx` | **Pass** |
| UI-03 | UI component | AC-15 | Requester Selection screen, mocked API failure | Failure callout + Retry button shown | `client/tests/lab-02/RequesterSelect.test.tsx` | **Pass** |
| UI-04 | UI component | AC-04 | Create Ticket submitted with empty `summary` | Field-level message renders under Summary; no POST fired | `client/tests/lab-02/CreateTicket.test.tsx` | **Pass** |
| UI-05 | UI component | AC-05, BR-18 | Create Ticket submit, mocked network failure | Failure banner shown; all typed field values still present | `client/tests/lab-02/CreateTicket.test.tsx` | **Pass** |
| UI-06 | UI component | §6 (Submitting state) | Click Submit with a slow mocked response | Button shows busy state and is disabled for the duration | `client/tests/lab-02/CreateTicket.test.tsx` | **Pass** |
| UI-07 | UI component | AC-01 | Create Ticket submit, mocked success | Confirmation panel shows the returned Ticket Number | `client/tests/lab-02/CreateTicket.test.tsx` | **Pass** |
| UI-08 | UI component | AC-07 | Select an 8MB file in the attachment picker | Rejected client-side before any request; message names the size limit | `client/tests/lab-02/CreateTicket.test.tsx` | **Pass** |
| UI-09 | UI component | AC-11 vs AC-12 | My Tickets: mocked 0-tickets-ever vs. mocked 0-matches-with-filter | Distinct empty-state and no-results copy render for each case | `client/tests/lab-02/MyTickets.test.tsx` | **Pass** |
| UI-10 | UI component | AC-10 | My Tickets rendered, then Requester context switched | List refetches and old Requester's rows are gone | `client/tests/lab-02/MyTickets.test.tsx` | **Pass** |
| UI-11 | UI component | §7 (pagination) | Change page-size control | Triggers a refetch with the new `pageSize`; page resets to 1 | `client/tests/lab-02/MyTickets.test.tsx` | **Pass** |
| UI-12 | UI component | AC-03, BR-10/28 | Ticket Detail, mocked `404` from the API | "Ticket not found." message with a link back to My Tickets | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | **Pass** |
| UI-13 | UI component | §8 (attachments list) | Ticket Detail with 1 active + 1 removed attachment mocked | Active row has a working Download button; removed row shows its `removalReason` instead of action buttons | `client/tests/lab-02/AttachmentSection.test.tsx` | **Pass** |
| UI-14 | UI component | AC-09 | Click Remove on an active attachment, submit without typing a reason | Client-side validation blocks submission; no DELETE fired | `client/tests/lab-02/AttachmentSection.test.tsx` | **Pass** |
| UI-15 | UI component | AC-09 | Remove an attachment with a valid reason, mocked success | Attachment row updates to Removed badge + shows the reason | `client/tests/lab-02/AttachmentSection.test.tsx` | **Pass** |
| STYLE-01 | UI style | §1, §3 | Required field renders | Has the asterisk element AND `aria-required="true"` (not just one) | `client/tests/lab-02/zen-green.style.test.tsx` | **Pass** |
| STYLE-02 | UI style | §3 | Read-only field (Ticket Number on Create Ticket) | Has the read-only field class/token, distinct from an editable field's class | `client/tests/lab-02/zen-green.style.test.tsx` | **Pass** |
| STYLE-03 | UI style | §3 | Disabled button | Has `disabled` attribute and the disabled visual class; click handler does not fire | `client/tests/lab-02/zen-green.style.test.tsx` | **Pass** |
| STYLE-04 | UI style | §3 | Icon-only control (attachment remove trash icon) | Has an `aria-label` and a `title` | `client/tests/lab-02/zen-green.style.test.tsx` | N/A — Issue 31's Remove/Download ended up as labeled text buttons, not icon-only controls, so this rule doesn't apply to them; the underlying aria-label+title pattern stays proven on the nav hamburger from Issue 23 |
| STYLE-05 | UI style | §3 | Invalid field | Error message element's `id` matches the field's `aria-describedby` | `client/tests/lab-02/zen-green.style.test.tsx` | **Pass** |
| RESP-01 | Responsive | AC-17, §9 | Create Ticket at 375/850/1280px, 4 states each (initial/validation/success/failure) | No horizontal scroll at any width; 12 screenshots saved | `e2e/lab-02/responsive.spec.ts` | **Pass** |
| RESP-02 | Responsive | AC-17, §9 | My Tickets at 375/850/1280px, 3 states each (loaded/empty/no-results) | Table reflows to cards via CSS grid alone; no horizontal scroll; 9 screenshots saved | `e2e/lab-02/responsive.spec.ts` | **Pass** |
| RESP-03 | Responsive | AC-17, §9 | Ticket Detail at 375/850/1280px, 2 states each (loaded/attachment-removed) | Header/attachment sections both fully visible, no clipped filenames; 6 screenshots saved | `e2e/lab-02/responsive.spec.ts` | **Pass** |
| E2E-01 | E2E | AC-01, AC-10 | Select Requester A → create a ticket with one attachment → find it in My Tickets | Ticket Number from creation matches the row opened from My Tickets | `e2e/lab-02/requester-ticket-flow.spec.ts` | **Pass** |
| E2E-02 | E2E | AC-09 | From the created ticket's Detail screen, remove its attachment with a reason | Attachment shows Removed badge; Download button gone | `e2e/lab-02/requester-ticket-flow.spec.ts` | **Pass** |
| E2E-03 | E2E | AC-03, AC-10 | Switch to Requester B | Requester A's ticket is absent from B's My Tickets; direct navigation to A's ticket URL shows "Ticket not found." | `e2e/lab-02/requester-ticket-flow.spec.ts` | **Pass** |

## 3. Acceptance-Criterion Traceability

| AC | Covered by |
|---|---|
| AC-01 | API-01, UI-07, E2E-01 |
| AC-02 | UI-01 |
| AC-03 | API-12, UI-12, E2E-03 |
| AC-04 | API-02, UI-04 |
| AC-05 | UI-05 |
| AC-06 | API-14 |
| AC-07 | API-15, UI-08 |
| AC-08 | API-18, UI-13 |
| AC-09 | API-16, UI-14, UI-15, E2E-02 |
| AC-10 | API-07, UI-10, E2E-01, E2E-03 |
| AC-11 | API-11, UI-09 |
| AC-12 | API-11, UI-09 |
| AC-13 | API-10 |
| AC-14 | API-09 |
| AC-15 | UI-03 |
| AC-16 | UI-02 |
| AC-17 | RESP-01, RESP-02, RESP-03 |
| AC-18 | STYLE-01, STYLE-05 |

## 4. Responsive and Visual Checklist

`e2e/lab-02/responsive.spec.ts` has produced all 27 screenshots listed in `ui-spec.md` §12 — 12 for
Create Ticket, 9 for My Tickets, 6 for Ticket Detail (see RESP-01/02/03 above). The checklist itself
lives in `ui-spec.md` §11 and is now checked off against those real screenshots, dated 2026-08-27.

## 5. Test Commands

```bash
# unit + API (Vitest + Supertest, uses server/.env.test)
cd server && npm test

# UI component + UI style (Vitest + React Testing Library)
cd client && npm test

# responsive + E2E (Playwright, run from repo root, needs both dev servers running
# or a configured webServer in playwright.config.ts)
npx playwright test
```

## 6. Final Results

Run from `lab2-staging` after Issue #32 merged, 2026-08-27, using the commands in §5 (all against real
databases — the test DB for server/client, the real dev DB + servers for Playwright):

```
server:     Test Files  10 passed (10)   Tests  45 passed (45)
client:     Test Files   7 passed (7)    Tests  31 passed (31)
playwright:            28 passed (28)    (1 flow spec + 27 responsive/visual, run twice for stability)
```

Every Acceptance Criterion in `specification.md` §9 has at least one Pass row above (see the traceability
matrix in §3). No test is skipped, `.only`'d, or commented out.

**Superseded by the identical re-run from `main`** after the Lab 2 release Pull Request
(`lab2-staging` → `main`) is merged — see the commit referenced in `docs/lab-02/reviewer.md` / the
submission PDF's Part 3 for that final confirmation run.

## 7. Known Limitations or Deferred Tests

- Concurrency test (UNIT-02) exercises 20 parallel calls in-process; it does not simulate true
  multi-process contention, which is a reasonable scope limit for a course lab's ticket-number generator.
- Accessibility testing is limited to programmatic assertions (labels, `aria-*`, keyboard operability) via
  RTL/Playwright; a full screen-reader pass is out of scope for Lab 2.
- Load/performance testing of the paginated ticket list is out of scope; only correctness of pagination
  metadata and boundaries is tested.
