# TokTickIT

TokTickIT is an IT service desk application. Lab 1 proved the stack end to end with a thin vertical
slice (categories list). Lab 2 built the Requester-facing ticketing MVP behind a temporary Development
Requester selector (Create Ticket with attachments, a searchable/filterable/paginated My Tickets list, a
read-only Ticket Detail screen, and the full attachment lifecycle). **Lab 3** replaces that selector with
real email/password authentication and three roles — Requester, IT Staff, Administrator — enforced on the
backend for every endpoint. The sprint's features are all in place: the auth foundation, Requester
regression, IT Staff Ticket Queue, IT Staff Ticket Detail (ownership, IT Priority, status workflow, Public
Comments, Internal Notes, Requester "Problem Appears Resolved"), and Administrator User Management (list,
search, role filter, create, edit, activate/deactivate, set a new initial password), together with the
end-to-end suite, the responsive screenshots and the review records (see `docs/lab-03/specification.md`).

**Lab 4** finishes the product. IT Staff and Administrators record **Actions Taken** under a Ticket (create,
assign, edit, start, complete, cancel; the Requester reads them read-only), a Ticket can only be **Resolved**
once its Actions are finished and one is Completed, owner, priority and status changes detect stale updates
with a `version`, and every role lands on a **Dashboard** whose cards open the matching filtered list. The
specification, API contract, UI spec and test plan are in `docs/lab-04/`.

## Tech stack

| Layer      | Technology                                               |
|------------|-----------------------------------------------------------|
| Frontend   | React + TypeScript + Vite + Bootstrap + React Router       |
| Backend    | Node.js + Express + TypeScript + Multer (file uploads)     |
| Database   | PostgreSQL + Prisma ORM                                    |
| Testing    | Vitest + Supertest (unit/API) · Vitest + React Testing Library + msw (UI) · Playwright (E2E/responsive/visual) |

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL running locally (or reachable) with a database you can connect to

## Project structure

```
toktickit/
├── client/                    React + Vite + Bootstrap + Zen Green frontend
│   ├── src/
│   │   ├── api/                auth, reference, ticket, attachment, staff queue/detail, comments/notes,
│   │   │                        admin-users, actions and dashboard API clients (http.ts is the shared
│   │   │                        credentials:"include" fetch wrapper)
│   │   ├── components/
│   │   │   ├── ui/              Button, TextField, TextArea, Select, Badge, Alert, Spinner, EmptyState,
│   │   │   │                    PasswordChecklist, FilterChips
│   │   │   ├── shell/           AppShell (role-aware nav + identity dropdown), RequireAuth route guard
│   │   │   ├── actions/         ActionsTaken (staff tab), ActionForm, ActionList, RequesterActions
│   │   │   ├── dashboard/       DashboardParts (cards, lists, states), useDashboard
│   │   │   └── tickets/         AttachmentSection, EntryThread
│   │   ├── context/             AuthContext (session-cookie-backed identity, replaces Lab 2's
│   │   │                        sessionStorage-based RequesterContext)
│   │   ├── pages/                LoginPage, ChangePasswordPage, ForbiddenPage, NotFoundPage, DashboardPage,
│   │   │                        CreateTicketPage, MyTicketsPage, TicketDetailPage,
│   │   │                        StaffTicketQueuePage, StaffTicketDetailPage, UserManagementPage
│   │   └── styles/zen-green.css  Zen Green tokens and component classes
│   └── tests/lab-01/ .. tests/lab-04/, tests/msw/  Vitest UI/component/style tests + msw handlers
├── server/                     Express + TypeScript API, Prisma schema, seed
│   ├── prisma/                  schema.prisma, seed.ts, migrations
│   ├── src/
│   │   ├── routes/               auth, reference, tickets, myTickets, ticketDetail, attachments,
│   │   │                          staffQueue, staffTickets, comments, adminUsers, actions, dashboard
│   │   ├── middleware/            auth.ts (requireAuth/requirePasswordCurrent/requireRole/originCheck)
│   │   └── lib/                   password, session, loginThrottle, cookies, ticketNumber,
│   │                              ticketValidation, attachmentRules, attachmentStorage,
│   │                              staffQueueQuery, transitions, entries, adminUserInput,
│   │                              actionRules, workflowRules, ticketLock
│   ├── uploads/                  attachment files on disk (gitignored)
│   └── tests/lab-01/ .. tests/lab-04/, tests/helpers/  Supertest unit/API tests
├── e2e/                        Playwright: global-setup.ts (re-seeds), cleanup.ts,
│   ├── lab-02/                  Requester flow + responsive/visual specs (session-authenticated)
│   ├── lab-03/                  authentication, staff-ticket-flow, user-administration, responsive specs
│   └── lab-04/                  actions-taken-flow, dashboards, regression (flows + screen sweep)
├── artifacts/lab-02/screenshots/  Committed visual evidence (desktop/tablet/mobile x every state)
├── artifacts/lab-03/screenshots/  Lab 3 visual evidence: authentication, requester, staff-queue,
│                                  staff-ticket-detail, user-management, focus (86 images)
├── docs/lab-01/ .. docs/lab-04/  specification.md, api-spec.md, ui-spec.md, tests.md,
│                                 reviewer.md, ai-use.md (Lab 4's last two arrive with its evidence)
├── playwright.config.ts
└── .gitignore
```

