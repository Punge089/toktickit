# Lab 1 - Test Plan and Evidence

All test files live under `server/tests/lab-01/` and `client/tests/lab-01/`.

| # | Test File | Tool | Test | Result |
|---|-----------|------|------|--------|
| API-01 | `server/tests/lab-01/health.test.ts` | Supertest | `GET /api/health` returns 200, `status = "ok"`, `service = "TokTickIT API"` | ✅ Pass |
| API-02 | `server/tests/lab-01/categories.test.ts` | Supertest | `GET /api/categories` returns the 4 seeded categories in id order | ✅ Pass |
| UI-01 | `client/tests/lab-01/App.test.tsx` | Vitest | `TokTickIT` heading renders | ✅ Pass |
| UI-02 | `client/tests/lab-01/App.test.tsx` | Vitest | Loading state changes to Online + category list on success | ✅ Pass |
| UI-03 | `client/tests/lab-01/App.test.tsx` | Vitest | API failure displays a useful Offline error message | ✅ Pass |

## How to run

```bash
# API tests
cd server && npm test

# Frontend tests
cd client && npm test
```

## Terminal output (server)

```
✓ tests/lab-01/health.test.ts (1 test) 20ms
✓ tests/lab-01/categories.test.ts (1 test) 98ms

Test Files  2 passed (2)
     Tests  2 passed (2)
```

## Terminal output (client)

```
✓ tests/lab-01/App.test.tsx (3 tests) 179ms

Test Files  1 passed (1)
     Tests  3 passed (3)
```

*(Screenshot of the actual terminal output should be inserted here for submission - see
`report_lab01_67070503420.md`.)*

## Manual end-to-end verification

- Booted `server` (`npx tsx src/index.ts`) and confirmed:
  - `GET /api/health` → `{"status":"ok","service":"TokTickIT API"}`
  - `GET /api/categories` → `[{"id":1,"name":"Account and Access"},{"id":2,"name":"Hardware"},{"id":3,"name":"Software"},{"id":4,"name":"Network"}]`
- Stopped the server and confirmed the API becomes unreachable (connection refused), which the
  frontend surfaces as the Offline error state.
- Re-ran `npm run prisma:seed` twice - still exactly 4 category rows (idempotent).
