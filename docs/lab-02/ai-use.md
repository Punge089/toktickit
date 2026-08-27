# Lab 2 — AI Use and Reflection

**LLM/agent used:** Claude Code (Claude Sonnet 5 / Claude Opus 5), run from an integrated terminal, given
full read/write access to the repo and `gh` CLI access to GitHub Issues, Projects, and Pull Requests.

## Selected key prompts

| # | Prompt (summarised) | What I did with the result |
|---|----------------------|------------------------------|
| 1 | Provided the Lab 2 labsheet, the Lab 1 report, and the GitHub Workflow Guide, and asked for a full plan before touching anything. | Reviewed the proposed Wave 1-5 sprint plan and the technical decisions (ticket number format, `X-Dev-Requester-Id` header, 404-vs-403 ownership semantics) before approving any of it, since those choices would be load-bearing for every later Issue. |
| 2 | "ช่วยตัดสินใจให้หน่อยละกัน ขอแค่ทำให้งานนี้ได้คะแนนเต็มก็พอ" (help decide for me, just get full marks) | Explicitly handed the agent decision authority on ambiguous spec points rather than reviewing each one myself, on the condition that every choice was written down with a reason in `specification.md` §11 — so I could still audit *why* afterward even though I didn't approve each one individually. |
| 3 | Asked for exact copy-paste text for the peer-review comment/reply/approve exchange with my partner, then "can u make both answer more human and shorter" and later "nono everythings same except my part pls make it shorter". | Iterated on the review-exchange wording across three rounds until it read like something two students would actually type, not an AI-generated review. This mirrors the same tone-iteration lesson from Lab 1 — kept insisting the *agent's* half of the exchange sound natural, since that's the part actually attributable to me typing it. |
| 4 | "iit got confiict help" — reported after the second PR of a parallel pair hit a merge conflict on `app.ts`. | Had the agent diagnose the conflict (two branches both mounting a router in the same file, expected per the wave plan) and walk through the fix: close the merged Issue, sync `lab2-staging`, rebase the still-open branch, resolve the two-line import conflict, rerun the full test suite before force-pushing. Made sure it re-verified tests *after* the rebase rather than trusting the rebase blindly. |
| 5 | No explicit prompt — the agent flagged on its own that it had committed Issue 31's work directly onto `lab2-staging` instead of a feature branch. | This was the agent catching its own workflow violation and self-reporting it before I noticed. I had it prove the fix rather than just claim it: show `origin/lab2-staging` was never touched, move the commit to the correct branch, reset `lab2-staging` to match `origin`, and rerun the full test suite before pushing anything. |
| 6 | Asked the agent to justify the CSS approach for My Tickets ("why one row structure instead of separate table/card components") as a planted peer-review question. | Used the agent's own answer as a genuine design-decision check: reusing one set of DOM rows across breakpoints (instead of duplicate desktop/mobile markup) turned out to be a real trade-off worth understanding, not just something to accept at face value. |
| 7 | Requested the E2E Playwright suite run against the real dev servers and PostgreSQL, not mocked, and asked to see actual screenshots before trusting the "27 screenshots, all pass" claim. | Had the agent send sample screenshots (My Tickets, Create Ticket mobile, the API-failure state) directly rather than just reporting pass counts, so I could visually confirm the Zen Green styling and the "form values survive a failure" behavior myself instead of taking the test's word for it. |
| 8 | Asked what happens to the visual checklist and whether every item could honestly be checked off. | The agent flagged one real cosmetic issue on its own (the Requester name wrapping to two lines in the mobile shell header) instead of silently checking every box — and explained why it didn't count as a rule violation (no clipping, no scroll) rather than hiding it. |

## My Reflection

The single most useful pattern this sprint was making the agent show evidence instead of asserting
completion — actual screenshots, actual re-run test output after a rebase, an actual `git log` diff
proving `origin/lab2-staging` was untouched after the accidental direct-commit mistake. Handing over
decision authority on ambiguous spec points (prompt #2) worked because every decision still had to be
written down with a reason, so nothing was a black box even though I didn't review each call in real
time. The workflow mistake in prompt #5 was the most valuable moment of the sprint precisely because
the agent caught and disclosed it itself rather than me finding it later in a PR diff — that is the
difference between "the agent says it's done" and evidence I could actually check.
