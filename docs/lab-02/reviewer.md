# Lab 2 - Peer Review Record

**Author:** Bannasorn Thongkorn - 67070503420 - GitHub: @Punge089
**Peer reviewer:** Papangkorn Jitvoottikrai - 67070503421 - GitHub: @book6349

## Pull Requests I authored (reviewed and approved by my partner)

Every PR **in the table below** was reviewed with a real comment, a real reply, and a genuine "Approve"
review (not a rubber-stamp) before it was merged, per the course's Part 9 agreement. Four later
documentation PRs (#50 to #53) did not follow that order, and PR #54 skipped the staging branch; all five
are recorded separately under "Where the workflow broke" rather than being listed here as if they had.

| PR | Issue | Branch | Reviewer verdict |
|----|-------|--------|-------------------|
| [#34](https://github.com/Punge089/toktickit/pull/34) | #21 | feature/21-sprint-spec | Commented, replied, Approved |
| [#35](https://github.com/Punge089/toktickit/pull/35) | #22 | feature/22-data-model-seed | Commented, replied, Approved |
| [#36](https://github.com/Punge089/toktickit/pull/36) | #23 | feature/23-zen-green-shell | Commented, replied, Approved |
| [#37](https://github.com/Punge089/toktickit/pull/37) | #24 | feature/24-reference-api | Commented, replied, Approved |
| [#38](https://github.com/Punge089/toktickit/pull/38) | #26 | feature/26-create-ticket-api | Commented, replied, Approved |
| [#39](https://github.com/Punge089/toktickit/pull/39) | #25 | feature/25-requester-context | Commented, replied, Approved |
| [#40](https://github.com/Punge089/toktickit/pull/40) | #27 | feature/27-create-ticket-ui | Commented, replied, Approved |
| [#41](https://github.com/Punge089/toktickit/pull/41) | #28 | feature/28-my-tickets-api | Commented, replied, Approved |
| [#42](https://github.com/Punge089/toktickit/pull/42) | (small fix, no Issue) | fix/server-test-isolation | Commented, replied, Approved |
| [#43](https://github.com/Punge089/toktickit/pull/43) | #29 | feature/29-my-tickets-ui | Commented, replied, Approved |
| [#44](https://github.com/Punge089/toktickit/pull/44) | #30 | feature/30-ticket-detail | Commented, replied, Approved |
| [#45](https://github.com/Punge089/toktickit/pull/45) | #31 | feature/31-attachments | Commented, replied, Approved |
| [#46](https://github.com/Punge089/toktickit/pull/46) | #32 | feature/32-e2e-visual | Commented, replied, Approved |
| [#47](https://github.com/Punge089/toktickit/pull/47) | #33 | docs/lab2-report | Commented, replied, Approved |
| [#48](https://github.com/Punge089/toktickit/pull/48) | #33 | docs/lab2-report | Commented, replied, Approved |
| [#49](https://github.com/Punge089/toktickit/pull/49) | (release) | lab2-staging → main | Commented, replied, Approved |

### PR #34 - Sprint 2 specification, API, UI, and test plan
**@book6349:** "Read through the docs, looks solid. Quick question on the 404 for ownership failures,
does that also cover a missing/wrong requester header, or is that a separate case?"
**Me:** "That's separate, actually. Missing/wrong header is 400/403 in section 0, the 404 in section 6
is specifically 'you're a valid requester but this ticket isn't yours.' Already added a cross-reference
between the two sections in the latest push so it's clearer without jumping around."
**@book6349:** "Alright, looks good." — Approved.

### PR #35 - Lab 2 data model, migration, and idempotent seed
**@book6349:** "Nice, seed looks solid. One thing though, why removedAt as DateTime instead of just an
isRemoved boolean? Seems like more columns than needed at first glance."
**Me:** "It's actually one column doing two jobs, removedAt null means active, removedAt set means
removed AND gives you the removal timestamp for free. Saves a second column and the index on
[ticketId, removedAt] covers both the 5-active-attachment check and splitting active vs removed for
display."
**@book6349:** "Ah that makes sense, good call." — Approved.

### PR #36 - Zen Green theme, reusable components, and app shell
**@book6349:** "Read through it, components look clean. Saw the tsconfig fix in the description, that's
a good catch. Quick q though, why place four page files that are basically just 'implemented in Issue X'
placeholders, why not just inline them in the router?"
**Me:** "Mainly so the router file stays readable as a route map instead of a wall of JSX, and so later
issues (25/27/29/30) can each touch one page file without touching AppRouter.tsx at all, keeps the
diffs smaller and avoids merge conflicts between those branches."
**@book6349:** "Fair enough, makes sense." — Approved.

### PR #37 - Reference data and Development Requester API
**@book6349:** "Noticed /api/categories now filters isActive, that's a behavior change from Lab 1
right? Won't break anything since all 4 seeded categories default to active, but wanted to flag it."
**Me:** "Yeah, intentional, api-spec.md section 1 requires it, only active reference data should ever
reach the selector/dropdowns. You're right it's invisible today since nothing's deactivated yet, added
a test that deactivates one and confirms it disappears from the response."
**@book6349:** "I see, that's good." — Approved.

### PR #38 - Create Ticket API
**@book6349:** "Why is the multer limit set to 4x the actual 5MB rule instead of just 5MB directly?"
**Me:** "Multer's limit is only a DoS safety net. The actual 5MB check happens per file in
checkAttachmentFile, so the ticket can still be created with valid files while reporting the oversized
one, as required by BR-19."
**@book6349:** "Ah that's smart, didn't think about the partial-failure case." — Approved.

### PR #39 - Development Requester Selection screen and context
**@book6349:** "Why sessionStorage instead of localStorage for the selected Requester? localStorage
would survive a refresh better."
**Me:** "That's intentional. BR-08 requires the login to reset per tab/session so it behaves like a
test fixture. sessionStorage still survives page refreshes but clears when the tab closes, unlike
localStorage."
**@book6349:** "Ah good point, makes sense for a Lab 3 handoff too." — Approved.

### PR #40 - Create Ticket screen
**@book6349:** "Noticed Cancel and Create Another both call the same resetForm(). Is that intentional
or should Cancel maybe navigate away instead of just clearing the form?"
**Me:** "Intentional for now, since there's nowhere else useful to navigate to yet, Ticket Detail isn't
built until Issue 30. Once that lands, Cancel could navigate to My Tickets instead, but for this issue
clearing the form keeps behavior consistent and testable without depending on a route that doesn't
exist yet."
**@book6349:** "Fair, makes sense to keep scope tight." — Approved.

### PR #41 - My Tickets list API
**@book6349:** "Why force id:desc as a secondary sort instead of just letting the primary sort field
settle ties on its own?"
**Me:** "Postgres doesn't guarantee row order for tied values without an explicit tiebreaker, so
without this, the same query could return rows in a different order on two separate requests, which
would break pagination, same row appearing on two pages or vanishing between them. id:desc is stable
since ids never repeat, so ties always resolve the same way every time."
**@book6349:** "Oh that's a real bug waiting to happen, good catch." — Approved.

### PR #42 - Fix: disable server test file parallelism (small fix, no dedicated Issue)
**@book6349:** "Makes sense but curious, did this actually cause a real failure or was it just
theoretical?"
**Me:** "Real one, caught it while starting Issue 29. Another file's insert was landing mid-test. Ran
it 4x after the fix, all green."
**@book6349:** "Good catch, that kind of flake is annoying to debug later." — Approved.

### PR #43 - My Tickets screen
**@book6349:** "Interesting approach, one row structure for both table and card instead of two separate
renders. Why not just render two different components and toggle with a media query or JS check?"
**Me:** "Mostly for testing, two renders would mean every test has to figure out which copy of a ticket
it's looking at. This way it's one row, CSS just reflows it per breakpoint."
**@book6349:** "Oh that's a good reason, avoids a whole class of DOM-duplication bugs too." — Approved.

### PR #44 - Requester Ticket Detail (API + UI)
**@book6349:** "Same 404-for-both pattern as before, makes sense given the earlier discussion. One
thing though, does the attachments list still come back even if the ticket itself has zero attachments,
or does it omit the field?"
**Me:** "Always comes back, just as an empty array. Keeps the response shape consistent so the frontend
never has to check if attachments exists before mapping over it."
**@book6349:** "Good, one less edge case to handle." — Approved.

### PR #45 - Attachment lifecycle (upload, download, soft removal)
**@book6349:** "Why fetch + blob + object URL instead of just a normal link to the download endpoint?"
**Me:** "The download endpoint needs X-Dev-Requester-Id to know who's asking, and a plain anchor tag
can't send custom headers on click. So it fetches with the header, gets the bytes back as a blob, then
hands that to the browser as a download via a throwaway object URL."
**@book6349:** "I understand it now." — Approved.

### PR #46 - E2E, responsive, and visual evidence
**@book6349:** "Curious how you got the 'API failure' screenshot without actually killing the server,
since the rest of the suite needs it running."
**Me:** "Playwright route interception, just for that one test it intercepts the POST /api/tickets call
and aborts it, so it looks like a real network failure to the page without touching the actual server.
Every other test still hits the real backend normally."
**@book6349:** "Excellent." — Approved.

### PR #47 - Lab 2 documentation and release prep
**@book6349:** "Wait, this row mentions you committed straight to lab2-staging by accident. That
actually happened during this sprint?"
**Me:** "Yeah, real mistake, not hypothetical. Happened on Issue 31, caught before pushing though since
the push failed on its own (wrong branch name), so nothing ever hit origin. Wrote it up honestly instead
of leaving it out."
**@book6349:** "Oh alright, approved." — Approved.

### PR #48 - Complete reviewer.md with bidirectional peer review
**@book6349:** "Oh this is the section that was missing from #47. All 10 look filled in now?"
**Me:** "Yep, all 10 plus your release PR (#34 on your repo), pulled straight from GitHub so it's the
actual comments/responses, not rewritten from memory."
**@book6349:** "Good, that completes it." — Approved.

### PR #49 - Lab 2 Release: TokTickIT Requester Ticketing MVP (lab2-staging → main)
**@book6349:** "Big one. Before I approve, quick sanity check, all 104 tests you listed actually ran on
lab2-staging right before opening this, not from an older commit?"
**Me:** "Yeah, ran all three suites (server/client/playwright) fresh right before opening this PR, pasted
the exact output in the description. Nothing cached from earlier in the sprint."
**@book6349:** "Approved, merging into main." — Approved.

## Pull Requests I reviewed for my partner

Reviewed all ten of @book6349's Lab 2 Issue PRs, plus their release PR, on their own individual-sprint
repo ([book6349/toktickit](https://github.com/book6349/toktickit)):

| PR | Title | My verdict |
|----|-------|------------|
| [#25](https://github.com/book6349/toktickit/pull/25) | Issue 5 - Sprint engineering contract and test plan | Commented + Approved |
| [#26](https://github.com/book6349/toktickit/pull/26) | Issue 6 - Database models, migrations, reference APIs, and idempotent seed | Commented + Approved |
| [#27](https://github.com/book6349/toktickit/pull/27) | Issue 7 - Requester selector, session context, application shell, and navigation | Commented + Approved |
| [#28](https://github.com/book6349/toktickit/pull/28) | Issue 8 - Create Ticket API, UI, validation, and initial attachments | Commented + Approved |
| [#29](https://github.com/book6349/toktickit/pull/29) | Issue 9 - My Tickets API and responsive list UI | Commented + Approved |
| [#30](https://github.com/book6349/toktickit/pull/30) | Issue 10 - Owned read-only Ticket Detail | Commented + Approved |
| [#31](https://github.com/book6349/toktickit/pull/31) | Issue 11 - Attachment upload, download, and soft removal | Commented + Approved |
| [#32](https://github.com/book6349/toktickit/pull/32) | Issue 12 - E2E flow, responsive screenshots, and visual audit | Commented + Approved |
| [#33](https://github.com/book6349/toktickit/pull/33) | Issue 13 - Evidence documents and final report preparation | Commented + Approved |
| [#34](https://github.com/book6349/toktickit/pull/34) | Lab 2 Release: TokTickIT Requester Ticketing MVP (lab2-staging to main) | Commented + Approved |

### PR #25 - Sprint engineering contract and test plan
**My comment:** "The four documents line up well. One thing I checked: how do you keep the simulated
Requester header from being mistaken for real authentication, and how do you know every acceptance
criterion is covered?"
**Partner's response:** "The specification labels X-Requester-Id as a testing-only context mechanism
and defers real authentication to Lab 3. The traceability table maps AC-01 through AC-22 to planned
tests, and the final-results table stays planned until a command actually runs."

### PR #26 - Database models, migrations, reference APIs, and idempotent seed
**My comment:** "The schema and seed cover several pieces at once. How did you make the migration and
seed safe to rerun, and how do the reference endpoints keep inactive categories, systems, and
requesters out of their responses?"
**Partner's response:** "The migration adds the relationships, constraints, and ownership indexes,
while the seed uses unique names and emails with upserts so repeated runs do not create duplicates.
Each reference endpoint filters isActive and returns the documented wrapper shape, with a safe error
when the database is unavailable."

### PR #27 - Requester selector, session context, application shell, and navigation
**My comment:** "The requester selector and shell are clear. How do you stop an inactive requester from
being reused if an old session value is still present?"
**Partner's response:** "The client rechecks the saved session value against the active requester list,
clears it when it is no longer active, and the server verifies the same active context on every
requester-scoped request. The header is only the Lab 2 simulation, not authentication."

### PR #28 - Create Ticket API, UI, validation, and initial attachments
**My comment:** "The create flow looks good. What happens if one initial file fails validation or
storage after the other files have been accepted?"
**Partner's response:** "The server validates every field and file before creating anything. If storage
or metadata creation fails, it removes any temporary files, stored objects, attachment rows, and the
ticket, so the initial batch is all-or-nothing. The ticket number and NEW status are server-generated."

### PR #29 - My Tickets API and responsive list UI
**My comment:** "Search, filters, and pagination are all here. What guarantees that a requester cannot
see another requester's ticket by changing a query parameter?"
**Partner's response:** "Every list query includes requesterId in the database where clause; search and
filters are applied on that owner-scoped query, not only in the browser. Invalid page, sort, filter, and
status values return INVALID_QUERY."

### PR #30 - Owned read-only Ticket Detail
**My comment:** "How does the detail endpoint handle a valid ticket ID that belongs to another
requester?"
**Partner's response:** "The lookup requires both the ticket ID and the selected requesterId. If either
the ticket is missing or the owner does not match, the API returns the same TICKET_NOT_FOUND response,
so it does not reveal another requester's record. The UI renders the returned fields read-only."

### PR #31 - Attachment upload, download, and soft removal
**My comment:** "Why soft-remove an attachment instead of deleting its row and file immediately?"
**Partner's response:** "Soft removal retains the original filename, type, size, upload time, removal
reason, and removal timestamp for audit visibility. Removed records cannot be downloaded or previewed,
and every upload, download, and removal query is scoped to the ticket owner."

### PR #32 - E2E flow, responsive screenshots, and visual audit
**My comment:** "The responsive and E2E coverage is planned. How will you avoid calling a screenshot or
flow passing before it actually runs?"
**Partner's response:** "The evidence section records the exact command, branch, date, and terminal
output. Desktop, tablet, and mobile screenshots are captured only after the corresponding checks run,
and deferred or failing checks remain explicitly labeled."

### PR #33 - Evidence documents and final report preparation
**My comment:** "What makes the final report auditable instead of just a list of green checks?"
**Partner's response:** "Each acceptance criterion links to implementation and test evidence, while
executed, failing, deferred, and unexecuted work are separated. The report also includes API examples,
screenshot filenames, review/approval references, merge events, and the final branch."

### PR #34 - Lab 2 Release: TokTickIT Requester Ticketing MVP (lab2-staging → main)
**My comment:** "The nine Lab 2 PRs are integrated and staging verification is recorded. I noticed E2E
and responsive screenshot evidence is still marked Pending. Will you attach that real evidence before
merging into main?"
**Partner's response:** "Yes. I'll attach the actual Playwright output and desktop/tablet/mobile
screenshots before treating the release as complete. I won't claim those checks passed early."

## Where the workflow broke: PR #50-53, and what #54 did about it

I broke my own rule on four PRs and I would rather explain it than hide it. PRs #50 to #53 were small
documentation fixes, and because they felt trivial I merged them into `lab2-staging` and `main` myself
without waiting for @book6349 to look at them first. Every PR before them went through review and
approval before merging; these four did not.

When I noticed, I asked @book6349 to review them anyway. GitHub will not let anyone approve a pull
request that has already been merged, so the only option left was a Comment review. That is why the four
rows below say "Commented (retroactive)" instead of "Approved". I am recording it that way on purpose: a
review that happened after the merge is not the same thing as an approval that gated the merge, and
labelling it "Approved" would make the history look cleaner than it actually was.

PR #54, which added this section, is the partial correction. I opened it, left it open, and did not touch
the merge button until @book6349 had commented, I had answered, and they had actually clicked Approve.
It still has one defect of its own, listed in the table: it went from its branch straight into `main`
rather than through `lab2-staging`, so it got the review right and the branch flow wrong. Between #49,
#51, #53 and #54, the release reached `main` through four Pull Requests rather than the single one the
Definition of Done describes.

| PR | Base ← Head | Purpose | Reviewer verdict | Workflow defect |
|----|-------------|---------|-------------------|-----------------|
| [#50](https://github.com/Punge089/toktickit/pull/50) | lab2-staging ← fix/lab2-doc-accuracy | Fix 3 doc accuracy issues (test provenance, screenshot count, E2E count) | Commented (retroactive) | Merged before review |
| [#51](https://github.com/Punge089/toktickit/pull/51) | main ← lab2-staging | Release carrying #50 into main | Commented (retroactive) | Merged before review |
| [#52](https://github.com/Punge089/toktickit/pull/52) | lab2-staging ← fix/tests-md-stale-note | Remove stale "superseded by main" note in tests.md | Commented (retroactive) | Merged before review |
| [#53](https://github.com/Punge089/toktickit/pull/53) | main ← lab2-staging | Release carrying #52 into main | Commented (retroactive) | Merged before review |
| [#54](https://github.com/Punge089/toktickit/pull/54) | main ← docs/reviewer-retroactive-review | Added this section | Commented, replied, **Approved before merge** | Skipped the `lab2-staging` hop |

### PR #50 - Fix: 3 documentation accuracy issues
**@book6349:** "Reviewing this after the merge, sorry I missed it before. The E2E note about 1 test vs
3 planned-test rows is a good clarification, would've been confusing without it. One thing, was the
24→27 screenshot count actually causing a real discrepancy or just a stale number?"

### PR #51 - Lab 2 Release: documentation accuracy fix
**@book6349:** "This is just the release carrying #50 into main, right? Nothing new here."

### PR #52 - Fix: remove stale 'superseded by main' note in tests.md
**@book6349:** "Nice self-catch, saying 'confirmed from main' then 'will be superseded by main' right
after was definitely confusing. Good you caught it yourself."

### PR #53 - Lab 2 Release: remove stale note in tests.md
**@book6349:** "Same as #51, just the release for #52 into main?"

### PR #54 - Recording all of the above (reviewed and approved before merge)
**@book6349:** "GitHub only lets you Comment (not Approve) on an already-merged PR, so #50-53 stay
'Commented' in GitHub's own history forever, right? reviewer.md's the only place that's spelled out?"
**Me:** "Yep, that's a GitHub limitation, no way around it. reviewer.md labels them 'Commented
(retroactive)' so it's explicit they were reviewed properly, just not pre-merge like the rest."
**@book6349:** "Makes sense, and this one's actually pre-merge like it should be." — Approved, then
merged.
