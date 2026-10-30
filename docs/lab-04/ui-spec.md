# Lab 4 Zen Green UI Specification

Extends `docs/lab-02/ui-spec.md` (tokens, typography, spacing, field and button states, base badges) and
`docs/lab-03/ui-spec.md` (status, priority and role badges, shell, Queue, Ticket Detail), which stay the
source of truth and are not repeated except where Lab 4 adds to them. Governs the Requester and IT Staff
dashboards, the Actions Taken area on IT Staff and Requester Ticket Detail, the Ticket workflow controls, the
shell's Dashboard entry, and the drill-down behavior of My Tickets and the Ticket Queue.

## 1. New badges and markers

No new colour token is introduced; everything reuses the `--zen-*` tokens of Lab 2 (`--zen-primary`,
`--zen-secondary`, `--zen-pale`, `--zen-warning`, `--zen-success`, `--zen-error` and their `-bg` pairs).

| Element | Presentation | Non-colour cue |
|---|---|---|
| Action status Planned | neutral gray-green pill | text "Planned" |
| Action status In Progress | `--zen-warning` pill | text "In Progress" |
| Action status Completed | `--zen-success` pill | text "Completed" with a check icon |
| Action status Cancelled | neutral gray pill, struck-through label | text "Cancelled" |
| Follow-up marker | small `--zen-warning` outlined tag | text "Follow-up needed" with a flag icon |
| "Visible to requester" label | muted `--zen-secondary` text above the Action form | text and an eye icon with `aria-label` |
| Dashboard card | white surface, `--zen-pale` border, large number, label, "View" link | label text, never colour alone |
| Zero value | same card, number `0` in muted text colour | the number itself |

Ticket status, IT Priority and role badges are the Lab 3 ones and appear unchanged in every dashboard list.

## 2. Application shell (changes only)

| Role | Navigation (left to right) | Landing page after login |
|---|---|---|
| Requester | Dashboard, My Tickets, Create Ticket | `/dashboard` |
| IT Staff | Dashboard, My Queue | `/dashboard` |
| Administrator | Dashboard, Users | `/dashboard` |

- The current page is marked in the navigation with the existing active underline and `aria-current="page"`.
  Dashboard is active on `/dashboard`; My Tickets on `/tickets` and `/tickets/:id`; My Queue on `/staff/queue`
  and `/staff/tickets/:id`; Users on `/admin/users`. My Tickets is not marked on `/tickets/new`, where Create
  Ticket is marked instead (the route prefix must not light up two entries).
- Staff and Administrator have no "Create Ticket" entry anywhere, including dashboard shortcuts (BR-35).
- While a first-login password change is pending, no navigation is shown (unchanged from Lab 3). The
  identity dropdown, the mobile menu, Forbidden and Not Found work as in Lab 3; their "back to home" button
  now goes to `/dashboard`.
- `/dashboard` renders the Requester Dashboard for a Requester and the IT Staff Dashboard for IT Staff and
  Administrator; the screen picks the view from the signed-in role, and the API enforces the role again.

## 3. Screens: Dashboards

Route `/dashboard`. Title "Welcome back, <first name>" with a one-line subtitle, and a "Refresh" secondary
button on the right that reloads the figures (disabled while loading). Cards are `<a>` links with a visible
focus ring; the whole card is the target and its accessible name is "<label>: <value>, view tickets".

### 3.1 IT Staff Dashboard

Order top to bottom:
1. **Status row**, 4 cards: New, Open, In Progress, Waiting for Requester.
2. **Workload row**, 3 cards: Unassigned, My Assigned, and "My Open Actions" (the last is not a link; its
   number is followed by the text "listed below"). My Assigned and My Open Actions are IT Staff only.
3. **By IT Priority**, one compact card with four links: Urgent, High, Medium, Low, each with its count.
4. **Lists** in two columns: "Urgent and High Priority" and "Recently Updated" (up to 5 rows each, Ticket No.
   linked, summary, status badge, IT Priority badge, owner or "Unassigned", last updated); beneath, "My Open
   Actions" (up to 5 rows: Ticket No. linked, description, Action status badge, Action date/time). "View all"
   on Urgent and High Priority opens `/staff/queue?active=true`, and on Recently Updated opens `/staff/queue`.
   My Open Actions has no "View all"; each row opens that Ticket's Actions Taken tab.
5. **Quick Actions**: "Open Ticket Queue" and "My Queue" (`?owner=me&active=true`). No Create Ticket.

