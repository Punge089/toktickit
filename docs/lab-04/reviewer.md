# Lab 4 - Peer Review Record

**Author:** Bannasorn Thongkorn - 67070503420 - GitHub: @Punge089
**Peer reviewer:** Papangkorn Jitvoottikrai - 67070503421 - GitHub: @book6349

Every conversation below was pulled from GitHub with `gh pr view` and `gh api` on 2026-10-31 and 2026-11-01 (all
times UTC), not retyped from memory. Both directions are recorded: the Pull Requests I authored that my partner reviewed, and the
Pull Requests my partner authored that I reviewed.

## How the reviews were done

- Every Lab 4 feature Pull Request went **feature branch -> `lab4-staging`**; none targeted `main`. The only Pull
  Requests into `main` are release Pull Requests from `lab4-staging` (#94, and the later ones that promote
  documentation updates, see the note under the first table).
- In every Pull Request the **reviewer clicked "Merge pull request"**, not the author (Workflow Guide, Part 9). The
  "Merged by" column below was read from GitHub, not assumed.
- The reviewer left a review comment (a question about something real in the diff), the author replied, and the
  reviewer then submitted an **Approve** review. A review summary cannot be replied to under GitHub's review
  model, so each reply is a **top-level Pull Request comment that quotes the question** it answers.
