# Lab 1 — Peer Review Record

**Author:** Bannasorn Thongkorn — 67070503420 — GitHub: @Punge089
**Peer reviewer:** book6349 — GitHub: @book6349

## Pull Requests I authored (reviewed by my partner)
| PR | Branch | Reviewer verdict |
|----|--------|------------------|
| [#5](https://github.com/Punge089/toktickit/pull/5) | feature/1-project-foundation | Commented, merged after response |
| [#6](https://github.com/Punge089/toktickit/pull/6) | feature/2-health-check | Commented, merged after response |
| [#7](https://github.com/Punge089/toktickit/pull/7) | feature/3-category-seed | Commented, merged after response |
| [#8](https://github.com/Punge089/toktickit/pull/8) | feature/4-category-list | Commented, merged after response |

*(Note: per the Aug 11, 2026 course clarification, a review comment plus author self-merge is
accepted for Lab 1; strict "Approve" review will be required starting next lab.)*

### PR #5 — Project Foundation
**@book6349:** "Good README, but you should mention Postgres needs to be running before migrate."
**Me:** "Added it, thanks 👍" — pushed a follow-up commit adding a "make sure PostgreSQL is
running" note to the README's migration step.

### PR #6 — API Health Check
**@book6349:** "Tried stopping the server and it correctly showed Offline, nice. Quick question
though, does it show the same message whether the server is down or the API just returns an error?"
**Me:** "Yeah, same message for both right now since the lab only needs one Offline state. Could
split it later if needed though, thank you."

### PR #7 — Category Model + Seed
**@book6349:** "Ran the seed twice and no duplicates, nice. Does the category id order stay the
same every time? Just thinking about Issue 4 needing to list them."
**Me:** "Yeah, id is auto-increment so it won't change. But I'll still add orderBy: id explicitly
in Issue 4 just to be safe, thank you for asking."

### PR #8 — Category List
**@book6349:** "Checked it out, clicked Check System and it showed all 4 categories correctly.
Also tried killing the server and it fell back to Offline properly. One thing I noticed, the
categories endpoint returns a 500 on failure, does the frontend show a useful message for that
case too or just for a totally dead server?"
**Me:** "Good catch, yeah it's the same 'Unable to connect' message for both a dead server and a
500 from categories, since checkSystem throws either way and the UI only has one error state.
Keeps it simple for this lab, thank you!"

## Pull Requests I reviewed for my partner
_(To be filled in: I need to review one of @book6349's PRs on their own individual-sprint repo
and record my comment + their response here, per the Part 1 bidirectional review requirement.)_
My comment: <...>
Partner's response: <...>
