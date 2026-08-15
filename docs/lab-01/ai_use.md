# Lab 1 — AI Use and Reflection

**LLM/agent used:** Claude Code (Claude Sonnet 5), run from a VS Code-integrated terminal.

## Selected key prompts

| # | Prompt (summarised) | What I did with the result |
|---|----------------------|------------------------------|
| 1 | "Read the labsheet, make a plan first, then start." | Reviewed the proposed plan before approving. Specifically checked that feature branches were sequenced to branch from `lab1-staging`, not `main`, matching the labsheet's own git diagram, before letting any GitHub changes happen. |
| 2 | Clarifying decisions: real partner for peer review (not self-approval), public repo, local Postgres role setup. | Deliberately chose the real-partner path over the easier self-approve shortcut, since the rubric explicitly grades peer-review evidence. A self-approved PR would be weaker evidence even though the course clarification allows it. |
| 3 | "What should my friend actually review?" | Pushed for meaningful review criteria (README clarity, .env hygiene, scope) instead of settling for a rubber-stamp "LGTM," since the point of peer review is whether the reviewer actually reads the diff. |
| 4 | "Is my friend's review going to affect my score?" | This led to checking the exact rubric line, which surfaced something I hadn't accounted for: since this is an individual sprint, I also needed to review one of my partner's PRs on their own separate repo for the bidirectional-review requirement. Not something the agent could do inside my repo alone. |
| 5 | Iterating on review-comment tone across several rounds (shorter, more casual, plain punctuation, English only). | Rather than accepting the first draft, I refined it multiple times until the phrasing actually sounded like something I'd say, so the review exchange would read as genuine rather than AI-templated. |
| 6 | "Is it a problem that we pushed the report file into main? Does that violate any rule?" | Cross-checked this against the actual workflow rule (never commit directly to main/lab1-staging) rather than assuming. Confirmed the rule was about how changes land (always via PR), not what files exist in the repo. |
| 7 | "Wait, I forgot to send you my review of my friend's PRs." | Caught this gap myself before final submission. The bidirectional peer-review requirement is easy to miss since it lives on a teammate's separate repo, not your own. |

## Reflection

The plan-first approach caught a real sequencing mistake early, since the agent laid out the full branch strategy for approval before touching GitHub rather than assuming my intent. The most useful check I kept doing throughout was tying every workflow decision back to the actual rubric line it affected, asking "does this actually count for points" rather than just doing whatever felt procedurally correct. That is how the bidirectional peer-review gap got caught before it became a missed requirement instead of after.
