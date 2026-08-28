# Lab 2 Zen Green UI Specification

Governs the Development Requester Selection screen, the application shell, Create Ticket, My Tickets, and
Requester Ticket Detail. Every later lab reuses these tokens and component rules rather than inventing a
new visual system (labsheet §7).

## 1. Color tokens

Defined as CSS custom properties in `client/src/styles/zen-green.css`; components consume the token,
never a literal hex value, so `client/tests/lab-02/zen-green.style.test.tsx` can assert on class/token usage.

| Token | Value | Required use |
|---|---|---|
| `--zen-primary` | `#006B3C` | App header background, primary action buttons, strong emphasis text |
| `--zen-secondary` | `#0B7A46` | Active tab indicator, focus ring accent, links, hover states |
| `--zen-pale` | `#EAF6EF` | Selected-row background, success surfaces, subtle section emphasis |
| `--zen-page-bg` | `#F5F7F6` | Page background behind all cards/surfaces |
| `--zen-surface` | `#FFFFFF` | Card/panel background, 1px `--zen-border` border, restrained shadow |
| `--zen-border` | `#D9E4DD` | Default card/input border |
| `--zen-text` | `#16261E` | Body text — dark charcoal-green, never pure black |
| `--zen-text-muted` | `#5B6B62` | Secondary text, helper copy, placeholder |
| `--zen-field-editable-bg` | `#FFFFFF` | Editable field background, neutral border |
| `--zen-field-readonly-bg` | `#EFF2ED` | Read-only / system-generated field background — visually distinct, still readable |
| `--zen-error` | `#8A1F1F` | Error text/border color |
| `--zen-error-bg` | `#FBEDED` | Error message background |
| `--zen-warning` | `#8A5A00` | Warning callout text |
| `--zen-warning-bg` | `#FBF2DF` | Warning callout background |
| `--zen-success` | `#0B7A46` | Success confirmation text |
| `--zen-success-bg` | `#EAF6EF` | Success confirmation background |

Non-color rule: every error/warning/success state also carries an icon and text, never color alone
(labsheet component rules, AC-18).

## 2. Typography and spacing

- Font stack: system UI stack (`-apple-system, "Segoe UI", Roboto, sans-serif`) — no custom font load, to
  keep the app shell fast; this is a UI-density lab, not a typographic one.
- Type scale: `--zen-fs-h1: 1.5rem` (screen titles) / `--zen-fs-h2: 1.125rem` (section headers) /
  `--zen-fs-body: 0.9375rem` / `--zen-fs-label: 0.8125rem` (field labels, uppercase-tracked) /
  `--zen-fs-caption: 0.75rem` (helper text, timestamps).
- Spacing scale (used via `gap`, never ad hoc margins): `4 / 8 / 12 / 16 / 24 / 32 / 48px` as
  `--zen-space-1` … `--zen-space-7`.
- All field labels sit **above** their control, `--zen-fs-label`, `font-weight: 600`, `--zen-text-muted`.

## 3. Field, button, and badge states

**Field states**
| State | Treatment |
|---|---|
| Editable | `--zen-field-editable-bg` background, `--zen-border` border, `--zen-text` value |
| Read-only / system-generated | `--zen-field-readonly-bg` background, no focus ring, `cursor: default`, small "system-generated" caption under it |
| Invalid | `--zen-error` border (2px), `--zen-error-bg` tint, error text directly below the field, `aria-invalid="true"`, `aria-describedby` pointing at the message |
| Disabled | reduced opacity (0.55), `cursor: not-allowed`, no hover/focus treatment — visually distinct from read-only |
| Focused | 2px `--zen-secondary` outline, `outline-offset: 2px`, visible for keyboard users (never `outline: none` without a replacement) |

Required-field marker: a red asterisk (`--zen-error` color) immediately after the label text, plus
`aria-required="true"` on the control — the asterisk is a visual hint only, never the sole indicator (AC-18).

**Button hierarchy**
| Role | Example | Style |
|---|---|---|
| Primary | Submit Ticket, Continue | `--zen-primary` fill, white text |
| Secondary | Cancel, Change Requester | `--zen-secondary` outline, `--zen-secondary` text, transparent fill |
| Tertiary | Clear filters, Back | plain text, `--zen-secondary`, underline on hover |
| Destructive | Remove attachment | `--zen-error` outline + text; fills `--zen-error` on hover |
| Disabled (any role) | — | opacity 0.5, `cursor: not-allowed`, no pointer events |
| Busy | Submit while in-flight | spinner + "Submitting…" text replaces label, button `disabled`, width does not jump |