## Setup

1. **Clone and enter the repo**
   ```bash
   git clone https://github.com/Punge089/toktickit.git
   cd toktickit
   ```

2. **Install dependencies** (client, server, and the repo root are separate npm projects)
   ```bash
   cd server && npm install
   cd ../client && npm install
   cd .. && npm install
   ```

3. **Configure environment variables** - copy each `.env.example` to `.env` and adjust if needed.
   ```bash
   cp server/.env.example server/.env
   cp client/.env.example client/.env
   ```
   `server/.env` must point `DATABASE_URL` at a PostgreSQL database you control, e.g.:
   ```
   DATABASE_URL="postgresql://toktickit:toktickit@localhost:5432/toktickit?schema=public"
   PORT=3000
   CLIENT_ORIGIN="http://localhost:5173"
   SESSION_TTL_HOURS=8
   SEED_PASSWORD="TokTick-Dev#2026"
   ```
   `CLIENT_ORIGIN` is the only browser origin the API accepts session cookies from and state-changing
   requests from (BR-13); `SESSION_TTL_HOURS` sets how long a login lasts; `SEED_PASSWORD` is the local
   password assigned to every seeded account (never a real personal password).

4. **Run the database migration and seed** (from `server/`)

   Make sure PostgreSQL is actually running first, or `prisma migrate dev` will fail to connect:
   ```bash
   # Windows: check the service is Running
   Get-Service | Where-Object Name -like "*postgres*"
   ```
   Then:
   ```bash
   npx prisma migrate dev      # applies every migration, including Lab 4's lab4_actions_taken
   npm run prisma:seed
   ```
   **On a database that already holds data, take a backup first** (`pg_dump -U toktickit toktickit > before-lab4.sql`).
   The Lab 4 migration only *adds* objects (the `ActionStatus` type, the `ActionTaken` table and a `version` column
   on `Ticket`, which every existing Ticket gets as `1`), so every User, Ticket, Attachment, Comment and Note is
   kept. To undo it, run `server/prisma/migrations/20261030142531_lab4_actions_taken/rollback.sql`; that drops the
   Actions Taken recorded since, so restore the dump instead if you need them back. On a deployed database use
   `npx prisma migrate deploy` instead of `migrate dev`.
   The seed is idempotent (re-running it converges rather than duplicating): 4 Categories, 7 Related
   Systems, 6 Requesters (5 active + 1 inactive), 6 IT Staff (5 active + 1 inactive), 1 Administrator,
   ~26 Tickets spanning all 8 statuses, and 9 Actions Taken on 6 of them (a Ticket with none, one with one and
   one with three, plus legacy Resolved and Closed Tickets that have none). Every seeded account's password is the value of
   `SEED_PASSWORD` in `server/.env` (defaults to `TokTick-Dev#2026` outside `NODE_ENV=production` — never
   a real personal password; see `docs/lab-03/specification.md` §7). One seeded Requester
   (`ekkachai.mai@example.dev`) is left with `mustChangePassword: true` specifically to demonstrate the
   mandatory first-login password change.

5. **Run the apps** (two terminals)
   ```bash
   # terminal 1 - API on http://localhost:3000
   cd server && npm run dev

   # terminal 2 - frontend on http://localhost:5173
   cd client && npm run dev
   ```

