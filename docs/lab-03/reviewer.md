# Lab 3 - Peer Review Record

**Author:** Bannasorn Thongkorn - 67070503420 - GitHub: @Punge089
**Peer reviewer:** Papangkorn Jitvoottikrai - 67070503421 - GitHub: @book6349

Every conversation below was pulled from GitHub with `gh pr view` and `gh api` on 2026-09-19 (all times UTC),
not retyped from memory. Both directions are recorded: the PRs I authored that my partner reviewed, and the PRs
my partner authored that I reviewed.

## How the reviews were done

- Every Lab 3 PR went **feature branch -> `lab3-staging`**; none targeted `main`. The release PR
  (`lab3-staging` -> `main`) is the only PR into `main`.
- In every PR the **reviewer clicked "Merge pull request"**, not the author (Workflow Guide, Part 9). The
  "Merged by" column below was read from GitHub, not assumed.
- The reviewer left a review comment (a question about something real in the diff), the author replied, and the
  reviewer then submitted an **Approve** review. The reviewer's comment is a review summary, and GitHub does not
  allow replying under a review summary, so each reply is a **top-level PR comment that quotes the question**
  it answers. That is why the replies appear as PR comments rather than as threaded replies.
- The review messages were drafted with AI assistance and then posted by the two of us; `ai-use.md` says so.
  The exchanges on #72, #73 and #74 ran from question to approval in under half a minute, and my reviews of
  #41 and #42 took one to three minutes. The timestamps below show that plainly instead of hiding it.

## Pull Requests I authored (reviewed, approved and merged by @book6349)

| PR | Issue | Branch | Review comment | My reply | Approved | Merged by / at |
|----|-------|--------|----------------|----------|----------|----------------|
| [#69](https://github.com/Punge089/toktickit/pull/69) | #62 Sprint 3 engineering contract | feature/62-lab3-contract | 09-18 07:58 | 08:27 | 08:46 | @book6349, 08:46 |
| [#70](https://github.com/Punge089/toktickit/pull/70) | #63 Authentication foundation and User migration | feature/63-auth-foundation | 09-18 14:12 | 15:55 | 16:15 | @book6349, 16:15 |
| [#71](https://github.com/Punge089/toktickit/pull/71) | #64 Login UI, role shell, Requester regression | feature/64-auth-ui-regression | 09-19 02:50 | 08:38 | 08:38 | @book6349, 08:38 |
| [#72](https://github.com/Punge089/toktickit/pull/72) | #65 IT Staff Ticket Queue | feature/65-staff-queue | 09-19 08:49 | 08:49 | 08:49 | @book6349, 08:49 |
| [#73](https://github.com/Punge089/toktickit/pull/73) | #66 IT Staff Ticket operations, comments, notes | feature/66-staff-ticket-detail | 09-19 09:05 | 09:05 | 09:05 | @book6349, 09:05 |
| [#74](https://github.com/Punge089/toktickit/pull/74) | #67 Administrator user management | feature/67-admin-users | 09-19 09:37 | 09:37 | 09:38 | @book6349, 09:38 |

Two PRs are not in this table because this file cannot list the PR that introduces it: **#68's PR** (E2E,
screenshots, this file, `ai-use.md`) and the **release PR** `lab3-staging` -> `main`. Both are on the repository's
Pull Requests page and are covered in the submission PDF.

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

## Pull Requests I reviewed (authored by @book6349, in github.com/book6349/toktickit)

Recorded as of 2026-09-19. In both, @book6349 opened the PR into `lab3-staging`, I reviewed it against its Issue,
they answered, I approved, and **I** clicked "Merge pull request" (GitHub shows @Punge089 as the merger).

| PR | Issue | Branch | My review comment | Their reply | My approval | Merged by / at |
|----|-------|--------|-------------------|-------------|-------------|----------------|
| [#41](https://github.com/book6349/toktickit/pull/41) | #36 | feature/lab3-specification | 09-19 08:37 | 08:39 | 08:40 | @Punge089, 08:40 |
| [#42](https://github.com/book6349/toktickit/pull/42) | #37 | feature/lab3-auth-requester | 09-19 09:53 | 09:53 | 09:54 | @Punge089, 09:54 |

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

## What this record does not claim

- It lists only what GitHub shows. My partner's later Lab 3 PRs are not here because they did not exist when this
  file was written; they can be added the same way from `gh pr view -R book6349/toktickit <number>`.
- The reviews are short, single-question reviews, as in Lab 2. They are real questions about real code in each
  diff, but they are not line-by-line inspections, and I have not presented them as such.
