# Lab 3 - AI Use and Reflection

**LLMs used:** Claude Opus 5 for reading the labsheet and workflow guide, planning the sprint and writing the
engineering contract (Issue #62 / PR #69). Claude Sonnet 5 for implementing and testing every later Issue
(#63 to #68) and for the audit and evidence work in PR #68. Both ran as Claude Code in the integrated terminal
with read/write access to the repository and `gh` access to Issues, the Project board and Pull Requests.

**Where the AI also helped, stated plainly:** it drafted the review messages in `reviewer.md` (the reviewer's
question, my reply, the approval line), which the two of us then posted on GitHub; it wrote the code, tests and
documents; and it re-read the labsheet and workflow guide each session because I asked it to.

## Selected key prompts

Prompts marked **(verbatim)** are quoted from this sprint's chats; **(summarised)** ones are described from the
session record because I do not have the exact text to hand. The Thai is what I typed.

| # | Prompt | What I did with the result |
|---|--------|------------------------------|
| 1 | **(summarised, Lab 3 kickoff session)** Gave the AI the Lab 3 labsheet, the GitHub Workflow Guide and my submitted Lab 2 report, and asked it to read everything in detail, every page and every file, and then do Lab 3 (the end of my message, the only part I can quote exactly: "...เอียดและทุกไฟล์ แล้วทำ lab 3 ให้หน่อยคับ"). | It came back with a plan, not code: seven Issues, eight PRs, an authorization matrix, a status transition matrix, the migration steps and the risks carried over from Lab 2. I read the decisions (server-side sessions, Administrator read-only on tickets, seed shape) and approved the plan before any implementation. The contract PR (#69) was merged before PR #70 opened, so the specification demonstrably came first. |
| 2 | **(summarised, Lab 3 kickoff session)** Handed each new chat the kickoff guide (written from the mistakes of Lab 2: merging my own PRs, skipping the staging branch, ticking checklist items that were not true, evidence without a real login) and told it to read that guide, the labsheet and the workflow guide in full before touching the repository. | Every session since started from `Lab3_Kickoff_Guide.md` and the plan file, which is why no Lab 3 PR was merged by its author, none went straight to `main`, and the API evidence uses a real cookie. The reading is expensive, so in prompt 5 I asked whether it could be shortened, and in prompt 6 I chose to keep it in full for the evidence PR. |
| 3 | **(summarised, Lab 3 kickoff session)** Asked for the peer-review exchange to be written for every PR (comment, reply, approve) in a student tone, then told it my "ผม reply" was running too long and to keep it to one or two sentences. | The replies in `reviewer.md` are one or two sentences with a test name where it helps. I checked each question against the real diff before it was posted, since the reviewer has to be able to point at something that is actually in the PR. |
| 4 | **(verbatim)** "อ่านสองไฟล์นี้ให้ครบทุกหน้าก่อน (รวมรูป mockup หน้า 8, 9, 10, 12 และข้อตกลง Part 9 ของ Workflow Guide) ... แล้วทำ Lab 3 ต่อที่ PR 6 (Issue #67 Administrator User Management) ... ใช้สไตล์ข้อความรีวิวเดิม (reply สั้น 1-2 ประโยค) ... มาทำให้งานนี้ได้คะแนนเต็มกัน" | PR #74. While building it the AI found that the "last active Administrator" rule can only fire when two Administrators act at the same moment (the caller is always an active Administrator, so a lone one hits the self rule first). It told me instead of pretending otherwise, changed the specification to say so, and wrote the tests as two simultaneous requests. It also proved the guard matters without being asked: with the row lock removed, both race tests fail. |
| 5 | **(verbatim)** "done แต่ขอถามหน่อยว่าอ่านไฟล์ pdf ไม่ได้เลยหรอ แล้วพอทำ PR เสร็จหมดจะทำไฟล์ report ให้ผมพร้อม guide screen shot ให้เหมือนเดิมใช่มั้ยคับ ... ขอทำ PR ช่วยประหยัด context window โดยที่งานยังคงมีประสิทธิภาพเหมือนเดิม จะเป็นไปได้มั้ย" | It admitted it had been reading text copies and images of the PDFs, not the originals (no PDF renderer on my machine), and that it could not promise a "screenshot guide" it had no template for. It proposed a shorter reading routine that keeps every check, and said the screenshots it cannot take itself (the Kanban board, the GitHub review pages) would have to come from me. I decided in prompt 6 below. |
| 6 | **(verbatim, one message with two instructions: check the work, then continue with PR 7)** "งั้นลองอ่านไฟล์ pdf ดูแล้วตรวจว่างานที่ผมทำอยู่โอเคตามเงื่อนไขหรือยัง และทำ PR 7 ต่อเลยได้เลยแบบอ่านครบ เพราะผมต้องการงานที่ตรง requirement ที่สุด เพื่อคะแนนเต็ม" | It rendered the original PDF pages to images and read the rubric and the workflow agreements from those. Then, before writing the evidence, it audited the work against the rubric. A script that maps every AC, FR and BR to a passing test found two rules with no test at all (session expiry, and comments and notes being append-only) and a limitation note describing a test that did not exist; it added both tests and corrected the note. It also found that a Definition of Done line was literally false and reworded it instead of ticking it, and that PR #71 has no Issue linked in its Development panel, which I have to fix by hand on GitHub. Then PR #68 added the E2E suite (three specs plus a responsive one), 86 screenshots at three widths, the completed visual checklist, this file and `reviewer.md`. The AI viewed every screenshot side by side with the specification. That found nine defects that a fully green test suite had not: a menu icon that was green on green, a ticket number clipped at 375 px, long names running into the Email column, a header focus ring that could not be seen, and navigation shown to a user who was not yet allowed to use it. Each was fixed and given a test or a screenshot that guards it (`ui-spec.md` section 13). |

## My Reflection

**Specification agent.** Having the agent write the contract first and merge it as its own PR paid off twice:
the decisions were written down with reasons (Administrator read-only on tickets, sessions instead of tokens,
scrypt, a login throttle instead of an account lock), and my partner's very first review question (#69) was
about one of them, which I could answer by pointing at section 11 instead of arguing from memory. It also made
me read the labsheet closely enough to notice where it contradicts itself (a Ticket Owner may be an
Administrator, but Administrator and IT Staff duties should stay separate), and to record which way we went.

**Coding agent.** The agent was fast, but the useful habit was making it show evidence rather than say "done":
the mutation check that showed the row lock was doing real work, the screenshots viewed at three widths, and the
traceability script. Each of those found something a green test run had not. The lesson from Lab 2 came back
with a new shape: tests can be green and the documents still wrong (a note describing a test that was never
written, a Definition of Done line that could not be ticked as written), so the documents have to be checked
against the code by something other than the agent's own confidence. I also learned to tell a bug in a test
from a bug in the app; twice the E2E run failed because of the test (a Back button that went to a blank tab, a
field lookup that did not match the label text), and the agent had to show that before touching the product.

**What I would still do differently.** The review exchanges were drafted by the agent and posted in quick
succession, so the timestamps look more rushed than a real discussion would. A better routine is to open the diff
first, write my own question, and use the agent only to check that it points at something real. I have said this
in `reviewer.md` rather than leaving the timestamps to speak for themselves.