Icon-only controls (e.g. a trash icon for remove) always carry `aria-label` and a native `title` tooltip —
icon alone never ships without one (labsheet component rules).

**Badges**
| Badge | Palette |
|---|---|
| Requested Priority: LOW | neutral gray-green pill |
| Requested Priority: MEDIUM | `--zen-warning` pill |
| Requested Priority: HIGH / URGENT | `--zen-error` pill |
| Current Status: NEW | `--zen-secondary` pill (only status value in Lab 2) |
| Attachment: active | `--zen-success` pill, "Active" |
| Attachment: removed | neutral gray pill, "Removed" — never uses `--zen-error`, since removal is a normal action, not a fault |

## 4. Application shell

- Header bar, `--zen-primary` background, white text: TokTickIT wordmark (left), nav links "My Tickets" /
  "Create Ticket" (center-left), current Requester name + "Change Requester" link (right).
- Active nav item: `--zen-pale` underline + `font-weight: 600` — never color alone (also underlined).
- Below 768px, nav collapses into a hamburger-triggered slide-down menu; the Requester name/Change
  Requester control remains visible in the collapsed header (not hidden inside the menu), since knowing
  "who am I testing as" is the point of Lab 2.
- The shell renders only after a Requester is selected; visiting any Lab-2 route without one selected
  redirects to the Requester Selection screen (AC-02).

## 5. Screen: Development Requester Selection

Route: `/select-requester` (also the redirect target of AC-02).

Elements, top to bottom: TokTickIT title · one sentence of explanatory text (the suggested labsheet copy,
verbatim) · a `<select>` of active Requesters (`fullName`, plus a muted `email` in the option) · primary
"Continue" button, disabled until a Requester is chosen.

| State | Presentation |
|---|---|
| Loading | skeleton `<select>` placeholder + disabled Continue, no layout shift once data arrives |
| Loaded | populated `<select>`, Continue enabled on selection |
| Empty (0 active Requesters) | dropdown **and** Continue are not rendered at all, replaced by the message "No active Development Requesters are available. Ask your instructor to check the seed data." A control that cannot succeed is removed rather than shown disabled (AC-16, asserted by UI-02) |
| API failure | warning callout: "Unable to load Development Requesters." + Retry button (AC-15) |

All controls keyboard-reachable in visual tab order; `<select>` is a native element (not a custom widget)
specifically so keyboard and screen-reader behavior come for free.

## 6. Screen: Create Ticket

Route: `/tickets/new`. Single-column form on mobile, two-column grouped layout ≥768px.

**Layout, top to bottom** (per labsheet §8.2 example arrangement):
1. System-generated row (read-only field styling): Ticket Number ("(assigned after submission)"),
   Ticket Date ("(set on submission)"), Requester (current selection, read-only).
2. Classification group, two columns on tablet+: Category `<select>`, Related System `<select>`,
   Requested Priority `<select>` (LOW/MEDIUM/HIGH/URGENT).
3. Summary — full-width single-line input, live character counter (`n/120`).
4. Description — full-width `<textarea>`, resizable vertically only, min 6 rows, live character counter
   (`n/4000`).
5. Attachments — drag-and-drop + file-picker zone, accepted-types and size-limit caption always visible,
   list of selected files with a remove-before-submit control, running "`k`/5 attached" counter.
6. Actions — primary "Submit Ticket" (left) and tertiary "Cancel" (right) on desktop; stacked, primary on
   top, on mobile.

**States**
| State | Presentation |
|---|---|
| Initial | all editable fields empty, system-generated fields show their placeholder captions |
| Validation failure | each invalid field gets the invalid-field treatment (§3) with its specific message; a summary is not shown at the top *instead of* field messages — only in addition, and only once ≥2 fields are invalid |
| Submitting | Submit button enters busy state (§3); all fields become read-only for the duration (not just the button) so a Requester cannot edit while the request is in flight |
| Success | form is replaced by a confirmation panel: the generated Ticket Number in large `--zen-fs-h1` text, a "View Ticket" primary action, and a "Create Another" tertiary action |
| API failure | banner uses the error treatment (§3) above the form; every field retains its entered value (BR-18); Submit returns to its normal (non-busy) state so the Requester can retry |
| Partial attachment failure | success panel still shows, plus a warning callout listing which file(s) failed and a link to retry them from Ticket Detail (BR-19) |

