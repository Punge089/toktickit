# TokTickIT - Lab 1: Full-Stack Hello World Starter

TokTickIT is an IT service desk application (Account & Access, Hardware, Software, Network requests).
Lab 1 builds a thin vertical slice proving the stack works end to end: a React page calls an
Express API, which reads the four supported request categories from PostgreSQL via Prisma.

## Tech stack

| Layer      | Technology                                   |
|------------|-----------------------------------------------|
| Frontend   | React + TypeScript + Vite + Bootstrap          |
| Backend    | Node.js + Express + TypeScript                 |
| Database   | PostgreSQL + Prisma ORM                        |
| Testing    | Vitest (frontend/unit) + Supertest (API)       |

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL running locally (or reachable) with a database you can connect to

## Project structure

```
toktickit/
├── client/          React + Vite + Bootstrap frontend
├── server/          Express + TypeScript API, Prisma schema, seed
│   ├── prisma/      schema.prisma, seed.ts, migrations
│   ├── src/         app.ts (Express app), index.ts (listener), prisma.ts
│   └── tests/lab-01/  Supertest API tests
├── docs/lab-01/     ai_use.md, reviewer.md, tests.md
└── .gitignore
```

## Setup

1. **Clone and enter the repo**
   ```bash
   git clone https://github.com/Punge089/toktickit.git
   cd toktickit
   ```

2. **Install dependencies** (client and server are separate npm projects)
   ```bash
   cd server && npm install
   cd ../client && npm install
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

5. **Run the apps** (two terminals)
   ```bash
   # terminal 1 - API on http://localhost:3000
   cd server && npm run dev

   # terminal 2 - frontend on http://localhost:5173
   cd client && npm run dev
   ```

6. Open `http://localhost:5173`, click **Check System** to see the backend status and the
   supported request categories.

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

# frontend unit + UI component tests (Vitest) - from client/
cd client && npm test
```

## Required API endpoints

| Method | Path              | Description                                  |
|--------|-------------------|-----------------------------------------------|
| GET    | `/api/health`     | Health check - `{ status: "ok", service: "TokTickIT API" }` |
| GET    | `/api/categories` | Returns the seeded IT request categories, ordered by id |

## Documentation

- [`docs/lab-01/ai_use.md`](docs/lab-01/ai_use.md) - AI tool used and reflection on prompts.
- [`docs/lab-01/reviewer.md`](docs/lab-01/reviewer.md) - peer review record.
- [`docs/lab-01/tests.md`](docs/lab-01/tests.md) - test plan and evidence.

## Git workflow

This project follows the Lab 1 Git flow: `main` (stable) ← `lab1-staging` (integration) ←
`feature/*` branches, one per Issue, each merged via a peer-reviewed Pull Request.
