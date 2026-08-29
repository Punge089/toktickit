# TokTickIT

TokTickIT is an IT service desk application. Lab 1 proved the stack end to end with a thin vertical
slice (categories list). **Lab 2** builds the Requester-facing ticketing MVP: a Development Requester
selector (a testing stand-in for login, not real authentication), Create Ticket with attachments, a
searchable/filterable/paginated My Tickets list, a read-only Ticket Detail screen, and the full
attachment lifecycle (add, download, soft-remove) — all on a shared Zen Green visual system, with the
backend enforcing that a Requester can never see or modify another Requester's data.

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
│   │   ├── api/                Requester/reference/ticket/attachment API clients
│   │   ├── components/
│   │   │   ├── ui/              Button, TextField, TextArea, Select, Badge, Alert, Spinner, EmptyState
│   │   │   ├── shell/           AppShell, RequireRequester route guard
│   │   │   └── tickets/         AttachmentSection
│   │   ├── context/             RequesterContext (sessionStorage-backed, BR-08)
│   │   ├── pages/                RequesterSelectPage, CreateTicketPage, MyTicketsPage, TicketDetailPage
│   │   └── styles/zen-green.css  Zen Green tokens and component classes
│   └── tests/lab-01/, tests/lab-02/, tests/msw/  Vitest UI/component/style tests + msw handlers
├── server/                     Express + TypeScript API, Prisma schema, seed
│   ├── prisma/                  schema.prisma, seed.ts, migrations
│   ├── src/
│   │   ├── routes/               reference, tickets, myTickets, ticketDetail, attachments
│   │   ├── middleware/            requesterAuth (X-Dev-Requester-Id resolution)
│   │   └── lib/                   ticketNumber, ticketValidation, attachmentRules, attachmentStorage
│   ├── uploads/                  attachment files on disk (gitignored)
│   └── tests/lab-01/, tests/lab-02/  Supertest unit/API tests
├── e2e/lab-02/                  Playwright E2E + responsive/visual specs
├── artifacts/lab-02/screenshots/  Committed visual evidence (desktop/tablet/mobile x every state)
├── docs/lab-01/, docs/lab-02/    specification.md, api-spec.md, ui-spec.md, tests.md, reviewer.md, ai-use.md
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
   ```

4. **Run the database migration and seed** (from `server/`)

   Make sure PostgreSQL is actually running first, or `prisma migrate dev` will fail to connect:
   ```bash
   # Windows: check the service is Running
   Get-Service | Where-Object Name -like "*postgres*"
   ```
   Then:
   ```bash
   npx prisma migrate dev
   npm run prisma:seed
   ```
   The seed is idempotent: 4 required Categories, 7 Related Systems, 4 active + 1 inactive Development
   Requester. Re-running it never creates duplicates.

5. **Run the apps** (two terminals)
   ```bash
   # terminal 1 - API on http://localhost:3000
   cd server && npm run dev

   # terminal 2 - frontend on http://localhost:5173
   cd client && npm run dev
   ```

6. Open `http://localhost:5173`. You'll land on the **Development Requester Selection** screen — pick
   one of the seeded active Requesters (this is a Lab 2 testing mechanism, not real authentication; see
   `docs/lab-02/specification.md` BR-05) to reach My Tickets and Create Ticket.

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
aborted request, used to produce the Create Ticket API-failure state. It writes screenshots to
`artifacts/lab-02/screenshots/` (committed to the repo as visual evidence, see `docs/lab-02/ui-spec.md`
§11-12) and creates real Ticket rows in your dev database as it exercises the flow.

`server/vitest.config.ts` runs test files sequentially (`fileParallelism: false`): every server test
file shares the one real test database with no per-file transaction isolation, so parallel files can
race on the same rows.

## Required API endpoints

All endpoints are documented in full (request/response shapes, validation, status codes) in
[`docs/lab-02/api-spec.md`](docs/lab-02/api-spec.md). Summary:

| Method | Path                              | Description                                                    |
|--------|-----------------------------------|------------------------------------------------------------------|
| GET    | `/api/health`                     | Health check                                                    |
| GET    | `/api/categories`                 | Active IT request categories                                    |
| GET    | `/api/related-systems`            | Active related systems                                          |
| GET    | `/api/dev-requesters`             | Active Development Requesters (Lab 2 selector)                  |
| POST   | `/api/tickets`                    | Create a Ticket (multipart, optional attachments)                |
| GET    | `/api/tickets`                    | Selected Requester's own Tickets — search/filter/sort/pagination |
| GET    | `/api/tickets/:id`                | One owned Ticket's full detail + attachments                    |
| POST   | `/api/tickets/:id/attachments`    | Add a permitted attachment to an owned Ticket                    |
| GET    | `/api/attachments/:id`            | One attachment's metadata (active or removed)                   |
| GET    | `/api/attachments/:id/download`   | Download an active attachment's file                             |
| DELETE | `/api/attachments/:id`            | Soft-remove an attachment (reason required)                      |

Every Requester-scoped endpoint requires an `X-Dev-Requester-Id` header identifying the selected
Development Requester (a Lab 2 testing mechanism — see `specification.md` BR-05/BR-29).

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

## Git workflow

`main` (stable) ← `lab2-staging` (Lab 2 integration) ← `feature/*` branches, one per Issue, each merged
via a peer-reviewed, approved Pull Request. Lab 1 used the same pattern with `lab1-staging`.
