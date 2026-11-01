# Lab 4 - AI Use and Reflection

**LLM used:** Claude (Anthropic), running as Claude Code in the Claude desktop app, with read/write access to the
repository, `gh` access to Issues, the Project board and Pull Requests, and a browser for looking at screens. One
Claude Code conversation carried the whole sprint: reading the labsheet and workflow guide, planning and the
engineering contract (Issue #79 / PR #87), the implementation of Issues #80 to #84 (PRs #88 to #92) and the
evidence work for Issue #85. The model shown for it was **Claude Sonnet 5.5**.

**Where the AI also helped, stated plainly:** it drafted the review messages in `reviewer.md` (the reviewer's
question, my reply, the approval line), which the two of us then posted on GitHub (the review messages I wrote on my
partner's #63 to #66 are my own, not drafted by it); it wrote the code, the tests and
the documents; it moved the Project board cards with `gh` after I said it should; and it re-read the labsheet and the
workflow guide at the start because I asked it to. I made the decisions, merged nothing myself (my partner merged
every Pull Request of mine, and I merged theirs), and did the two things it cannot do: linking each Issue in the
Pull Request's Development panel by hand, and posting the review messages.

## Selected key prompts

Prompts marked **(verbatim)** are quoted from this sprint's chat; **(summarised)** ones are described because the
exact text is long. The Thai and the typos are as I typed them.

| # | Prompt | What I did with the result |
|---|--------|------------------------------|
| 1 | **(verbatim, shortened in the middle)** "อ่านไฟล์ที่แนบให้ครบก่อนทำอะไร เริ่มจาก Lab4_Kickoff_Guide.md แล้วอ่าน Lab_4_sheet.pdf ให้ครบ 11 หน้า (rubric หน้า 10 ถึง 11) และ ... Workflow Guide ให้ครบรวมข้อตกลง Part 9 ... เช็คสถานะจริงด้วย git และ gh ... ตัดสินใจ 7 จุดที่โจทย์ขัดกันเองตามหัวข้อ 4 ของ guide แล้วให้ผมยืนยัน ... ห้ามเริ่มเขียนโค้ดจนกว่า PR ของ contract จะ merge ... มาทำให้งานนี้ได้คะแนนเต็มกัน" | It read the labsheet, the rubric and the workflow guide (rendering the mockup pages to images because it could not read the PDF directly, and telling me so), checked the real repository state, and came back with decisions for the places where the labsheet contradicts itself, an Issue list and a Pull Request plan, and no code. The decisions are written into `specification.md` section 11 as numbered assumptions, for example that an Administrator may create and edit Actions but stays read-only for owner, priority and status. |
| 2 | **(verbatim)** "อนุมัติทั้งหมด" | I approved the nine decisions and the eight-Issue plan. The contract Pull Request (#87) was written, reviewed and merged before any implementation branch was opened, so the specification demonstrably came first. |
| 3 | **(verbatim)** "before that what issue i should connect to this PR ijn devlopment section" | It told me to link Issue #79, and I did. While answering it noticed that the body of PR #87 said the Issue was already linked in the Development panel, which was not true (the screenshot showed "None yet"), and corrected the body. Every later Pull Request body says the link is made by hand, because `Closes #N` does not work for a branch that is not the default one. |
| 4 | **(verbatim)** "คุณจัดการ move card ทุกอย่างให้ด้วยสิ" | From then on it moved every card with `gh` (Started when a branch opened, Done after my partner merged) and checked on GitHub that the Pull Request was linked, merged by my partner and approved before it moved anything. It did not move a card to PR Review before the link existed, because the workflow guide says not to, and told me why instead of doing it. |
| 5 | **(verbatim)** "ขอถามว่าตอนนี้แผนการงานของเรา พร้อมสำหรับได้คะแนนเต็มมั้ยในงานนี้" | I asked whether the plan could earn full marks. It mapped the plan onto the nine parts of the rubric, marked what was done, partly done and not started, listed the risks (the remaining UI work, the reflection that only I can write, the PDF), and said plainly that it could not promise 60 out of 60 because some parts are judged by a marker. I used the table as the order of work. |
| 6 | **(verbatim)** "what happen?" | I wrote this when the AI had gone quiet. It had been waiting on a full end-to-end run that kept timing out, because the new landing page broke many older Lab 2 and Lab 3 specs. It stopped the run, found the cause (the specs assumed the old home screen), and fixed the helper and the specs without deleting or loosening any test. Each change is listed in `tests.md` section 6. |
| 7 | **(verbatim, the same form for each Issue)** "Start #80", "Start #81", "Start #82", "Start #83", "Start #84", "Start #85" | Each time it opened the branch and moved the card, then built the Issue with its tests, ran every suite, ran mutation checks, opened the Pull Request with the real counts and wrote the review message for my partner. Its own checking found things a green run had not: a missing Actions reload after a cancel (found by an end-to-end spec), and, for the evidence Issue, six layout defects found by looking at all 66 screenshots at three widths (`ui-spec.md` section 13). One of the six was a regression its first fix had introduced; it caught that on the next look and replaced the fix. |
| 8 | **(verbatim, after each Pull Request)** "all done" | It read GitHub instead of taking my word: whether the Issue was linked, who merged, what the reviewer said, and which card was where. Then it moved the card, synced `lab4-staging` and offered the next Issue. |

## My Reflection

**Why this reflection reads the way it does:** I asked the AI to draft it from what actually happened in this
sprint, so every point below refers to something in the record above (a Pull Request, a test, a screenshot).

**Specification agent.** The best decision this sprint was to make the AI write the contract first and to merge it
as its own Pull Request (#87) before any code. The labsheet contradicts itself in several places, and the AI did not
quietly pick a side: it wrote each decision down with a reason, and asked me to approve them. My partner's very
first question, on #87, was about one of them (Administrators can create Actions but are read-only for tickets),
and I could answer by pointing at the specification instead of arguing from memory. Writing the test plan before the
code also helped: 98 tests were listed as "Planned" first, and I could see later which ones we had really done. The plan was not perfect. One test it predicted (an old Lab 2 test that only allowed the status
`NEW`) never existed, and one link ("open the Actions tab") belonged to a later Issue, so `tests.md` says what
changed instead of pretending the plan was right.

**Coding agent.** The agent was fast, but what made the work trustworthy was making it show evidence, not just say
"done". The mutation checks proved the guards do something: with the row lock removed the resolve-versus-create test
failed three times out of three, and with the double-submit guard switched off both hardening tests failed. An
end-to-end spec found a real bug that all the component tests had missed (after cancelling a ticket the Actions tab
still showed the cancelled Actions). Looking at all 66 screenshots at three widths found six layout problems, and
one of them was caused by the AI's own first fix, so I learned that "the tests pass" and "it looks right" are two
different checks. The traceability script gave a plain answer, 98 of 98 tests passing and every requirement covered,
instead of a feeling.

**Where the AI was wrong or I had to catch it.** The body of PR #87 said the Issue was linked when it was not; my
screenshot showed "None yet". The full end-to-end run stalled for a long time after the landing page changed, until I
asked "what happen?". A hook was placed after an early return in the Login page; the AI found and fixed it while checking the other forms. These
are small, but they are the kind of mistake that is easy to miss when the code is produced this fast.

**What I would do differently.** I would take the screenshots and run the traceability script earlier, after the
first UI Issue instead of at the end, because that is where the defects were. I would also give my partner a more
specific thing to look at in each Pull Request. The reviews in this sprint were quick and drafted with AI help, and
`reviewer.md` says so; a slower, line-by-line review of one risky file would have been worth more than the quick ones.
