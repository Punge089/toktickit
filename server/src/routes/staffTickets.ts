import { Router, Request, Response } from "express";
import { getPrisma } from "../prisma.js";
import { requireAuth, requirePasswordCurrent, requireRole } from "../middleware/auth.js";
import { PRIORITIES } from "../lib/ticketValidation.js";
import { allowedTransitions, canTransition, isTerminal, isTicketStatus, requiresOwner } from "../lib/transitions.js";
import { serializeEntry, validateEntryBody } from "../lib/entries.js";

// Issue 66 — IT Staff Ticket Detail and operations (docs/lab-03/api-spec.md
// section 9, 11-14). IT_STAFF may read and act; ADMINISTRATOR may read only
// (BR-36, specification.md section 11).
export const staffTicketsRouter = Router();

const readers = [requireAuth, requirePasswordCurrent, requireRole("IT_STAFF", "ADMINISTRATOR")];
const actors = [requireAuth, requirePasswordCurrent, requireRole("IT_STAFF")];

const NOT_FOUND = { error: "TICKET_NOT_FOUND", message: "Ticket not found." };
const CLOSED = { error: "TICKET_CLOSED", message: "This ticket is closed and can no longer be changed." };
const INTERNAL = { error: "INTERNAL_ERROR", message: "Something went wrong. Please try again." };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function loadDetail(id: number) {
  const ticket = await getPrisma().ticket.findUnique({
    where: { id },
    include: {
      requester: { select: { fullName: true } },
      category: { select: { name: true } },
      relatedSystem: { select: { name: true } },
      owner: { select: { fullName: true, isActive: true } },
      attachments: {
        orderBy: { uploadedAt: "asc" },
        include: { uploadedBy: { select: { fullName: true } }, removedBy: { select: { fullName: true } } },
      },
    },
  });
  if (!ticket) return null;
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    requesterId: ticket.requesterId,
    requesterName: ticket.requester.fullName,
    summary: ticket.summary,
    description: ticket.description,
    categoryId: ticket.categoryId,
    categoryName: ticket.category.name,
    relatedSystemId: ticket.relatedSystemId,
    relatedSystemName: ticket.relatedSystem.name,
    requestedPriority: ticket.requestedPriority,
    itPriority: ticket.itPriority,
    currentStatus: ticket.currentStatus,
    allowedTransitions: allowedTransitions(ticket.currentStatus),
    ownerId: ticket.ownerId,
    ownerName: ticket.owner?.fullName ?? null,
    ownerIsActive: ticket.owner?.isActive ?? null,
    resolutionSummary: ticket.resolutionSummary,
    requesterResolvedAt: ticket.requesterResolvedAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    attachments: ticket.attachments.map((a) => ({
      id: a.id,
      originalFilename: a.originalFilename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      uploadedAt: a.uploadedAt,
      uploadedByName: a.uploadedBy.fullName,
      removedAt: a.removedAt,
      removedByName: a.removedBy?.fullName ?? null,
      removalReason: a.removalReason,
    })),
  };
}

// api-spec section 9
staffTicketsRouter.get("/api/staff/tickets/:id", ...readers, async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  try {
    const detail = await loadDetail(id);
    if (!detail) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    res.status(200).json(detail);
  } catch {
    res.status(500).json(INTERNAL);
  }
});

// Loads the Ticket for a mutation, answering 404/409 itself. Terminal
// Tickets accept no owner/priority/status change (BR-22).
async function loadMutable(req: Request, res: Response) {
  const id = parseId(req.params.id);
  const ticket = id === null ? null : await getPrisma().ticket.findUnique({ where: { id } });
  if (!ticket) {
    res.status(404).json(NOT_FOUND);
    return null;
  }
  if (isTerminal(ticket.currentStatus)) {
    res.status(409).json(CLOSED);
    return null;
  }
  return ticket;
}

// section 11 - claim / assign / reassign / unassign
staffTicketsRouter.patch("/api/staff/tickets/:id/owner", ...actors, async (req: Request, res: Response) => {
  const raw = req.body?.ownerId;
  const ownerId = raw === null ? null : typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : undefined;
  if (ownerId === undefined) {
    res.status(400).json({
      error: "VALIDATION_FAILED",
      message: "ownerId must be a positive integer, or null to unassign.",
      fieldErrors: { ownerId: "ownerId must be a positive integer, or null to unassign." },
    });
    return;
  }
  try {
    const ticket = await loadMutable(req, res);
    if (!ticket) return;

    if (ownerId !== null) {
      // BR-17: only an active IT Staff user can own a Ticket.
      const candidate = await getPrisma().user.findFirst({ where: { id: ownerId, role: "IT_STAFF", isActive: true } });
      if (!candidate) {
        res.status(409).json({ error: "INVALID_OWNER", message: "Owner must be an active IT Staff user." });
        return;
      }
    }
    // Unassigning while the Ticket is in an owner-required state would
    // strand active work with nobody responsible (BR-20).
    if (ownerId === null && requiresOwner(ticket.currentStatus)) {
      res.status(409).json({
        error: "OWNER_REQUIRED",
        message: "An owner is required while a ticket is In Progress, Waiting for Requester, or Resolved.",
      });
      return;
    }
    await getPrisma().ticket.update({ where: { id: ticket.id }, data: { ownerId } });
    res.status(200).json(await loadDetail(ticket.id));
  } catch {
    res.status(500).json(INTERNAL);
  }
});

