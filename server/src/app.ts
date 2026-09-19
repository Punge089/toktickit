import express, { Request, Response } from "express";
import cors from "cors";
import { referenceRouter } from "./routes/reference.js";
import { ticketsRouter } from "./routes/tickets.js";
import { myTicketsRouter } from "./routes/myTickets.js";
import { ticketDetailRouter } from "./routes/ticketDetail.js";
import { attachmentsRouter } from "./routes/attachments.js";
import { authRouter } from "./routes/auth.js";
import { staffQueueRouter } from "./routes/staffQueue.js";
import { originCheck } from "./middleware/auth.js";

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

// Issue 63 — credentials:true + an explicit origin (not "*") is required
// for the browser to send/accept the session cookie cross-port
// (localhost:5173 -> localhost:3000). See docs/lab-03/api-spec.md §0.
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(originCheck);

// ---------------------------------------------------------------------------
// Issue 2 — API health check
// Make the test in tests/lab-01/health.test.ts pass.
// It must return HTTP 200 with JSON: { status: "ok", service: "TokTickIT API" }
// ---------------------------------------------------------------------------
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "TokTickIT API" });
});

// Issue 63 — login/logout/me/change-password. See routes/auth.ts.
app.use(authRouter);

// Issue 65 — IT Staff Ticket Queue + assignable users. See routes/staffQueue.ts.
app.use(staffQueueRouter);

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
