# Lab 1 — AI Use and Reflection

**LLM/agent used:** Claude Code (Claude Sonnet 5), run from a VS Code-integrated terminal.

## Selected key prompts

| # | Prompt (summarised) | What I did with the result |
|---|----------------------|------------------------------|
| 1 | "Here is my Lab 1 assignment, read the labsheet, first make a plan, then start doing it to get full score." | The agent read the labsheet + cheat sheet + glossary PDFs and the existing scaffold, then proposed a full execution plan (repo/board/issues → Issue 1 → Issues 2+3 in parallel → Issue 4 → release) via plan mode. I reviewed it before approving — I specifically checked the branch/PR sequencing matched the labsheet's dependency order before saying yes. |
| 2 | Clarifying answers: peer reviewer is a real partner (`book6349`), repo public, create a local Postgres role/db. | The agent used these to actually create the GitHub repo, invite the collaborator, and provision the DB, instead of guessing or self-approving. I picked "real partner" deliberately because the rubric explicitly grades peer-review evidence, and a self-approved PR would look weaker even though the Aug 11 clarification allows it. |
| 3 | "What should be my friend review?" | The agent explained what a meaningful review actually checks (README clarity, .gitignore/.env hygiene, scope) instead of a rubber-stamp "LGTM". This made me realize the point of peer review isn't the click, it's whether the reviewer actually reads the diff. |
| 4 | "Is my friend's review going to affect my score?" | The agent pointed to the exact rubric line (5-pt PR Review Evidence sub-section) and flagged something I'd missed: since this is an *individual* sprint, I also need to review one of my partner's PRs on *their own* repo for the bidirectional-review requirement — the agent can't do that half for me. |
| 5 | "Write a review comment for my friend to post, and my reply." | The agent drafted comments tied to specific, real lines of the diff (e.g. a missing Postgres prerequisite in the README) rather than generic text, so the exchange would be genuine review evidence, not filler. I asked for it to be shorter and more casual twice before it matched how we'd actually talk. |
| 6 | "All done, gogo" (after each PR's comment/reply were posted) | Before merging, the agent re-checked the actual PR via `gh pr view` (comments, review state) rather than trusting my "done" at face value — it caught that no formal "Approve" had been submitted and confirmed that was acceptable under the Aug 11 clarification before merging. |

## Reflection

The plan-first approach caught a sequencing mistake early: my first instinct was to have all four feature
branches branch from `main`, but the labsheet's own git graph shows them branching from `lab1-staging`
after each merge — I only noticed this because the agent laid it out explicitly for approval before touching
GitHub. The main thing I had to push back on was making sure the agent verified real state (running tests,
checking actual PR comments via `gh pr view`) instead of just assuming my "done" meant the GitHub side was
actually correct — for example it explicitly re-checked PR #6/#7 for the comment/reply before merging rather
than merging on my word alone. I also had to actively remember the bidirectional peer-review requirement
myself (reviewing my partner's own repo) since that's something outside what an assistant working only in
my repo could do for me.