Desktop (992 px and up): status row 4 across, workload row 3 across, lists 2 across. Tablet (768 to 991 px):
2 across for cards, lists stacked. Mobile (below 768 px): 1 across for cards, lists stacked, list rows become
two-line cards (Ticket No. and badges on top, summary below). Nothing scrolls horizontally at 375 px.

**Administrator variant**: same screen without the Workload row's My Assigned and My Open Actions cards and
without the "My Open Actions" list and the "My Queue" quick action; instead an "Accounts" card (active
Requesters, active IT Staff, active Administrators, inactive) that links to `/admin/users`. A one-line note
reads "Read-only view of the IT Staff dashboard."

### 3.2 Requester Dashboard

1. **Cards**, 4 across: Open Tickets, Waiting for You, Resolved, Closed (each links as in api-spec §7).
2. **Needs Your Attention** (Tickets Waiting for Requester, up to 5, oldest first). With none, it shows
   "Nothing needs your attention right now."
3. **Recently Updated** (up to 5, any status): Ticket No. linked, summary, status badge, last updated; "View
   all" opens My Tickets.
4. **Quick Actions**: "Create Ticket" and "View My Tickets".

Layout follows the IT Staff rules (cards 4, 2, then 1 across; lists stacked on tablet and mobile).

### 3.3 States (both dashboards)

| State | Presentation |
|---|---|
| Loading | skeleton cards and skeleton rows; the screen title and navigation are already present; the Refresh button is disabled |
| Loaded with data | as above |
| Zero data | every card shows `0` (muted) and every list shows its message ("No urgent tickets.", "No recent tickets.", "You have no open actions.", "You have no tickets yet. Create one to get started." for the Requester) |
| Forbidden | the screen is not reachable by the wrong role (the route chooses the view by role); if the API still answers 403 the shared Forbidden panel is shown and no figures appear |
| API failure | warning callout "We could not load the dashboard." with a Retry button; no stale numbers are left on screen |
| Refreshing | the existing figures stay visible, the Refresh button shows a busy state, a failure shows the callout without clearing them |

## 4. Screen: IT Staff Ticket Detail (changes)

Route `/staff/tickets/:id` (optionally `?tab=actions|comments|notes|attachments` to open a tab; the dashboard's
My Open Actions rows use `?tab=actions`). The header, owner, IT Priority and status controls and the three
Lab 3 tabs are unchanged. New or changed:

### 4.1 Tab "Actions Taken"

Tab order: Public Comments, Internal Notes, **Actions Taken**, Attachments. The default tab stays as in Lab 3.
The label shows the count, like the other tabs ("Actions Taken (3)").

- **Notice** above the list: "Everything in an Action is visible to the Requester." (the shared-content
  label, never shown on Internal Notes).
- **Desktop (992 px and up): table** with columns Date/Time (`actionAt`), Description (truncated with the
  full text in a tooltip and in the open row), Assignee ("(inactive)" suffix if applicable), Performed by,
  Status badge, Follow-up marker, and a View/Edit action. **Tablet and mobile: cards** with Description first,
  then Status and Follow-up on one wrapping line, then Assignee, Performed by and date.
- **"Add Action"** primary button above the list opens the create form **inline above the list** (not a
  modal dialog, so there is no focus trap to get wrong). The form closes on Save or Cancel and returns
  focus to the button.
- Selecting a row opens that Action in the same inline panel in **view mode**; a Planned or In Progress Action
  also shows an "Edit" button that switches the panel to **edit mode**. Completed and Cancelled Actions have
  no Edit button and the panel shows the fields as plain text with a line "This action is final."

**Form fields** (create and edit): Action Date/Time (date and time inputs, default now), Description
(textarea, required), Assignee (`<select>` of active IT Staff from `GET /api/staff/assignable-users`, default
the signed-in user when they are IT Staff, required and no default for an Administrator), Status (create:
Planned, In Progress or Completed; edit: only the transitions the Action matrix allows plus the current value),
Result (textarea, marked required whenever Status is Completed or Cancelled), "Follow-up required?" (checkbox),
Follow-up Note (textarea, shown and marked required only while the checkbox is on), Attachment Notes (text
input with helper text "Say which attached file to look for, for example the photo of the old battery.").
"Performed by" is shown as read-only text, "You" on create and the real name afterwards.

**Quick actions** on an open Action row or panel: "Start" (Planned only), "Complete" and "Cancel". "Complete"
and "Cancel" focus the Result field when it is empty instead of submitting; "Cancel" asks "Cancel this
action? This cannot be undone." with Confirm and Keep.

