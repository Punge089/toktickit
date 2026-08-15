# Lab 1 - Peer Review Record

**Author:** Bannasorn Thongkorn - 67070503420 - GitHub: @Punge089
**Peer reviewer:** book6349 - GitHub: @book6349

## Pull Requests I authored (reviewed by my partner)
| PR | Branch | Reviewer verdict |
|----|--------|------------------|
| [#5](https://github.com/Punge089/toktickit/pull/5) | feature/1-project-foundation | Commented, merged after response |
| [#6](https://github.com/Punge089/toktickit/pull/6) | feature/2-health-check | Commented, merged after response |
| [#7](https://github.com/Punge089/toktickit/pull/7) | feature/3-category-seed | Commented, merged after response |
| [#8](https://github.com/Punge089/toktickit/pull/8) | feature/4-category-list | Commented, merged after response |

*(Note: per the Aug 11, 2026 course clarification, a review comment plus author self-merge is
accepted for Lab 1; strict "Approve" review will be required starting next lab.)*

### PR #5 - Project Foundation
**@book6349:** "Good README, but you should mention Postgres needs to be running before migrate."
**Me:** "Added it, thanks 👍" - pushed a follow-up commit adding a "make sure PostgreSQL is
running" note to the README's migration step.

### PR #6 - API Health Check
**@book6349:** "Tried stopping the server and it correctly showed Offline, nice. Quick question
though, does it show the same message whether the server is down or the API just returns an error?"
**Me:** "Yeah, same message for both right now since the lab only needs one Offline state. Could
split it later if needed though, thank you."

### PR #7 - Category Model + Seed
**@book6349:** "Ran the seed twice and no duplicates, nice. Does the category id order stay the
same every time? Just thinking about Issue 4 needing to list them."
**Me:** "Yeah, id is auto-increment so it won't change. But I'll still add orderBy: id explicitly
in Issue 4 just to be safe, thank you for asking."

### PR #8 - Category List
**@book6349:** "Checked it out, clicked Check System and it showed all 4 categories correctly.
Also tried killing the server and it fell back to Offline properly. One thing I noticed, the
categories endpoint returns a 500 on failure, does the frontend show a useful message for that
case too or just for a totally dead server?"
**Me:** "Good catch, yeah it's the same 'Unable to connect' message for both a dead server and a
500 from categories, since checkSystem throws either way and the UI only has one error state.
Keeps it simple for this lab, thank you!"

## Pull Requests I reviewed for my partner

Reviewed all four of @book6349's Issue PRs on their own individual-sprint repo
([book6349/toktickit](https://github.com/book6349/toktickit)):

| PR | Title | My verdict |
|----|-------|------------|
| [#10](https://github.com/book6349/toktickit/pull/10) | Issue 1 - Project Foundation & README Documentation | Commented + Approved |
| [#11](https://github.com/book6349/toktickit/pull/11) | Issue 2 - API Health Check Endpoint | Commented + Approved |
| [#12](https://github.com/book6349/toktickit/pull/12) | Issue 3 - Category Model and Idempotent Seed | Commented + Approved |
| [#13](https://github.com/book6349/toktickit/pull/13) | Issue 4 - Category List Endpoint and Full Test Suite | Commented + Approved |

### PR #10 - Project Foundation
**My comment:** "Reviewed the project foundation changes. The README.md instructions are
comprehensive and easy to follow for running both client and server dev environments. Confirmed
that .env files are gitignored and .env.example templates are provided. Everything looks solid!
Approved."
**Partner's response:** "Thank you for the detailed peer review and approval! Proceeding to merge
feature/1-project-foundation into lab1-staging."

### PR #11 - API Health Check
**My comment:** "Reviewed Issue 2 health check implementation. Confirmed GET /api/health endpoint
returns the required HTTP 200 payload. Supertest test suite passes cleanly, and the frontend
handles online/offline status displays as expected. Code looks clean. Approved!"
**Partner's response:** "Thank you for reviewing Issue 2! Merging feature/2-health-check into
lab1-staging now."

### PR #12 - Category Model + Seed
**My comment:** "Reviewed Issue 3 database schema and seed script. The Category model definition
adheres to requirements and the upsert logic guarantees idempotency without producing duplicate
records. Looks great! Approved."
**Partner's response:** "Thank you for the review! Merging feature/3-category-seed into
lab1-staging now."

### PR #13 - Category List
**My comment:** "From my review it seems the REST API correctly returns categories sorted by ID,
and all 5 automated Supertest and Vitest tests pass cleanly. Documentation under /docs/lab-01/ is
also accurate and complete. Approved, good job!"
**Partner's response:** "Thank you for all the reviews! Merging feature/4-category-list into
lab1-staging now, then creating the final Lab 1 Release PR into main."