6. Open `http://localhost:5173`. You'll land on the **Login** screen. Sign in with any seeded account's
   email and `SEED_PASSWORD` (e.g. `aran.suksawat@example.dev`). **Every role lands on its Dashboard**: a
   Requester sees their own ticket figures with links to My Tickets and Create Ticket, IT Staff
   (e.g. `jennifer.anderson@example.dev`) see the operational figures with links to the Ticket Queue, and the
   seeded Administrator (`john.smith@example.dev`) sees the same figures read-only plus account counts and a
   link to **Users** (User Management).

   | Account (all `@example.dev`) | Role / state | Use it to see |
   |---|---|---|
   | `aran.suksawat` | Requester, active | My Tickets, Create Ticket, comments |
   | `buppha.ratanakorn` | Requester, active, owns no Tickets | the empty My Tickets state |
   | `ekkachai.mai` | Requester, must change password | the mandatory first-login change |
   | `somsak.jantawong` | Requester, **inactive** | the inactive-account message |
   | `jennifer.anderson`, `michael.brown` | IT Staff, active | Dashboard, Ticket Queue and Detail, Actions Taken |
   | `nattaya.chuenjit` | IT Staff, active, no Tickets or Actions | the zero state of the IT Staff Dashboard |
   | `robert.wilson` | IT Staff, **inactive** | an inactive owner / user |
   | `john.smith` | Administrator, active (the only one) | User Management |

   All use `SEED_PASSWORD` (default `TokTick-Dev#2026`, local development only). The Playwright suite
   re-seeds before each run, which puts these accounts back in this state.

## Testing

Server tests run against a **dedicated test database**, never the dev database in `server/.env`, so
seed/CRUD tests never touch your local dev data. Create it once and point `server/.env.test` at it
(`server/.env.test` is gitignored, same as `.env`):

```bash
psql -U postgres -c "CREATE DATABASE toktickit_test;"
```
```
# server/.env.test
DATABASE_URL="postgresql://toktickit:toktickit@localhost:5432/toktickit_test?schema=public"
PORT=3001
```
```bash
cd server
DATABASE_URL="postgresql://toktickit:toktickit@localhost:5432/toktickit_test?schema=public" npx prisma migrate deploy
DATABASE_URL="postgresql://toktickit:toktickit@localhost:5432/toktickit_test?schema=public" npx tsx prisma/seed.ts
```

Then run the suites:

```bash
# unit + API tests (Vitest + Supertest) - from server/, uses server/.env.test automatically
cd server && npm test

# frontend unit + UI component + UI style tests (Vitest + RTL + msw) - from client/
cd client && npm test

# E2E + responsive/visual tests (Playwright) - from the repo root
npm install                       # once, installs @playwright/test
npx playwright install chromium   # once, downloads the browser
npx playwright test
```

The Playwright suite starts the real server and client dev servers itself (see `playwright.config.ts`)
and runs against the actual PostgreSQL-backed API. Nothing is mocked except one deliberately
aborted request, used to produce the Create Ticket API-failure state. Before each run
`e2e/global-setup.ts` removes leftover `e2e.*` users and re-seeds the dev database, and the run uses one
worker because the specs share that database. It writes screenshots to `artifacts/lab-02/screenshots/`
(see `docs/lab-02/ui-spec.md` §11-12) and `artifacts/lab-03/screenshots/` (see `docs/lab-03/ui-spec.md`
§13-14), and creates real Ticket and User rows in your dev database as it exercises the flows.
`npx playwright test e2e/lab-03` runs only the Lab 3 specs, and `npx playwright test e2e/lab-04` only Lab 4's.
The Lab 4 specs create Actions assigned to a throwaway `e2e.*` IT Staff user; the same clean-up removes them.

