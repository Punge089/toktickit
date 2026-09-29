# Lab 3 - Peer Review Record

**Author:** Bannasorn Thongkorn - 67070503420 - GitHub: @Punge089
**Peer reviewer:** Papangkorn Jitvoottikrai - 67070503421 - GitHub: @book6349

Every conversation below was pulled from GitHub with `gh pr view` and `gh api` on 2026-09-19 and 2026-09-29 (all
times UTC), not retyped from memory. Both directions are recorded: the PRs I authored that my partner reviewed, and the PRs
my partner authored that I reviewed.

## How the reviews were done

- Every Lab 3 PR went **feature branch -> `lab3-staging`**; none targeted `main`. The only PRs into `main` are
  release PRs from `lab3-staging` (#76, and a second one that carries the docs-only update to this file).
- In every PR the **reviewer clicked "Merge pull request"**, not the author (Workflow Guide, Part 9). The
  "Merged by" column below was read from GitHub, not assumed.
- The reviewer left a review comment (a question about something real in the diff), the author replied, and the
  reviewer then submitted an **Approve** review. The reviewer's comment is a review summary, and GitHub does not
  allow replying under a review summary, so each reply is a **top-level PR comment that quotes the question**
  it answers. That is why the replies appear as PR comments rather than as threaded replies.
- The review messages were drafted with AI assistance and then posted by the two of us; `ai-use.md` says so.
  The exchanges on #72, #73, #74, #75 and #76 ran from question to approval in under a minute, and my reviews
  of #41 to #45 took one to three minutes each. The timestamps below show that plainly instead of hiding it.

## Pull Requests I authored (reviewed, approved and merged by @book6349)

| PR | Issue | Branch | Review comment | My reply | Approved | Merged by / at |
|----|-------|--------|----------------|----------|----------|----------------|
| [#69](https://github.com/Punge089/toktickit/pull/69) | #62 Sprint 3 engineering contract | feature/62-lab3-contract | 09-18 07:58 | 08:27 | 08:46 | @book6349, 08:46 |
| [#70](https://github.com/Punge089/toktickit/pull/70) | #63 Authentication foundation and User migration | feature/63-auth-foundation | 09-18 14:12 | 15:55 | 16:15 | @book6349, 16:15 |
| [#71](https://github.com/Punge089/toktickit/pull/71) | #64 Login UI, role shell, Requester regression | feature/64-auth-ui-regression | 09-19 02:50 | 08:38 | 08:38 | @book6349, 08:38 |
| [#72](https://github.com/Punge089/toktickit/pull/72) | #65 IT Staff Ticket Queue | feature/65-staff-queue | 09-19 08:49 | 08:49 | 08:49 | @book6349, 08:49 |
| [#73](https://github.com/Punge089/toktickit/pull/73) | #66 IT Staff Ticket operations, comments, notes | feature/66-staff-ticket-detail | 09-19 09:05 | 09:05 | 09:05 | @book6349, 09:05 |
| [#74](https://github.com/Punge089/toktickit/pull/74) | #67 Administrator user management | feature/67-admin-users | 09-19 09:37 | 09:37 | 09:38 | @book6349, 09:38 |
| [#75](https://github.com/Punge089/toktickit/pull/75) | #68 E2E, visual evidence, review records | feature/68-e2e-evidence | 09-19 10:33 | 10:34 | 10:34 | @book6349, 10:34 |
| [#76](https://github.com/Punge089/toktickit/pull/76) | #68 (release into main) | lab3-staging -> main | 09-19 10:47 | 10:48 | 10:48 | @book6349, 10:48 |

Two more PRs are not in this table, because a file cannot list the PR that introduces it: the **docs-only PR**
that added the partner-review entries below and the **release PR** that carried it into `main`. Both are on the
repository's Pull Requests page and are covered in the submission PDF.

### PR #69 - Sprint 3 engineering contract
**@book6349:** "The mockup literally says Ticket Owner can be IT Staff or Administrator, but your schema only
allows IT Staff. Why not just follow the mockup?"
**Me:** "Because section 4.3 says Admin doesn't need IT ticket ops unless the authorization matrix explicitly
permits it, so I read that as opt-in by default off. I wrote it up as an explicit Assumption in
specification.md section 11 instead of just picking one silently, so it's traceable if we need to revisit it."
**@book6349:** "Good catch, approved"

### PR #70 - Authentication foundation and User migration
**@book6349:** "I see requesterAuth.ts and the header-based routes are still there and untouched by session auth.
Why not switch everything to cookies in this PR since you already built the session code."
**Me:** "Split on purpose to match the Issue plan. The actual cutover to cookies happens in #64 along with
removing the selector UI."
(The pasted reply on GitHub shows "#64" as a link to an unrelated website; that is a paste artefact in the
comment, not a reference to it.)
**@book6349:** "Makes sense, and the sequencing is clear from the migration test. Approved."

### PR #71 - Login UI, role-aware shell, and Requester regression
**@book6349:** "The PR body mentions Buppha's seed tickets got reassigned to fix a broken e2e test. What
happened there?"
**Me:** "My first seed pass gave every active Requester some tickets, but the Lab 2 e2e suite needs one
Requester with zero tickets to test the empty-account state. Buppha was that fixture in Lab 2, so I moved her
seed tickets to other Requesters instead of touching the test."
**@book6349:** "Nice catch on the seed data, that's exactly the kind of thing a green suite hides. Approved."

### PR #72 - IT Staff Ticket Queue
**@book6349:** "Why does a page past the end return an empty list instead of a 400 like My Tickets does?"
**Me:** "The queue is shared and changes constantly, so someone paging while tickets get closed hitting a 400 would
be annoying, not a real error. QUE-04 covers it."
**@book6349:** "Clear reasoning on the empty-page behaviour, and the parser tests cover it well. Approved."

### PR #73 - IT Staff Ticket operations, comments, and notes
**@book6349:** "The status transitions are checked in transitions.ts, but the UI only shows allowed options too.
Isn't that the same rule written twice?"
**Me:** "No, the UI doesn't have its own copy. The API returns allowedTransitions and the dropdown just renders
that list, and UNIT-03 checks the matrix against a separately written table."
**@book6349:** "Good call keeping the matrix in one place, that answers my worry. Approved."

### PR #74 - Administrator user management
**@book6349:** "Why lock the active Administrator rows with FOR UPDATE in the PATCH handler? Couldn't you just
count the other active admins and refuse if there are none?"
**Me:** "A plain count lets two admins demote each other at the same moment and both pass, leaving zero. The two
race tests in users-admin.api.test.ts fail without the lock."
**@book6349:** "Fair point, and good that the race is actually tested instead of assumed. Approved."

### PR #75 - E2E, visual evidence, and review records
**@book6349:** "Why does the E2E global setup delete users and re-seed the dev database instead of running against
the separate test database?"
**Me:** "The suite logs in through the real screens against the running dev servers, so it needs the dev database,
and the cleanup only removes emails starting with e2e. that the suite itself creates. The seed puts the documented
accounts back in a known state before every run."
**@book6349:** "Fair enough, and good that the cleanup can't touch real accounts. Approved."

### PR #76 - Lab 3 Release: lab3-staging into main
**@book6349:** "Just the release for #69 to #75, nothing new?"
**Me:** "Yes, exactly those seven PRs. Server 171, client 95 and E2E 128 pass on lab3-staging."
**@book6349:** "Thanks for confirming, that matches the merge list. Approved."

## Pull Requests I reviewed (authored by @book6349, in github.com/book6349/toktickit)

Recorded as of 2026-09-29, when all six of their Lab 3 PRs (#41 to #46) were merged. In #41 to #45, @book6349
opened the PR into `lab3-staging`, I reviewed it against its Issue, they answered, I approved, and **I** clicked
"Merge pull request" (GitHub shows @Punge089 as the merger). #46 is their release PR into `main`; I asked for a
fix first, they answered, I approved, and I merged it.

| PR | Issue | Branch | My review comment | Their reply | My approval | Merged by / at |
|----|-------|--------|-------------------|-------------|-------------|----------------|
| [#41](https://github.com/book6349/toktickit/pull/41) | #36 | feature/lab3-specification | 09-19 08:37 | 08:39 | 08:40 | @Punge089, 08:40 |
| [#42](https://github.com/book6349/toktickit/pull/42) | #37 | feature/lab3-auth-requester | 09-19 09:53 | 09:53 | 09:54 | @Punge089, 09:54 |
| [#43](https://github.com/book6349/toktickit/pull/43) | #38 | feature/lab3-staff-workflow | 09-19 10:31 | 10:31 | 10:32 | @Punge089, 10:32 |
| [#44](https://github.com/book6349/toktickit/pull/44) | #39 | feature/lab3-admin-users | 09-19 12:07 | 12:08 | 12:10 | @Punge089, 12:10 |
| [#45](https://github.com/book6349/toktickit/pull/45) | #40 | feature/lab3-integration-evidence | 09-19 14:13 | 14:14 | 14:16 | @Punge089, 14:16 |
| [#46](https://github.com/book6349/toktickit/pull/46) | #40 (release into main) | lab3-staging -> main | 09-19 14:35 | 14:35 | 14:36 | @Punge089, 17:01 |

### PR #41 - Lab 3 PR 1: Engineering Contract and Test DD
**Me:** "I reviewed PR #41 against Issue #36. How will the planned migration and authorization tests prove
Ticket/Attachment ownership and separate Administrator permissions from the IT Staff Queue? Please cite the
Planned traceability entries."
**@book6349:** "Thanks. The specification is the source of truth; linked documents share its decisions. Evidence
stays Planned until executed. Server sessions, role checks, session-derived Requester ownership, separate
Internal Notes, and no Lab 2 header/selector define the boundaries."
**Me:** "Ok looking good, approve!" - Approved, then merged by me.

### PR #42 - Lab 3 PR 2: Authentication, Migration, Authorization, and Requester Regression
**Me:** "I reviewed ISSUE-02. How does mustChangePassword limit access to password change/logout, and how do
direct tests prevent ownership bypass through altered IDs?"
**@book6349:** "Password-change sessions allow only current-user, CSRF, password-change, and logout. Ownership
comes from the session; client IDs are ignored, and altered-ID tests verify safe rejection without data leakage."
**Me:** "I reviewed the ISSUE-02 authentication, migration, authorization, and Requester tests. The protections
are supported and ready for lab3-staging. Approved." - Approved, then merged by me.

### PR #43 - Lab 3 PR 3: IT Staff Queue, Ticket Detail, and Ticket Operations
**Me:** "How does the backend enforce transitions, confirmation, and Internal Note privacy independently of the
UI? Please cite the direct tests and separate Public Comment/Internal Note controls."
**@book6349:** "The server checks status, target, role, and confirmation; tests cover valid, invalid,
missing-confirmation, and forbidden transitions. Internal Notes use separate routes/queries, never appear in
Requester responses, and have separate controls and tests."
**Me:** "Got it, look complete and ready for lab3-staging, approved." - Approved, then merged by me.

### PR #44 - Lab 3 PR 4: Administrator User Management
**Me:** "How does the API prevent self-deactivation and last-admin deactivation during concurrent updates? Please
cite the safety tests and API backing for the UI restrictions."
**@book6349:** "The transaction re-reads the target and active-Administrator count, then rejects
unsafe/conflicting updates. API tests cover self/last-admin safety, duplicate email, invalid role, and
non-Administrator access; the UI only presents feedback."
**Me:** "Ok looking good and ready now, approved." - Approved, then merged by me.

### PR #45 - Lab 3 PR 5: Integrated E2E, Visual Evidence and Lab 3 Release Integration
**Me:** "How does the evidence prove results come from the integrated branch rather than a fixture or feature
branch? Please cite the branch/SHA, commands, screenshot index, and deferred or partial items."
**@book6349:** "Each result records branch, SHA, date, command/exit status, or screenshot index. Fixture and real
database runs are separated; final checks repeat after integration. Evidence is labeled honestly, and the final
PDF was rendered and checked for clipping, numbering, screenshots, and links."
**Me:** "I've reviewed the evidence and found it easy to trace, with the limitations clearly stated. so approved
for lab3-staging and the subsequent release PR to main." - Approved, then merged by me.

### PR #46 - Lab 3 Release PR: Promote lab3-staging to main
**Me:** "Reviewed PR #46. Please resolve the conflicts in the four listed files and rerun the required checks
before approval."
**@book6349:** "Thanks. I resolved the conflicts, reran the required checks, and confirmed the results in the PR.
Ready for final review."
**Me:** "Approved. Conflicts are resolved, required checks passed, Issue #40 is linked, and the PR targets main.
Ready to merge!" - Approved at 14:36. I merged it at 17:01, about two and a half hours later; I did not record why
in the PR, so I make no claim about the gap.

## What this record does not claim

- It lists only what GitHub shows, read on 2026-09-29. Anything my partner opens after that is not here; it can be
  added the same way from `gh pr view -R book6349/toktickit <number>`.
- The reviews are short, single-question reviews, as in Lab 2. They are real questions about real code in each
  diff, but they are not line-by-line inspections, and I have not presented them as such.
