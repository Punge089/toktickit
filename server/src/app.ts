import express, { Request, Response } from "express";
import cors from "cors";
import { referenceRouter } from "./routes/reference.js";
import { ticketsRouter } from "./routes/tickets.js";
import { myTicketsRouter } from "./routes/myTickets.js";
import { ticketDetailRouter } from "./routes/ticketDetail.js";
import { attachmentsRouter } from "./routes/attachments.js";

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

app.use(cors());          // already wired: lets the Vite dev server call this API
app.use(express.json());

// ---------------------------------------------------------------------------
// Issue 2 — API health check
// Make the test in tests/lab-01/health.test.ts pass.
// It must return HTTP 200 with JSON: { status: "ok", service: "TokTickIT API" }
// ---------------------------------------------------------------------------
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "TokTickIT API" });
});

// Issue 4 (Lab 1) — /api/categories, now Issue 24 (Lab 2) — plus
// /api/related-systems and /api/dev-requesters. See routes/reference.ts.
app.use(referenceRouter);

// Issue 26 — POST /api/tickets. See routes/tickets.ts.
app.use(ticketsRouter);

// Issue 28 — GET /api/tickets (paginated, owned list). See routes/myTickets.ts.
app.use(myTicketsRouter);

// Issue 30 — GET /api/tickets/:id (owned detail). See routes/ticketDetail.ts.
app.use(ticketDetailRouter);

// Issue 31 — attachment lifecycle: add, metadata, download, soft-remove.
// See routes/attachments.ts.
app.use(attachmentsRouter);

export default app;