## 7. Screen: My Tickets

Route: `/tickets`.

**Controls row** (desktop: one row; mobile: search full-width, filters collapse into a "Filters" disclosure):
search input (debounced), Category filter, Related System filter, Priority filter, Sort `<select>`,
"Clear filters" tertiary button (visible only when ≥1 filter/search is active), primary "Create Ticket"
button pinned top-right.

**Desktop (≥992px): table.** Columns — Ticket Number, Summary (truncated with `title` tooltip), Category,
Requested Priority (badge), Current Status (badge), Last Updated, and a chevron/row-click to open detail.
Chosen because these are exactly the fields a Requester needs to recognize and prioritize a ticket
without opening it (labsheet §8.4 — final column choice justified here).

**Tablet (768–991px):** same table, Category column dropped to keep the remaining columns unclipped.

**Mobile (<768px): cards**, one per ticket — Ticket Number + Priority badge on the top line, Summary
below it, Status badge + Last Updated on the bottom line; entire card is the tap target.

**Pagination:** page-size `<select>` (10/20/50) + numbered pager with Prev/Next, count text ("Showing
1–10 of 34"), placed below the list on all sizes.

| State | Presentation |
|---|---|
| Loading | skeleton rows/cards matching the current viewport's layout |
| Loaded, has results | table/cards as above |
| Empty (no tickets ever) | centered message + illustration-free icon + "Create your first ticket" primary button (AC-12) |
| No results (filters active, 0 matches) | centered message referencing the active search/filters + "Clear filters" button (AC-11) — visually distinct copy from the empty state |
| API failure | warning callout + Retry button, list area otherwise blank |

## 8. Screen: Requester Ticket Detail

Route: `/tickets/:id`.

**Layout:** a header block of read-only Ticket fields (Ticket Number, Date, Requester, Category, Related
System, Requested Priority badge, Current Status badge, Summary, Description) clearly separated by a
divider from an **Attachments** section below it — the labsheet requires this separation to be visually
unambiguous, since later labs add Comments/Notes/Actions Taken in this same area and must not be
confused with the read-only header.

**Attachments section:** an "Add attachment" control (single-file, reuses the Create Ticket
drag-and-drop/picker) above a list of all attachments (active and removed, per BR-23), each row showing
filename, size, uploader, uploaded-at, an Active/Removed badge (§3), and for active ones a
Download button plus a destructive Remove button (opens a small reason-required confirmation, per
BR-24); removed rows show their `removalReason` inline instead of action buttons.

| State | Presentation |
|---|---|
| Loading | skeleton header block + skeleton attachment rows |
| Loaded | as above |
| Not found / not owned | full-screen message: "Ticket not found." + a link back to My Tickets — identical whether the ticket never existed or belongs to another Requester (BR-10/BR-28; UI never reveals which) |
| Attachment uploading | the new row appears immediately with a busy/pending treatment, replaced by its final state on success or removed with an inline error on failure |
| Attachment removal confirm | modal/inline panel requiring a non-empty reason (5–200 chars) before the destructive action activates |
| Download of removed file attempted | (should not be reachable via UI once removed — the Download button is absent; documented here as a defense-in-depth case exercised directly against the API in tests, since BR-23 requires the server to also refuse it) |

## 9. Responsive rules (labsheet §8.7)

| Viewport | Rule |
|---|---|
| Desktop ≥992px | Multi-column layout as specified per screen; content max-width `1180px`, centered |
| Tablet 768–991px | Two-column layout where practical; Summary/Description keep full available width |
| Mobile <768px | Fields stack vertically; all buttons ≥44px touch target; **no horizontal page scrolling** anywhere |
| All sizes | No clipped labels, no overlapping validation messages, no hidden buttons, no truncated-unreadable attachment filenames (filenames wrap or ellipsize with a `title` tooltip, never overflow the row) |

## 10. Accessibility rules

- Every form control has a programmatically associated `<label>` (via `htmlFor`/`id`), not a placeholder
  used as a label.
- Focus order follows visual order; focus is never trapped outside modals (the removal-reason
  confirmation) and is returned to the triggering control on close.
- Color is never the only signal: badges pair color with text, errors pair color with an icon + message,
  active nav pairs color with an underline.
- All interactive elements are reachable and operable via keyboard alone (verified by the UI component
  tests using `userEvent` keyboard interactions, not just click simulation).

## 11. Visual inspection checklist (completed with real screenshots in `tests.md` §4)

Reviewed against the 27 screenshots in `artifacts/lab-02/screenshots/` generated by
`e2e/lab-02/responsive.spec.ts` (desktop 1280px / tablet 850px / mobile 375px), 2026-08-27.

- [x] Zen Green colors match the token table in §1 on all three screens - primary green header,
      pale-green selected/success surfaces, soft gray-green read-only fields, and text links all take
      their colour from a token. Links were the last holdout (they fell through to the browser default
      blue because no `a` rule existed); `zen-green.css` now styles `a` with `--zen-secondary`.
- [x] Editable vs. read-only fields are visually distinguishable without reading their labels — Ticket
      Number/Date/Requester render with the shaded read-only background against white editable fields.
- [x] Validation messages sit directly under their field, never only in a top-of-form summary —
      confirmed on Create Ticket's validation-failure screenshots.
- [x] Button hierarchy (primary/secondary/tertiary/destructive/disabled/busy) is visually consistent
      across Create Ticket and Ticket Detail — Submit/Download are solid vs. outlined, Remove is the
      destructive outline, Cancel/Back links are plain text.
- [x] No clipped labels, overlapping messages, or hidden buttons at 375px, 850px, or 1280px widths.
- [x] No horizontal scrolling of the page body at any of the three widths — asserted programmatically
      (`document.documentElement.scrollWidth <= clientWidth`) in every one of the 27 responsive tests,
      not just eyeballed.
- [x] Desktop table and mobile card renderings of My Tickets both show the required fields (§7) — same
      DOM rows reflow via CSS grid; Category column drops on tablet/mobile as specified.
- [x] Priority/Status/Attachment badges are visually consistent wherever they appear — same pill shape
      and token colors on My Tickets, Ticket Detail, and the Attachments list.

**One cosmetic note, not a failure:** on the 375px shell header, the Requester's full name wraps onto a
second line next to "Change Requester" (see `ticket-detail/mobile-loaded.png`). It does not clip, overlap,
or cause horizontal scroll, so it does not violate any rule above — flagged here for a possible follow-up
in a later lab (e.g. truncating the name with a tooltip on very narrow screens).

### Deviations found by this checklist, and how they were closed

Re-reading the screenshots against this document turned up four mismatches that no test caught, because
none of them made a test fail. Three of them mattered: **D-02 and D-03 were BR-23 violations**, since
BR-23 requires a removed Attachment to keep showing filename, size, uploader, removal reason *and*
removal time, and only the reason was rendered. All four are now fixed in the implementation rather than
carried forward.

| # | Spec says | Was | Now |
|---|---|---|---|
| D-01 | §8 header shows Ticket Number, Date, Requester, Category, Related System, Priority, Status, Summary, Description | Ticket Date absent; only Last Updated shown | Ticket Date rendered from the Ticket's creation timestamp (BR-03), alongside Last Updated |
| D-02 | §8 and BR-23: attachment rows show filename, size, uploader, uploaded-at | Uploader name not rendered | Every row reads "uploaded {date} by {name}"; asserted by UI-17 |
| D-03 | §11 and BR-23: removed rows retain the removal reason and removal time | Reason shown, removal timestamp missing | Removed rows read "Removed {date} by {name}: {reason}"; asserted by UI-16 |
| D-04 | §1 every colour comes from a Zen Green token | Text links fell through to browser-default blue | `a` now takes `--zen-secondary`, hover `--zen-primary`, with a visible focus ring |

The lesson worth recording: a green test suite did not mean the spec was met. These were only visible by
comparing the rendered screens against the written spec, which is what the visual checklist is for.


## 12. Screenshot paths

| Screen | Path |
|---|---|
| Create Ticket | `artifacts/lab-02/screenshots/create-ticket/{desktop,tablet,mobile}-{initial,validation,success,failure}.png` |
| My Tickets | `artifacts/lab-02/screenshots/my-tickets/{desktop,tablet,mobile}-{loaded,empty,no-results}.png` |
| Ticket Detail | `artifacts/lab-02/screenshots/ticket-detail/{desktop,tablet,mobile}-{loaded,attachment-removed}.png` |

Captured by `e2e/lab-02/responsive.spec.ts` (Playwright `page.screenshot()`), not hand-taken, so they can
be regenerated identically whenever the UI changes.