- The review messages of my own Pull Requests and of my partner's #57 to #62 were drafted with AI assistance and
  then posted by the two of us; `ai-use.md` says so. The review messages I wrote on my partner's #63 to #66 I wrote
  myself, without that assistance. The timestamps show how quick the reviews were instead of hiding it: from
  question to approval, seven of my eight Pull Requests below (#87, #88, #89, #90, #91, #93, #94) took 7 minutes or
  less (#91 under one), and so did nine of my partner's ten (#57 to #64 and #66). The slow ones are my #92, 51
  minutes from question to approval, and my partner's #65, 14 minutes.

## Pull Requests I authored (reviewed, approved and merged by @book6349)

| PR | Issue | Branch | Review comment | My reply | Approved | Merged by / at |
|----|-------|--------|----------------|----------|----------|----------------|
| [#87](https://github.com/Punge089/toktickit/pull/87) | #79 Sprint 4 engineering contract | feature/79-lab4-contract | 10-30 14:12 | 14:17 | 14:19 | @book6349, 14:20 |
| [#88](https://github.com/Punge089/toktickit/pull/88) | #80 Actions Taken foundation (migration, model, seed, API) | feature/80-actions-taken-foundation | 10-30 14:44 | 14:45 | 14:46 | @book6349, 14:46 |
| [#89](https://github.com/Punge089/toktickit/pull/89) | #81 Ticket workflow: resolution gate and stale-update handling | feature/81-ticket-workflow | 10-30 15:13 | 15:15 | 15:16 | @book6349, 15:16 |
| [#90](https://github.com/Punge089/toktickit/pull/90) | #82 Actions Taken UI | feature/82-actions-taken-ui | 10-30 15:35 | 15:37 | 15:39 | @book6349, 15:39 |
| [#91](https://github.com/Punge089/toktickit/pull/91) | #83 Role dashboards (Requester and IT Staff) | feature/83-dashboards | 10-30 16:30 | 16:30 | 16:30 | @book6349, 16:31 |
| [#92](https://github.com/Punge089/toktickit/pull/92) | #84 Final hardening and regression | feature/84-final-hardening | 10-31 11:24 | 12:13 | 12:15 | @book6349, 12:16 |
| [#93](https://github.com/Punge089/toktickit/pull/93) | #85 Sprint 4 evidence, screenshots, traceability and review records | feature/85-e2e-evidence | 10-31 13:03 | 13:07 | 13:09 | @book6349, 13:09 |
| [#94](https://github.com/Punge089/toktickit/pull/94) | #86 Release: promote `lab4-staging` to `main` (base `main`) | lab4-staging | 10-31 14:49 | 14:52 | 14:52 | @book6349, 14:52 |

#93 and #94 were added after the release by a small docs-only Pull Request, because a file cannot list the Pull
Request that introduces it (#93 added this file; #94 released it). The docs-only Pull Requests that follow, each with
the release Pull Request that promotes it to `main` (#95 to #98, and the last two, which add my partner's #63 to
#66 to this record), are likewise not in this table; they are on the repository's Pull Requests page and are
covered in the submission PDF.

### PR #87 - Issue 79: Sprint 4 engineering contract
**@book6349:** "BR-06 lets an Administrator create and edit Actions, but Lab 3 made Administrators read-only on tickets. Doesn't that conflict?"
**Me:** "Labsheet 4.3 says Administrators perform IT Staff behavior for Actions, so only Actions open up. Owner, priority, status, comments and notes stay 403, and SEC-03 tests both sides."
**@book6349:** "Fair, the split is clear and every AC has a test row. Approved." - Approved, then merged by @book6349.

### PR #88 - Issue 80: Actions Taken foundation (migration, model, seed, API)
**@book6349:** "In POST, why is the clientRequestId replay checked before ACTIONS_LOCKED? A retry on a Resolved ticket would return 200 instead of 409."
**Me:** "Yes, on purpose: a retry of a request that already succeeded should get its original answer, and a new Action on that ticket is still ACTIONS_LOCKED. API-11 covers the replay after the ticket becomes Resolved, and I wrote this order into api-spec §2."
**@book6349:** "The migration only adds things and the guards are tested, so this is fine to merge. Approved." - Approved, then merged by @book6349.

### PR #89 - Issue 81: Ticket workflow gate, versioned updates and cancel cascade
**@book6349:** "In the Cancel path the Actions are cancelled before the Ticket UPDATE runs. If that UPDATE loses a race, could the Actions stay cancelled?"
**Me:** "No, a lost race throws inside the transaction, so the Action changes roll back with it. WF-04 sends a stale cancel and checks the Actions stay Planned."
**@book6349:** "The gate, the lock and the rollback are all covered by tests that fail when the guard is removed. Approved." - Approved, then merged by @book6349.

### PR #90 - Issue 82: Actions Taken UI for IT Staff and Requester
**@book6349:** "When the same form is saved twice after a failed first try, how do you stop the server from creating two Actions?"
**Me:** "The form makes one clientRequestId when it opens and reuses it for every retry, so the server returns the first Action. UI-11 checks that the retry sends the same id."
**@book6349:** "The form keeps what was typed after every error and the write controls follow the ticket status. Approved." - Approved, then merged by @book6349.

### PR #91 - Issue 83: Requester and IT Staff dashboards with drill-down
**@book6349:** "How do you know a dashboard card and the list it opens always show the same number?"
**Me:** "Both use one shared list of active statuses, and SDASH-03 and RDASH-05 compare each card with the totalItems of the list it opens. Dropping Reopened from the dashboard made four of them fail."
**@book6349:** "Every card is checked against raw SQL and against its own list, and the old tests were updated, not removed. Approved." - Approved, then merged by @book6349.

### PR #92 - Issue 84: Final hardening, regression sweep and README refresh
**@book6349:** "Why use a ref in useSingleFlight when the buttons are already disabled while a request is running?"
**Me:** "The button only disables after React re-renders, so two submits in the same tick would both pass. UI-24 sends two in one tick and fails if the guard is removed."
**@book6349:** "The guard is small, tested against a real double submit, and the sweep covers every role. Approved." - Approved, then merged by @book6349.

### PR #93 - Issue 85: Sprint 4 evidence, screenshots, traceability and review records
**@book6349:** "Why does the traceability script require a \"Pass\" result instead of just checking that every requirement has a test?"
**Me:** "A planned test can exist with no result at all, so the script fails unless at least one mapped test is Pass and its file really names the test. It reports 98 of 98 now."
**@book6349:** "The checklist matches the screenshots and the script gives a clear pass or fail. Approved." - Approved, then merged by @book6349.

### PR #94 - Issue 86: Release, promote `lab4-staging` to `main`
**@book6349:** "Why is the last checklist item, the run on main, still unticked in this PR?"
**Me:** "It can only be true after the merge, so I will run the same three suites on main right after and record the numbers in tests.md. It stays unticked rather than claimed early."
**@book6349:** "The counts match what was reviewed in the earlier PRs and nothing new is in here. Approved." - Approved, then merged by @book6349 (the Lab 4 release into `main`). The run on `main` that I promised is in `tests.md` section 8.

## Pull Requests I reviewed (authored by @book6349, in github.com/book6349/toktickit)

Recorded as of 2026-11-01. In each, @book6349 opened the Pull Request, I reviewed it, they answered, I approved, and
**I** clicked "Merge pull request" (GitHub shows @Punge089 as the merger). #57 to #62 went into `lab4-staging`; #63
is my partner's release of their `lab4-staging` into `main`, and #64 to #66 are their report and evidence updates
into `main`. My partner has no Pull Request open at the time of writing.

| PR | Issue | Branch | My review comment | Their reply | My approval | Merged by / at |
|----|-------|--------|-------------------|-------------|-------------|----------------|
| [#57](https://github.com/book6349/toktickit/pull/57) | #51 Lab 4 Issue 1 - Engineering Contract, Test DD and Documentation Cleanup | feature/lab4-contract-docs | 10-30 14:16 | 14:19 | 14:22 | @Punge089, 14:30 |
| [#58](https://github.com/book6349/toktickit/pull/58) | #52 Lab 4 Issue 2 - Actions Taken Data Model and API | feature/lab4-actions-foundation | 10-30 14:57 | 14:57 | 14:58 | @Punge089, 14:58 |
| [#59](https://github.com/book6349/toktickit/pull/59) | #53 Lab 4 Issue 3 - Actions Taken UI | feature/lab4-actions-ui | 10-30 15:33 | 15:34 | 15:37 | @Punge089, 15:37 |
| [#60](https://github.com/book6349/toktickit/pull/60) | #54 Lab 4 Issue 4 - Ticket Workflow and Resolution Enforcement | feature/lab4-ticket-workflow | 10-30 16:22 | 16:22 | 16:23 | @Punge089, 16:23 |
| [#61](https://github.com/book6349/toktickit/pull/61) | #55 Lab 4 Issue 5 - Requester and Staff Dashboards | feature/lab4-dashboards | 10-31 12:12 | 12:15 | 12:20 | @Punge089, 12:20 |
| [#62](https://github.com/book6349/toktickit/pull/62) | Lab 4 - Final Regression, Hardening and Evidence | feature/lab4-final-hardening | 10-31 14:56 | 14:56 | 14:57 | @Punge089, 14:57 |
| [#63](https://github.com/book6349/toktickit/pull/63) | Lab 4 - Promote reviewed staging release to main (into `main`) | lab4-staging | 10-31 15:11 | 15:11 | 15:12 | @Punge089, 15:12 |
| [#64](https://github.com/book6349/toktickit/pull/64) | Lab 4 - Main Verification and Report Update (into `main`) | docs/lab4-main-verification-20261031 | 10-31 16:00 | 16:00 | 16:01 | @Punge089, 16:01 |
| [#65](https://github.com/book6349/toktickit/pull/65) | Lab 4 - Complete Accessibility and Release Evidence (into `main`) | test/lab4-accessibility-release | 11-01 06:13 | 06:22 | 06:27 | @Punge089, 06:27 |
| [#66](https://github.com/book6349/toktickit/pull/66) | Lab 4 - Final Main Report and Verification Evidence (into `main`) | docs/lab4-final-main-report-20261101 | 11-01 07:02 | 07:02 | 07:04 | @Punge089, 07:04 |

### PR #57 - Lab 4 Issue 1 - Engineering Contract, Test DD and Documentation Cleanup
**Me:** "Please confirm every acceptance criterion maps to a named test and the AI-use entries are actual prompts."
**@book6349:** "I added both items: the [test mapping](https://github.com/book6349/toktickit/blob/fd390c3d0a462bcaccd28e46e52b5ea65ffc72e8/docs/lab-04/tests.md#2-acceptance-criterion-traceability) in [commit fd390c3](https://github.com/book6349/toktickit/commit/fd390c3d0a462bcaccd28e46e52b5ea65ffc72e8), and actual prompt excerpts in the [AI-use record](https://github.com/book6349/toktickit/blob/93f4de6095822a56bb7d1db9d2f6ad8612244f21/docs/lab-04/ai-use.md), added by [commit 93f4de6](https://github.com/book6349/toktickit/commit/93f4de6095822a56bb7d1db9d2f6ad8612244f21)."
**Me:** "The contract and test mapping are consistent, and my comments have been addressed. Approved." - Approved, then merged by me.

### PR #58 - Lab 4 Issue 2 - Actions Taken Data Model and API
**Me:** "Please check actor attribution, access control, idempotency, lifecycle rules and migration recovery."
**@book6349:** "I checked actor attribution, access control, idempotency, lifecycle rules, and migration recovery. The server suite passed 227 tests, including 37 PostgreSQL checks; the build and Prisma validation passed too. The implementation is in [commit b51723b](https://github.com/book6349/toktickit/commit/b51723b962843a7b8a7b2891977b726c8b6b7c79), with the handoff correction in [commit 0b106c4](https://github.com/book6349/toktickit/commit/0b106c41e11781d91e4935986ad7075975244b01)."
**Me:** "Ok comments resolved, Approved." - Approved, then merged by me.

### PR #59 - Lab 4 Issue 3 - Actions Taken UI
**Me:** "Can Requesters view Actions Taken without editing it, and does the form retain input after a failed save?"
**@book6349:** "Requesters can view Actions Taken but cannot add or edit entries. Failed saves keep the form values for retry. Both behaviors are covered by the [component tests](https://github.com/book6349/toktickit/blob/ce48476ee488ebde59c0b31c3449f5725ffbe072/client/tests/lab-04/ActionsTaken.test.tsx) and [browser flow](https://github.com/book6349/toktickit/blob/ce48476ee488ebde59c0b31c3449f5725ffbe072/e2e/lab-04/actions-taken-flow.spec.ts); both passed."
**Me:** "Requester access stays read-only, and failed saves preserve input. Looks good to merge." - Approved, then merged by me.

### PR #60 - Lab 4 Issue 4- Ticket Workflow and Resolution
**Me:** "Try invalid status changes and blocked resolutions; neither should alter the ticket."
**@book6349:** "Both rejected paths leave Ticket state unchanged. The API suite covers the full transition matrix, resolution gates, and stale-version conflicts."
**Me:** "Invalid transitions and blocked resolutions leave ticket state intact. I approve." - Approved, then merged by me.

### PR #61 - Lab 4 Issue5 - Requester and Staff Dashboards
**Me:** "Compare dashboard totals with their ticket lists, including the date-range boundaries."
**@book6349:** "Server tests confirm the dashboard totals and drill-downs share the same filters, including inclusive UTC date bounds. The dashboard browser journey passed; 306 server tests, 58 client tests, and both builds passed. Lab 1–3 regression and the remaining Lab 4 browser journeys are still pending."
**Me:** "Totals match the underlying tickets across the tested date windows. Approved to merge." - Approved, then merged by me.

### PR #62 - Lab 4 - Final Regression, Hardening and Evidence
**Me:** "Please check the full-regression results and confirm the responsive captures match the tested build."
**@book6349:** "The 21-test run, 24 captures, editable report, and PDF are included on this PR at [report commit 4f4a847](https://github.com/book6349/toktickit/commit/4f4a8479ddf4040f5b788bc577555e1e3bca3148)."
**Me:** "The results and captures match this revision. Approved to merge." - Approved, then merged by me.

### PR #63 - Lab 4 - Promote reviewed staging release to main
**Me:** "Please confirm the staged scope and note how the pending CI and main-branch checks will be verified."
**@book6349:** "The PR lists the local results; CI and main verification are still pending. I will keep any review fixes on this PR."
**Me:** "Reviewed the scope and verification notes. Approved." - Approved, then merged by me.

### PR #64 - Lab 4 - Main Verification and Report Update
**Me:** "Please confirm the report matches the tested main revision and clearly lists the remaining gaps."
**@book6349:** "Updated in [commit 993af6a](https://github.com/book6349/toktickit/commit/993af6ab3655bd69305d5068034dec87b3c2b2a6). The report includes the main verification logs and remaining evidence gaps."
**Me:** "The report matches the recorded results and states its limits clearly. Approved." - Approved, then merged by me.

### PR #65 - Lab 4 - Complete Accessibility and Release Evidence
**Me:** "Please check the keyboard and 320px evidence, recovery cases, and release checklist against the recorded revision."
**@book6349:** "The evidence and verification limits are documented on this branch in the release notes."
**Me:** "The accessibility evidence and release checks are clear. Approved." - Approved, then merged by me.

### PR #66 - Lab 4 - Final Main Report and Verification Evidence
**Me:** "Please check that the final-main revision, test logs, and report claims align."
**@book6349:** "I updated the report from merged main and included the full test logs. GitHub reported no status checks for this revision."
**Me:** "The revision, test record, and report are consistent. Approved to merge." - Approved, then merged by me.

## What this record does not claim

- It lists only what GitHub shows, read on 2026-10-31 and 2026-11-01. Anything opened after that is not here; it can
  be added the same way from `gh pr view <number>` (and `-R book6349/toktickit` for my partner's).
- The reviews are short, single-question reviews, as in Labs 2 and 3. They are real questions about real code in
  each diff, but they are not line-by-line inspections, and I have not presented them as such. Several of my
  partner's questions are broad checklists ("Please check actor attribution, access control, idempotency, lifecycle
  rules and migration") rather than a question about one line.
- For my own Pull Requests and my partner's #57 to #62 the same AI assistance produced both sets of messages, so
  those questions and answers are not independent of each other. (The messages I wrote on #63 to #66 are my own.) What is independent is that each Pull Request was opened by one of us, approved by the other, and merged by
  the approver.
