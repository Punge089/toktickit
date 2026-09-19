import { Router, Request, Response } from "express";
import { getPrisma } from "../prisma.js";
import { requireAuth, requirePasswordCurrent, requireRole } from "../middleware/auth.js";
import { isTerminal, requesterMayIndicateResolved } from "../lib/transitions.js";
import { serializeEntry, validateEntryBody } from "../lib/entries.js";

// Issue 66 - Public Comments and the Requester's "Problem Appears
// Resolved" action (docs/lab-03/api-spec.md section 6-7). Comments are
// visible to the owning Requester, IT Staff, and Administrator (BR-04); a
// Requester may only touch their own Tickets (404 otherwise, BR-15), IT
// Staff may post on any Ticket, Administrator is read-only (BR-36).
export const commentsRouter = Router();

const NOT_FOUND = { error: "TICKET_NOT_FOUND", message: "Ticket not found." };
const INTERNAL = { error: "INTERNAL_ERROR", message: "Something went wrong. Please try again." };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Finds the Ticket the caller is allowed to see: a Requester only their own.
async function visibleTicket(req: Request) {
  const id = parseId(req.params.id);
  if (id === null) return null;
  return getPrisma().ticket.findFirst({
    where: { id, ...(req.user!.role === "REQUESTER" ? { requesterId: req.user!.id } : {}) },
  });
}

const anyRole = [requireAuth, requirePasswordCurrent, requireRole("REQUESTER", "IT_STAFF", "ADMINISTRATOR")];

commentsRouter.get("/api/tickets/:id/comments", ...anyRole, async (req: Request, res: Response) => {
  try {
    const ticket = await visibleTicket(req);
    if (!ticket) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    const comments = await getPrisma().publicComment.findMany({
      where: { ticketId: ticket.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { author: { select: { fullName: true, role: true } } },
    });
    res.status(200).json(comments.map(serializeEntry));
  } catch {
    res.status(500).json(INTERNAL);
  }
});

commentsRouter.post(
  "/api/tickets/:id/comments",
  requireAuth,
  requirePasswordCurrent,
  requireRole("REQUESTER", "IT_STAFF"),
  async (req: Request, res: Response) => {
    const check = validateEntryBody(req.body?.body);
    if (!check.ok) {
      res.status(400).json({ error: "VALIDATION_FAILED", message: check.message, fieldErrors: { body: check.message } });
      return;
    }
    try {
      const ticket = await visibleTicket(req);
      if (!ticket) {
        res.status(404).json(NOT_FOUND);
        return;
      }
      if (isTerminal(ticket.currentStatus)) {
        res.status(409).json({
          error: "TICKET_CLOSED",
          message: "This ticket is closed. Comments can no longer be added.",
        });
        return;
      }
      const comment = await getPrisma().publicComment.create({
        data: { ticketId: ticket.id, authorId: req.user!.id, body: check.body },
        include: { author: { select: { fullName: true, role: true } } },
      });
      res.status(201).json(serializeEntry(comment));
    } catch {
      res.status(500).json(INTERNAL);
    }
  },
);

// api-spec section 6 - records the Requester's opinion only; the formal
// status never changes (BR-05, AC-21).
commentsRouter.post(
  "/api/tickets/:id/problem-resolved",
  requireAuth,
  requirePasswordCurrent,
  requireRole("REQUESTER"),
  async (req: Request, res: Response) => {
    try {
      const ticket = await visibleTicket(req);
      if (!ticket) {
        res.status(404).json(NOT_FOUND);
        return;
      }
      if (!requesterMayIndicateResolved(ticket.currentStatus) || ticket.requesterResolvedAt !== null) {
        res.status(409).json({
          error: "TICKET_NOT_ACTIVE",
          message: "This ticket cannot be marked resolved by the requester right now.",
        });
        return;
      }
      const updated = await getPrisma().ticket.update({
        where: { id: ticket.id },
        data: { requesterResolvedAt: new Date() },
      });
      res.status(200).json({ requesterResolvedAt: updated.requesterResolvedAt });
    } catch {
      res.status(500).json(INTERNAL);
    }
  },
);
