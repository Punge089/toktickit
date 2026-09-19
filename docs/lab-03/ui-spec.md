# Lab 3 Zen Green UI Specification

Extends `docs/lab-02/ui-spec.md`, which stays the source of truth for tokens, typography, spacing, field/
button states, and the base badge system — none of that is repeated here except where Lab 3 adds to it.
Governs Login, Change Password, the role-aware application shell, Requester Ticket Detail's new
Comments/Resolved section, IT Staff Ticket Queue, IT Staff Ticket Detail, Administrator User Management,
Forbidden, and Not Found.

## 1. New tokens and badge palettes

No new color tokens are introduced — every new badge and surface reuses the Lab 2 token set
(`--zen-primary`, `--zen-secondary`, `--zen-pale`, `--zen-error`, `--zen-error-bg`, `--zen-warning`,
`--zen-warning-bg`, `--zen-success`, `--zen-success-bg`, plus text/border/surface tokens), so the app
stays one visual system rather than gaining a second palette for Lab 3.

**Status badges** (8 values)

| Status | Palette |
|---|---|
| New | neutral gray-green pill |
| Open | `--zen-secondary` pill |
| In Progress | `--zen-warning` pill |
| Waiting for Requester | `--zen-warning` pill, outlined (distinguishes from In Progress at a glance) |
| Resolved | `--zen-success` pill |
| Closed | neutral gray pill (same family as Attachment "Removed" — a closed/removed state is final, not a fault) |
| Reopened | `--zen-error` pill, outlined (draws attention without implying it is currently broken beyond repair) |
| Cancelled | neutral gray pill, struck-through label text |

**IT Priority badges**: same palette as Requested Priority in Lab 2 (LOW neutral, MEDIUM `--zen-warning`,
HIGH/URGENT `--zen-error`) so a reader recognizes the severity language immediately; the two badges sit
side by side in the Queue and Detail so they are still individually labeled ("Req: Medium" / "IT: High"),
never color-only ambiguous.

**Role badges**

| Role | Palette |
|---|---|
| Requester | neutral gray-green pill |
| IT Staff | `--zen-secondary` pill |
| Administrator | `--zen-primary` pill |

**"Requester reports resolved" indicator**: a small `--zen-success`-colored inline tag with a checkmark
icon and text, shown next to the status badge in both the Queue row and Ticket Detail header whenever
`requesterResolvedAt` is set — never replaces the actual status badge, since BR-05 means it is
informational, not a status.

## 2. Application shell (role-aware)

- Header bar unchanged in structure from Lab 2 (TokTickIT wordmark left, nav center-left, identity
  right), but its contents now depend on role:
  - **Requester**: nav shows "My Tickets" / "Create Ticket". Identity area shows full name + Requester
    role badge, a chevron-triggered dropdown with "Change Password" and "Log Out".
  - **IT Staff**: nav shows "My Queue" (the Ticket Queue) / "Create Ticket" is not shown (IT Staff do not
    file their own tickets in Lab 3). Same identity dropdown, IT Staff role badge.
  - **Administrator**: nav shows "Users". Same identity dropdown, Administrator role badge.
- While a user must still change their password (`mustChangePassword`), the nav and the mobile menu button
  are not rendered at all: every destination would only bounce them back to Change Password (AC-02). Their
  name, role and the Log Out action stay.
- No route destination for a role the current user cannot use is ever rendered in the nav — this is
  presentation only; the backend enforces the same restriction independently (§5a of specification.md).
- The shell renders only after `/api/auth/me` resolves; while it is pending, a skeleton header (no nav
  links yet) avoids flashing the wrong role's navigation.