| State | Presentation |
|---|---|
| Loading | skeleton rows or cards inside the tab |
| No Actions | "No actions recorded yet." with the Add Action button |
| Validation error | message directly under the field (assignee, result, follow-up note, description, date), the form keeps every value, the first invalid field takes focus |
| Saving | Save shows its busy state and is disabled and ignores repeated clicks and Enter presses until the response arrives (single-flight, BR-38); the same `clientRequestId` is reused for any retry of the same form |
| Success | the panel closes (create) or returns to view mode (edit), the list refreshes, a status line "Action saved." is announced politely |
| Inactive assignee (409 `INVALID_ASSIGNEE`) | inline error under Assignee: "Choose an active IT Staff member."; entered data kept |
| Stale (409 `STALE_VERSION`) | banner above the form: "Someone else changed this action. Your changes are still in the form. Reload to see the latest version (your changes will be replaced)." with a "Reload latest" button |
| Locked (409 `ACTION_LOCKED` or `ACTIONS_LOCKED`) | banner with the reason; the form becomes read-only text |
| Ticket not editable (Resolved, Closed, Cancelled) | Add Action and every Edit/Start/Complete/Cancel control is hidden and a line states why ("Actions cannot be changed while the ticket is Resolved. Reopen it first."); the list stays readable |
| Administrator | Add Action and edit controls are available (BR-06) while the owner, priority and status controls above stay read-only text |
| API failure | warning banner near the form with Retry; entered data kept |

### 4.2 Ticket workflow controls

- The status `<select>` offers only the current status marked "(current)" and the targets in the
  `allowedTransitions` array returned by the API, always in the order of the matrix (Open, In Progress, Waiting
  for Requester, Resolved, Closed, Reopened, Cancelled). A target the matrix allows but the gate would refuse
  is still shown; selecting Resolved while `resolutionBlockers` is not empty shows, under the control, the
  reason ("Finish or cancel 2 open actions." and/or "Complete at least one action.") and disables "Update
  status".
- **Resolved** still asks for the Resolution Summary (Lab 3). After a successful change the Ticket header
  (status badge, "Last updated", version) is replaced from the response, with no page reload (AC-22).
- A `RESOLUTION_BLOCKED` response from the server (the screen was out of date) shows the same reasons
  and a link that opens the Actions Taken tab.
- A `STALE_VERSION` response on owner, IT Priority or status shows the banner "This ticket was changed by
  someone else. Reload to see the latest version." with a "Reload latest" button, keeps the user's selected
  value visible beside it, and leaves the control enabled after reload.
- Cancelling a Ticket asks for confirmation as in Lab 3 and adds one line: "Open actions on this ticket will be
  cancelled."

## 5. Screen: Requester Ticket Detail (changes)

New read-only section **Actions Taken** between Attachments and Public Comments, shown for every status.
- With Actions: a table (desktop) or cards (below 992 px) with Date/Time, Description, Result, Status badge,
  Follow-up marker with the Follow-up Note, Attachment Notes, Performed by and Assignee, in the stable order.
  Every field is plain text. There is no Add, Edit, Start, Complete or Cancel control.
- Without Actions: "No actions have been recorded on this ticket yet."
- Loading: skeleton block. Failure: warning callout with Retry. The rest of the screen stays usable.
- The "Problem Appears Resolved" button and indicator are unchanged and never imply the status changed.

## 6. Screens: My Tickets and Ticket Queue (drill-down)

Both screens read `status`, `active` (My Tickets and Queue) and `owner`, `itPriority` (Queue) from the URL
when they open, apply them as the initial filters and show them in the existing filter controls. A visible
chip row names filters that have no control of their own ("Active tickets only") with a remove button. "Clear
filters" removes every one and updates the URL. The list total equals the card that opened it (AC-27). An
invalid value in the URL is ignored by the controls and the API's `400` is shown as the standard failure
callout.

## 7. Feedback consistency (all Lab 4 and earlier screens)

| Situation | Presentation |
|---|---|
| Loading | skeletons (lists, cards) or the busy button state (forms) |
| Validation | text under the field, values kept |
| Success | polite status line or the changed content replacing the old |
| Empty | one sentence plus the primary next step when there is one |
| No results | the active filters named plus "Clear filters" |
| Forbidden | the shared Forbidden panel |
| Conflict | banner with the plain reason and a way to reload; entered data kept |
| Not found | "Ticket not found." with a link back to the list |
| API failure | warning callout with Retry |

## 8. Responsive rules

Unchanged breakpoints: desktop 992 px and up, tablet 768 to 991 px, mobile below 768 px. At 375 px no Lab 4
screen scrolls horizontally, clips a label, hides a button, or overlaps controls. Tables become cards
below 992 px (Actions Taken on both Ticket Detail screens, dashboard lists on mobile).