**Current results** (all passing; Lab 4's own plan and results are in `docs/lab-04/tests.md`):

| Suite | Command | Result |
|---|---|---|
| Server (unit + API + authorization + migration + dashboards) | `cd server && npm test` | 31 files, 251 tests |
| Client (UI component + style) | `cd client && npm test` | 23 files, 137 tests |
| End to end + responsive (Playwright) | `npx playwright test` | 151 tests (28 Lab 2 + 100 Lab 3 + 23 Lab 4) |

`server/vitest.config.ts` runs test files sequentially (`fileParallelism: false`): every server test
file shares the one real test database with no per-file transaction isolation, so parallel files can
race on the same rows.

## Required API endpoints

All endpoints are documented in full (request/response shapes, validation, status codes) in
[`docs/lab-03/api-spec.md`](docs/lab-03/api-spec.md) and, for Lab 4's additions and changes,
[`docs/lab-04/api-spec.md`](docs/lab-04/api-spec.md). Summary:

| Method | Path                              | Description                                                    |
|--------|-----------------------------------|------------------------------------------------------------------|
| GET    | `/api/health`                     | Health check                                                    |
| POST   | `/api/auth/login`                 | Log in, sets the session cookie                                  |
| POST   | `/api/auth/logout`                | Log out, invalidates the session                                 |
| GET    | `/api/auth/me`                    | Current authenticated identity                                   |
| POST   | `/api/auth/change-password`       | Change password (also the mandatory first-login flow)            |
| GET    | `/api/staff/tickets`              | IT Staff / Administrator Ticket Queue — search/filter/sort/pagination; `active=true` keeps Tickets still being worked |
| GET    | `/api/staff/assignable-users`     | Active IT Staff (Queue Owner filter; claim/reassign later)       |
| GET    | `/api/staff/tickets/:id`          | Staff Ticket Detail (adds `version`, `actionCounts`, `resolutionBlockers`); `PATCH .../owner`, `.../it-priority`, `.../status` (IT Staff only; each needs `expectedVersion`; Resolved is refused while an Action is open or none is Completed) |
| GET    | `/api/tickets/:id/actions`        | Actions Taken of a Ticket (Requester owner read-only, IT Staff, Administrator) |
| POST   | `/api/staff/tickets/:id/actions`  | Create an Action (IT Staff, Administrator; `clientRequestId` makes a retry harmless) |
| PATCH  | `/api/staff/tickets/:id/actions/:actionId` | Edit, reassign or move an open Action (needs `expectedVersion`) |
| GET    | `/api/dashboard/requester`        | The signed-in Requester's own figures and short lists |
| GET    | `/api/dashboard/staff`            | IT Staff / Administrator operational figures (Administrator: account counts, no personal figures) |
| GET/POST | `/api/staff/tickets/:id/notes`  | Internal Notes (IT Staff read+write, Administrator read)         |
| GET/POST | `/api/tickets/:id/comments`     | Public Comments (Requester owner, IT Staff, Administrator read)   |
| POST   | `/api/tickets/:id/problem-resolved` | Requester says the problem appears resolved (status unchanged) |
| GET/POST | `/api/admin/users`              | Administrator: list users (`search` by name/email, optional `role`), create a user |
| PATCH  | `/api/admin/users/:id`            | Administrator: edit name, email, role, active state (self and last-Administrator rules) |
| POST   | `/api/admin/users/:id/initial-password` | Administrator: set a new initial password; the user must change it at next login |
| GET    | `/api/categories`                 | Active IT request categories                                    |
| GET    | `/api/related-systems`            | Active related systems                                          |
| POST   | `/api/tickets`                    | Create a Ticket (multipart, optional attachments)                |
| GET    | `/api/tickets`                    | The authenticated Requester's own Tickets — search/filter/sort/pagination; `status` takes any of the 8 statuses, `active=true` keeps active ones |
| GET    | `/api/tickets/:id`                | One owned Ticket's full detail + attachments                    |
| POST   | `/api/tickets/:id/attachments`    | Add a permitted attachment to an owned Ticket                    |
| GET    | `/api/attachments/:id`            | One attachment's metadata (active or removed)                   |
| GET    | `/api/attachments/:id/download`   | Download an active attachment's file                             |
| DELETE | `/api/attachments/:id`            | Soft-remove an attachment (reason required)                      |

Every Requester-scoped endpoint requires an authenticated session (an httpOnly cookie set by
`/api/auth/login`); ownership comes from that session, never a client-supplied id (BR-03). The
`/api/admin/*` endpoints answer `403` to every role except Administrator, and there is deliberately no
endpoint that deletes a user (BR-34): access is removed by deactivating the account.

## Documentation

**Lab 1**
- [`docs/lab-01/ai_use.md`](docs/lab-01/ai_use.md) · [`reviewer.md`](docs/lab-01/reviewer.md) · [`tests.md`](docs/lab-01/tests.md)

**Lab 2**
- [`docs/lab-02/specification.md`](docs/lab-02/specification.md) - functional requirements, business rules, acceptance criteria, Definition of Done.
- [`docs/lab-02/api-spec.md`](docs/lab-02/api-spec.md) - full REST contract.
- [`docs/lab-02/ui-spec.md`](docs/lab-02/ui-spec.md) - Zen Green tokens, screen layouts, responsive rules, visual checklist.
- [`docs/lab-02/tests.md`](docs/lab-02/tests.md) - planned-test table, AC traceability, final results.
- [`docs/lab-02/ai-use.md`](docs/lab-02/ai-use.md) - AI tool used and reflection.
- [`docs/lab-02/reviewer.md`](docs/lab-02/reviewer.md) - peer review record.

**Lab 3**
- [`docs/lab-03/specification.md`](docs/lab-03/specification.md) - functional requirements, business rules, authorization matrix, status transition matrix, migration decisions, acceptance criteria, Definition of Done.
- [`docs/lab-03/api-spec.md`](docs/lab-03/api-spec.md) - full REST contract, including the session/CSRF conventions.
- [`docs/lab-03/ui-spec.md`](docs/lab-03/ui-spec.md) - Zen Green extensions for the new screens, deliberate deviations from the mockups.
- [`docs/lab-03/tests.md`](docs/lab-03/tests.md) - planned-test table, AC / FR / BR traceability, final results.
- [`docs/lab-03/reviewer.md`](docs/lab-03/reviewer.md) - peer review record in both directions, with the real GitHub conversations.
- [`docs/lab-03/ai-use.md`](docs/lab-03/ai-use.md) - the LLMs used, key prompts, and my reflection.

**Lab 4**
- [`docs/lab-04/specification.md`](docs/lab-04/specification.md) - requirements, business rules, Actions Taken and Ticket transition rules, dashboard calculations, migration decisions, acceptance criteria, Definition of Done.
- [`docs/lab-04/api-spec.md`](docs/lab-04/api-spec.md) - the new and changed endpoints, error codes.
- [`docs/lab-04/ui-spec.md`](docs/lab-04/ui-spec.md) - dashboards, the Actions Taken tab, navigation, deviations from the mockups.
- [`docs/lab-04/tests.md`](docs/lab-04/tests.md) - planned tests, traceability, changes to earlier tests, mutation checks, results.

## Git workflow

`main` (stable) ← `lab4-staging` (Lab 4 integration) ← `feature/*` branches, one per Issue, each merged
via a peer-reviewed, approved Pull Request that the reviewer, not the author, merges; one release Pull Request
then takes `lab4-staging` to `main`. Labs 1 to 3 used the same pattern with `lab1-staging`, `lab2-staging`
and `lab3-staging`.

## Demonstration (Lab 4)

These steps are what the Playwright specs `e2e/lab-04/actions-taken-flow.spec.ts`, `ticket-resolution.spec.ts` and `dashboards.spec.ts` run, so
they were run against the seeded data. All accounts use `SEED_PASSWORD`.

1. Sign in as `jennifer.anderson@example.dev`. You land on the **Dashboard**: status cards, Unassigned and
   My Assigned, the four IT Priorities, Urgent and High, Recently Updated, and My Open Actions. Click a card: the
   Ticket Queue opens already filtered (the filter shows in the controls and as a chip) with the same total.
2. Open a Ticket, choose the **Actions Taken** tab, **Add Action**: leave the Description empty and Save to see the
   message under the field, then fill it in and Save. Assign another IT Staff member, **Start** an Action, then
   **Complete** it (the Result is required) and try to edit it: a Completed Action is final.
3. Move the Ticket to **Resolved** while an Action is still open: the screen explains why and the server refuses
   it too (`409 RESOLUTION_BLOCKED`). Finish or cancel the open Actions, complete one, and it resolves.
4. Open the same Ticket in a second browser and change its status in one of them, then in the other: the second
   change shows "changed by someone else" with **Reload latest** and keeps what you typed.
5. Sign in as the Ticket's Requester (e.g. `aran.suksawat@example.dev`): the Dashboard shows only their own
   tickets, and the Ticket Detail lists every Action read-only, with no Internal Note.
6. Sign in as `john.smith@example.dev` (Administrator): the Dashboard has account counts instead of personal
   figures, an Action can be added and edited, but owner, priority and status stay read-only.
7. Sign in as `nattaya.chuenjit@example.dev` or `buppha.ratanakorn@example.dev` to see every figure at zero with
   its empty-state message.