// section 12
staffTicketsRouter.patch("/api/staff/tickets/:id/it-priority", ...actors, async (req: Request, res: Response) => {
  const value = req.body?.itPriority;
  if (typeof value !== "string" || !(PRIORITIES as readonly string[]).includes(value)) {
    res.status(400).json({
      error: "VALIDATION_FAILED",
      message: "itPriority must be one of LOW, MEDIUM, HIGH, URGENT.",
      fieldErrors: { itPriority: "itPriority must be one of LOW, MEDIUM, HIGH, URGENT." },
    });
    return;
  }
  try {
    const ticket = await loadMutable(req, res);
    if (!ticket) return;
    await getPrisma().ticket.update({
      where: { id: ticket.id },
      data: { itPriority: value as (typeof PRIORITIES)[number] },
    });
    res.status(200).json(await loadDetail(ticket.id));
  } catch {
    res.status(500).json(INTERNAL);
  }
});

// section 13
staffTicketsRouter.patch("/api/staff/tickets/:id/status", ...actors, async (req: Request, res: Response) => {
  const target = req.body?.status;
  if (!isTicketStatus(target)) {
    res.status(400).json({
      error: "VALIDATION_FAILED",
      message: "status must be a valid ticket status.",
      fieldErrors: { status: "status must be a valid ticket status." },
    });
    return;
  }
  try {
    const ticket = await loadMutable(req, res);
    if (!ticket) return;

    if (!canTransition(ticket.currentStatus, target)) {
      res.status(409).json({
        error: "INVALID_TRANSITION",
        message: `Cannot move from ${ticket.currentStatus} to ${target}.`,
      });
      return;
    }

    let resolutionSummary: string | undefined;
    if (target === "RESOLVED") {
      const check = validateEntryBody(req.body?.resolutionSummary);
      if (!check.ok) {
        res.status(400).json({
          error: "VALIDATION_FAILED",
          message: "A Resolution Summary is required to resolve a ticket.",
          fieldErrors: { resolutionSummary: check.message },
        });
        return;
      }
      resolutionSummary = check.body;
    }

    if (requiresOwner(target) && ticket.ownerId === null) {
      res.status(409).json({
        error: "OWNER_REQUIRED",
        message: "Assign an owner before starting work on this ticket.",
      });
      return;
    }

    await getPrisma().ticket.update({
      where: { id: ticket.id },
      data: {
        currentStatus: target,
        ...(resolutionSummary !== undefined ? { resolutionSummary } : {}),
        // BR-23: reopening clears the Requester's earlier "appears resolved".
        ...(target === "REOPENED" ? { requesterResolvedAt: null } : {}),
      },
    });
    res.status(200).json(await loadDetail(ticket.id));
  } catch {
    res.status(500).json(INTERNAL);
  }
});

// section 14 - Internal Notes. Requesters never reach the handler:
// requireRole answers 403 before any Ticket is looked up (AC-04, AC-20).
staffTicketsRouter.get("/api/staff/tickets/:id/notes", ...readers, async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  try {
    const exists = id === null ? null : await getPrisma().ticket.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    const notes = await getPrisma().internalNote.findMany({
      where: { ticketId: exists.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { author: { select: { fullName: true, role: true } } },
    });
    res.status(200).json(notes.map(serializeEntry));
  } catch {
    res.status(500).json(INTERNAL);
  }
});

staffTicketsRouter.post("/api/staff/tickets/:id/notes", ...actors, async (req: Request, res: Response) => {
  const check = validateEntryBody(req.body?.body);
  if (!check.ok) {
    res.status(400).json({ error: "VALIDATION_FAILED", message: check.message, fieldErrors: { body: check.message } });
    return;
  }
  try {
    const ticket = await loadMutable(req, res);
    if (!ticket) return;
    // author and createdAt always come from the server (BR-27).
    const note = await getPrisma().internalNote.create({
      data: { ticketId: ticket.id, authorId: req.user!.id, body: check.body },
      include: { author: { select: { fullName: true, role: true } } },
    });
    res.status(201).json(serializeEntry(note));
  } catch {
    res.status(500).json(INTERNAL);
  }
});