## 9. Accessibility rules

Unchanged from Lab 2 and Lab 3, plus: dashboard cards are links with a visible focus ring and a name that
includes label and value; the inline Action form is not a dialog and returns focus to its opener on close;
errors are tied to their fields (`aria-describedby`, `aria-invalid`) and the first invalid field takes focus;
status and priority are never colour-only; the Cancel confirmation is an inline region, not a modal; the "Action
saved." and "Dashboard updated." messages use `role="status"`; the status `<select>` never lists a target the
matrix forbids; the current navigation item has `aria-current="page"`.

## 10. Deliberate omissions and documented deviations from the mockups (labsheet pages 5 and 6)

- **"from yesterday" deltas** on every card: not built; they need stored daily snapshots, outside the approved
  scope (specification §3, Assumption 10).
- **"Quick Actions" with "Create Ticket" on the IT Staff dashboard**: not built; IT Staff cannot create Tickets
  in Lab 3 (authorization matrix). The IT Staff Quick Actions are "Open Ticket Queue" and "My Queue".
- **"Search Tickets" quick action**: replaced by "Open Ticket Queue", which already has the search box.
- **"My Recent Tickets" on the IT Staff dashboard** is "Recently Updated" (all Tickets, not only the user's) next
  to "Urgent and High Priority", because the labsheet asks for "recent or urgent Ticket information" (§8.1).
- **Requester cards**: the mockup's four cards are My Open, In Progress, Resolved and Closed. Lab 4 uses Open
  Tickets (which includes In Progress), Waiting for You, Resolved and Closed, because §4.6 names Tickets waiting
  for the Requester and the "Needs Your Attention" list needs that figure.
- **Mockup branding** "TikTockIT" and the sample Ticket numbers (`TKT-2025-...`) are not copied; the app keeps
  the TokTickIT name and the real `TKT-<year>-<number>` format.
- **Requester navigation** in the mockup shows My Tickets and Create Ticket only; Lab 4 adds a Dashboard entry
  because §7 requires role-appropriate Dashboard navigation.
- **Administrator**: the mockups show none; the Administrator sees the IT Staff dashboard read-only with
  account counts (§3.1, labsheet §4.6).

## 11. Visual and accessibility checklist

To be completed against the real screenshots in the evidence PR (Issue #85). Every box stays unticked until the
statement has been checked on screenshots at all three widths, and the evidence column gets filled in then.

- [ ] Zen Green tokens only; no new colour value outside `:root`. Evidence: pending.
- [ ] Dashboard cards, lists, badges and buttons match the Lab 2 and Lab 3 conventions. Evidence: pending.
- [ ] Role navigation shows only the role's destinations and marks the current page. Evidence: pending.
- [ ] Actions Taken editable fields (open Action) and read-only text (final Action, Requester view) are visibly
      different. Evidence: pending.
- [ ] Validation messages sit directly under their fields on the Action form. Evidence: pending.
- [ ] Shared (Requester-visible) Action content and private Internal Notes are told apart without reading the
      heading. Evidence: pending.
- [ ] Keyboard focus is visible on every new interactive control. Evidence: pending.
- [ ] No clipped labels, overlapping controls, hidden buttons or horizontal scrolling at 375, 850 and 1280 px on
      any screen in §12. Evidence: pending.
- [ ] Zero, empty, failure, conflict and locked states render as specified. Evidence: pending.

## 12. Screenshot paths

Files are `artifacts/lab-04/screenshots/<folder>/<viewport>-<state>.png` with `<viewport>` one of `desktop`
(1280x900), `tablet` (850x1100) and `mobile` (375x812), captured by `e2e/lab-04/responsive.spec.ts`. Folders
below the first three are additions to the labsheet's minimum structure.

| Screen | Folder | States |
|---|---|---|
| IT Staff Dashboard (and Administrator view) | `staff-dashboard/` | `loaded`, `zero`, `loading`, `failure`, `admin` |
| Requester Dashboard | `requester-dashboard/` | `loaded`, `zero`, `failure` |
| Actions Taken (staff and Requester) | `actions-taken/` | `list`, `create`, `validation`, `edit`, `final`, `stale`, `inactive-assignee`, `requester-view`, `locked` |
| Ticket workflow controls | `ticket-workflow/` | `allowed-transitions`, `resolution-blocked`, `resolved`, `stale` |
| Keyboard focus (desktop only) | `focus/` | `dashboard-card`, `action-form`, `status-control` |