- Visiting any route while unauthenticated redirects to `/login`, preserving the intended destination so
  a successful login returns the user there (except when that destination itself requires a role the user
  doesn't have, which instead lands on Forbidden).

## 3. Screen: Login

Route: `/login`.

Elements top to bottom: TokTockIT title · email field · password field (masked, with a show/hide toggle
matching the mockup) · inline error region · primary "Sign In" button · no "Forgot your password?" link
(deliberately omitted — see specification.md §11 Assumptions).

| State | Presentation |
|---|---|
| Initial | both fields empty, Sign In enabled (client-side required-field check runs on submit, not before) |
| Submitting | Sign In shows busy state (§3 of Lab 2 ui-spec), both fields become read-only for the duration |
| Invalid credentials | `--zen-error` inline alert: "Invalid email or password. Please try again." — identical wording whether the email doesn't exist or the password is wrong (AC-05) |
| Inactive account | `--zen-error` inline alert: "This account is inactive. Contact your administrator." — never says whether the password was otherwise correct beyond that one line (AC-06) |
| Rate-limited | `--zen-warning` inline alert: "Too many attempts. Please wait a few minutes and try again." (AC-07) |
| API failure | `--zen-error` inline alert, generic safe-failure copy, entered email preserved (password field always clears on any failed submit, so a failed attempt never leaves a password sitting in the DOM) |
| Success | redirect to the mandatory Change Password screen (if `mustChangePassword`) or to the role's home route |

## 4. Screen: Change Password

Route: `/change-password`. Reachable both as the mandatory first-login flow and later as a voluntary
"Change Password" action from the shell dropdown.

Elements: current (temporary) password · new password · confirm new password · a live checklist mirroring
BR-08 (length, uppercase, lowercase, digit, special character) that ticks each rule green as it's
satisfied, matching the mockup · primary "Continue" (first-login) or "Save" (voluntary) button.

| State | Presentation |
|---|---|
| Initial | checklist all unmet (neutral), Continue/Save disabled until every rule is met and confirm matches |
| Validation failure | field-level message under the offending field (e.g. "Current password is incorrect.") |
| Submitting | busy state on the button, fields read-only |
| Success (first-login) | redirect straight into the role's home route — no separate confirmation screen, since the labsheet mockup shows continuation directly into the app |
| Success (voluntary) | inline success banner, form fields cleared |
| API failure | safe failure banner, entered values preserved except the password fields (never re-displayed after a failed submit) |

A user with `mustChangePassword = true` who navigates elsewhere is redirected back here (backend also
enforces this via `PASSWORD_CHANGE_REQUIRED` on every other endpoint — §0 of api-spec.md).

## 5. Screen: Forbidden / Not Found

Routes: rendered in place of any screen the current role cannot reach (Forbidden) or an unmatched route
(Not Found). Both are simple centered panels: an icon, one sentence ("You don't have access to this
page." / "That page doesn't exist."), and a primary button back to the current role's home route. Neither
screen fetches any protected data — the redirect happens before any API call for the target screen fires
(AC-11).

## 6. Screen: Requester Ticket Detail (additions)

Extends `docs/lab-02/ui-spec.md` §8 — the read-only header and Attachments section are unchanged. Added
below Attachments:

- **"Problem Appears Resolved" action**: a secondary button, visible only while the Ticket's status is
  New/Open/In Progress/Waiting for Requester/Reopened and `requesterResolvedAt` is not yet set. Clicking
  opens a one-line confirmation ("Let IT Staff know you think this is fixed?") before submitting, per the
  Lab 2 confirmation pattern used for destructive/important actions. Once set, the button is replaced by
  the "Requester reports resolved" indicator (§1) — never both shown at once.
- **Public Comments section**: a composer (textarea + "Post Comment" primary button, disabled while
  empty or while a post is in flight) above a chronological list of comments, each showing author name,
  a small role tag, body (plain text, `white-space: pre-wrap`), and a relative + absolute timestamp on
  hover. No edit/delete controls anywhere (BR-24).
- Comments and the Resolved action are hidden (not merely disabled) once the Ticket is Closed or
  Cancelled, replaced by a one-line note: "This ticket is closed. Comments can no longer be added."

## 7. Screen: IT Staff Ticket Queue

Route: `/staff/queue`.

**Controls row**: search input (debounced) · Status filter · IT Priority filter · Category filter · Owner
filter (`Me` / `Unassigned` / a named IT Staff member) · Sort `<select>` · "Clear filters" tertiary button
(shown only when a filter/search is active). On screens <992px, all filters collapse behind a "Filters"
disclosure button (mockup shows this collapsed by default even on desktop; Lab 3 keeps filters visible on
desktop for discoverability and collapses only below the table breakpoint, a documented deviation for
usability, noted in the Deliberate Omissions/Deviations list below).

**Desktop (≥992px): table.** Columns — Ticket No., Created Date, Summary (truncated + tooltip), Category,
Req. Priority (badge), IT Priority (badge), Status (badge + resolved-indicator), Owner (name or
"Unassigned" in muted italic), Last Updated, and an "Open" action per row — matching the mockup's column
set (labsheet §8.3 example fields) and justified by the same reasoning as Lab 2's My Tickets: exactly the
fields IT Staff need to triage without opening a ticket.

**Tablet/Mobile (<992px): cards**, one per Ticket — Ticket No. + Status/Priority badges on the top line,
Summary below, Owner + Last Updated on the bottom line, full card tappable to open Detail. Chosen over a
horizontally-scrolling table specifically to satisfy the no-horizontal-scroll rule at 375px with 9 pieces
of information per row.

**Pagination**: identical control to Lab 2 My Tickets (page-size select + numbered pager + "Showing x to y
of z").

| State | Presentation |
|---|---|
| Loading | skeleton rows/cards |
| Loaded, has results | table/cards as above |
| Empty (queue has zero Tickets at all) | centered message: "No tickets yet." |
| No results (filters active, 0 matches) | centered message referencing active filters + "Clear filters" |
| Forbidden (non-staff role reaching this route) | not reachable — redirected before render (§5) |
| API failure | warning callout + Retry, list area otherwise blank |

## 8. Screen: IT Staff Ticket Detail

Route: `/staff/tickets/:id`.

**Layout** mirrors the mockup: a read-only identification block (Ticket No., Category, Related System,
Requester, Requested Priority) beside the operational controls IT Staff can edit — **Ticket Owner**
(`<select>` of assignable users, "Unassigned" option, from `GET /api/staff/assignable-users`), **IT
Priority** (`<select>`), and **Current Status** (`<select>` showing only statuses reachable per the
transition matrix from the current status — an unreachable status is never even offered, so an invalid
transition can't be attempted through the UI, though the backend still enforces it independently).
Summary/Description remain read-only. **Resolution Summary** field appears, editable, only while
submitting a transition to Resolved, and read-only (labeled "visible to requester") once set.

**Tabs below**, matching the mockup's tab row minus "Service Actions" (Actions Taken — out of scope,
§4.2): **Public Comments** (identical composer/list pattern to §6, but any IT Staff/Administrator can
post) and **Internal Notes** — visually distinct: a muted amber-tinted panel background
(`--zen-warning-bg`), a 🔒 "Internal — not visible to requester" label pinned above the composer, and a
separate "Add Internal Note" button styled with the secondary (outline) treatment so it is never confused
with "Post Public Comment" (primary fill). An **Attachments** tab lists existing Attachments read-only
(download works; no add/remove controls here — that stays a Requester-only action from their own Ticket
Detail).

| State | Presentation |
|---|---|
| Loading | skeleton header + skeleton tabs |
| Loaded | as above |
| Not found | "Ticket not found." + link back to Queue |
| Status change confirmation | for Closed/Cancelled targets only, a confirmation dialog names the target status before submitting |
| Owner-required conflict | inline error under the Status select: "Assign an owner before starting work on this ticket." |
| Resolution Summary missing | inline error under the Resolution Summary field when submitting Resolved without one |
| Terminal ticket (Closed/Cancelled) | Owner/Priority/Status controls become read-only; Comments/Notes composers hidden with the same one-line note as §6 |
| API failure (any action) | inline error banner near the control that failed; other controls remain usable |

Implementation notes (Issue 66): Owner and IT Priority save as soon as the select changes (an inline error appears under the control if the backend refuses); Status uses an "Update status" button, shows the current status labelled "(current)" plus only the transitions the API returns in `allowedTransitions`, and asks for confirmation before Closed or Cancelled; "Assign to me" is the claim shortcut; the tabs are `role="tab"` buttons with the counts in their labels.

Administrator viewing the same URL: identical layout, but Owner/IT Priority/Status controls render
read-only (plain text, not `<select>`), and both composers are replaced by the same "read-only" note used
for terminal tickets, since an Administrator can read but not write on tickets (specification.md §11).

## 9. Screen: Administrator User Management

Route: `/admin/users`.

**Layout**: list (left, full width on its own when nothing is being created/edited) + a create/edit side
panel (right on desktop ≥992px, replaces the list full-width below 992px — matching the mockup's two-pane
layout, collapsing to one pane on small screens rather than squeezing both).

**List**: search input (name/email) · role filter `<select>` (All/Requester/IT Staff/Administrator) ·
"+ Create User" primary button · table with columns Name, Email, Role (badge), Status (Active/Inactive
badge), Edit action. No pagination control (§4.2/§8.5 — not required, not built) and no multi-column sort
(single implicit order by name).

**Create/Edit panel**: Full Name, Email, Role `<select>`, Active toggle. Create mode adds an Initial
Password field (with the same live policy checklist as Change Password, §4) instead of the mockup's "Send
password reset email" checkbox (omitted — see specification.md §11). Edit mode replaces that field with a
"Set New Initial Password" disclosure (collapsed by default, so editing basic info doesn't imply a
password reset is happening) that reveals the same password field + checklist when opened. Edit mode also
shows the two safety rules inline, disabled rather than hidden, with a caption explaining why, whenever
they'd otherwise apply:
- Editing your own account: the Active toggle and Role select are disabled with the caption "You cannot
  change your own role or active state."
- Editing the last active Administrator: the same two controls are disabled with the caption "At least
  one active Administrator must remain."

| State | Presentation |
|---|---|
| Loading | skeleton table rows |
| Loaded | table + closed panel |
| Search / role filter active, 0 matches | no-results row in the table area, "Clear filters" |
| Create/Edit panel open | as above |
| Validation failure | field-level messages (duplicate email, invalid role, password policy) |
| Save success | panel closes, table refreshes, inline success toast: "User saved." |
| Self/last-admin conflict | inline message under the disabled control rather than only on submit, so the restriction is visible before the user tries |
| API failure | banner inside the panel; table area unaffected |
| Forbidden (non-Administrator reaching this route) | not reachable — redirected before render (§5) |

Implementation notes (Issue 67): Role defaults to Requester and Active to Yes in create mode. The Active
control is a native checkbox with `role="switch"` and a visible Yes/No, so it is keyboard- and
screen-reader-operable. The rows are `role="table"`/`row`/`cell` elements (one DOM, laid out as cards below
992px and as a five-column table from 992px), not a scrolling `<table>`. Edit sends only the fields that
changed, and pressing Save with nothing changed shows "No changes to save." instead of calling the API. When
editing your own account the self caption wins over the last-Administrator caption; the last-Administrator
caption uses `activeAdministratorCount` from the list response, which is counted over all users so a role
filter cannot hide the fact. "Set New Initial Password" is its own action inside the panel ("Set password"):
it confirms in place, keeps the panel open, and tells the Administrator the user must change it at next
login (for their own account it warns they will be signed out). A duplicate email (`409 EMAIL_TAKEN`) is
shown under the Email field; the other `409` safety refusals appear as a message at the top of the panel.

## 10. Responsive rules

Unchanged breakpoints from Lab 2 (`docs/lab-02/ui-spec.md` §9): desktop ≥992px, tablet 768-991px, mobile
<768px. The Queue and User Management tables both collapse to the card/single-pane layouts described
above at their respective breakpoints; no screen in this document scrolls horizontally at 375px.

## 11. Accessibility rules

Unchanged from Lab 2 §10, plus: the Internal Notes lock icon carries `aria-label="Internal note, not
visible to requester"` so its meaning is not conveyed by the icon glyph alone; the Status `<select>` on
Staff Ticket Detail only ever lists reachable options, so a screen-reader user is never offered a choice
that would just be rejected.

## 12. Deliberate omissions and documented deviations from the mockup

- **"Forgot your password?" link** (mockup p.8) — not built; password-reset email is out of scope (§4.2).
- **"Send password reset email" checkbox** (mockup p.11) — replaced by a typed Initial Password field, an
  Administrator-set local-lab credential rather than an emailed one (§4.2, §6).
- **"Service Actions" tab** (mockup p.9) — Actions Taken, explicitly deferred to Lab 4 (§4.2, §4.5).
- **User list pagination** (mockup p.11 shows page numbers) — explicitly not required by §8.5; not built.
- **Comment/Note edit menu (⋮)** — Public Comments and Internal Notes are append-only in Lab 3 (§4.6).
- **Email column absent from the mockup's user table** (p.10) — added anyway, since §8.5's text
  explicitly requires "Name, Email, Role, Status."
- **Filters visible by default on desktop** (mockup shows a collapsed "Filters" button even at full
  width) — kept expanded ≥992px for discoverability; still collapses below that width to protect the
  no-horizontal-scroll rule.

- **Numbered page buttons on the Queue** (mockup p.9 shows `1 2 3 ... 9`) - not built; the Queue uses the
  same Previous / Next control with "Page x of y" and a page-size select as Lab 2 My Tickets, for one
  pagination pattern across the app.
- **"Deactivate User" button in the user panel** (mockup p.12) - deactivation is the Active switch in the
  form, saved with the rest of the edit, so name, role and state are changed in one place and the same
  safeguards (§9) disable it when it would be refused.
- **Login failure is a banner, not a field message.** Login shows its one safe message ("Invalid email or
  password.") above the form and never marks a field, because naming the field would reveal whether the
  email or the password was wrong (BR-12).

## 13. Visual inspection checklist (completed against real screenshots, PR 7)

Method: `e2e/lab-03/responsive.spec.ts` captures every screen state below at 1280, 850 and 375 px into
`artifacts/lab-03/screenshots/` after asserting there is no horizontal page scroll. Each image was then
viewed (desktop, tablet and mobile side by side) and compared with this document. A checked box means the
statement is true of the screenshots at all three widths; the evidence column says where it is proved.

- [x] Zen Green colours match the Lab 2 token table on every new screen; no new colour value introduced.
      Evidence: the only colour literals outside `:root` in `zen-green.css` are `#ffffff` (equal to
      `--zen-surface`) and two existing `rgba` shadows; every other colour is a `var(--zen-*)` token.
- [x] Role navigation shows only the current role's permitted destinations on Requester, IT Staff and
      Administrator accounts, at all three viewports. Evidence: E2E-01 (links per role at 1280 px);
      `responsive.spec.ts` opens the 375 px menu for each role and asserts the same links; UI-06; UI-23
      (no navigation at all while a first-login password change is pending).
- [x] Status, IT Priority and Role badges are visually consistent wherever they appear (Queue, Staff Detail,
      Requester Detail, User Management). Evidence: `requester/*`, `staff-queue/loaded`,
      `staff-ticket-detail/*`, `user-management/list`; STY-02, STY-03.
- [x] Editable vs. read-only fields are visually distinguishable on Staff Ticket Detail (Administrator
      view) and on Requester Ticket Detail's system-generated fields. Evidence:
      `staff-ticket-detail/*-admin-readonly.png` (plain text, no selects, read-only note) against
      `*-loaded.png` (selects); `requester/*-detail.png`.
- [x] Validation messages sit directly under their field on Change Password and the Create/Edit User panel
      (Login is the documented exception, §12). Evidence: `authentication/*-change-password.png`,
      `user-management/*-validation.png`, `*-duplicate.png`; UI-13, UI-19; E2E-01, E2E-03.
- [x] Internal Notes are visually distinguishable from Public Comments at a glance, without reading the
      section heading (amber panel, lock label, outline button). Evidence:
      `staff-ticket-detail/*-notes.png` against `*-loaded.png`; STY-01.
- [x] Focus is visible on every new interactive control using only the keyboard. Evidence: RESP-06
      (computed outline on 14 controls) and `focus/*.png`, where the white ring on the green header and the
      ring on the Active switch were checked by eye.
- [x] No clipped labels, overlapping messages, hidden buttons, or horizontal scrolling at 375, 850, or 1280 px
      on any screen listed in §14, after the fixes below. Evidence: the no-scroll assertion in `shot()` for all
      86 images and the images themselves.

**Defects the audit found, all fixed in the same PR** (a passing suite had not caught any of them):

| # | What the screenshots showed | Fix | Guarded by |
|---|---|---|---|
| 1 | At 375 px the ☰ menu button was green on the green header, almost invisible, on every screen | Button is white | RESP-02 asserts the computed colour |
| 2 | Keyboard focus ring on header links and the identity button was green on green | White 2 px ring inside the header | RESP-06, `focus/shell-identity.png` |
| 3 | A first-login user still saw "My Tickets / Create Ticket", links that only bounced back to Change Password | No nav or menu button until the password is changed | UI-23 |
| 4 | Queue cards at 375 px clipped the ticket number ("TKT-2026-0...") when the status cell held two badges, and the Req/IT priority pair wrapped | Card is a wrapping flex row; the number never shrinks and the status badges wrap | RESP-03 screenshots |
| 5 | Queue search placeholder was cut off at 375 px | Shorter placeholder ("Number, summary, requester") | RESP-03 screenshots |
| 6 | With the panel open at 1280 px, long user names ran over the Email column | Name and Email cells truncate with an ellipsis | RESP-05 screenshots |
| 7 | Editing the only active Administrator's own account showed only the self rule, so the last-Administrator rule was invisible | Both captions are shown when both rules apply | UI-14 |
| 8 | "My Queue" lost its active underline on a ticket's detail page | Active for `/staff/tickets/*` | screenshots |
| 9 | Capture artefacts: a stray hover highlight on the first Queue row, and a User Management shot taken before the debounced search applied | The spec moves the pointer away and waits for the filtered list | `responsive.spec.ts` |

## 14. Screenshot paths

All files are `artifacts/lab-03/screenshots/<folder>/<viewport>-<state>.png`, with `<viewport>` one of
`desktop` (1280x900), `tablet` (850x1100), `mobile` (375x812). Full-page captures, 86 files.

| Screen | Folder | States |
|---|---|---|
| Login / first-login Change Password | `authentication/` | `login`, `invalid`, `inactive`, `busy`, `change-password` |
| Requester regression + comments | `requester/` | `tickets`, `detail`, `comments`, `resolved` |
| IT Staff Ticket Queue | `staff-queue/` | `loaded`, `empty` (API response mocked), `no-results`, `failure` (API response mocked), `forbidden` |
| IT Staff Ticket Detail | `staff-ticket-detail/` | `loaded`, `notes`, `attachments`, `validation`, `resolved`, `admin-readonly` |
| User Management | `user-management/` | `list`, `create`, `validation`, `duplicate`, `edit`, `self`, `forbidden` |
| Keyboard focus (desktop only) | `focus/` | `login-button`, `shell-identity`, `queue-row`, `detail-tab`, `user-switch` |

Captured by `e2e/lab-03/responsive.spec.ts` (Playwright `page.screenshot()`), regenerated by the final run on
the release branch before the release PR per the Kickoff Guide checklist.
