import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { lockTicket } from "../lib/ticketLock.js";
import { AUTO_CANCEL_RESULT, checkResolutionGate } from "../lib/workflowRules.js";
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
      actions: { select: { id: true, actionStatus: true } },
    },
  });
  if (!ticket) return null;

  const transitions = allowedTransitions(ticket.currentStatus);
  const actionCounts = { open: 0, completed: 0, cancelled: 0 };
  for (const a of ticket.actions) {
    if (a.actionStatus === "COMPLETED") actionCounts.completed += 1;
    else if (a.actionStatus === "CANCELLED") actionCounts.cancelled += 1;
    else actionCounts.open += 1;
  }
  // api-spec section 5: only explains a disabled Resolved option, so it is
  // empty whenever Resolved is not a permitted move from here anyway.
  const resolutionBlockers = transitions.includes("RESOLVED") ? checkResolutionGate(ticket.actions).blockers : [];

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
    allowedTransitions: transitions,
    version: ticket.version,
    actionCounts,
    resolutionBlockers,
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

// Lab 4 BR-17: owner, IT Priority and status changes carry the Ticket
// `version` the user last saw. Each one runs in a transaction that locks the
// Ticket row, so the version check, the rules and the write see one state.
interface Outcome {
  status: number;
  body: unknown;
}

type Change = Outcome | { data: Prisma.TicketUpdateManyMutationInput & Prisma.TicketUncheckedUpdateManyInput };

function expectedVersionOf(body: Record<string, unknown>): number | null {
  return Number.isInteger(body.expectedVersion) ? (body.expectedVersion as number) : null;
}

function validationFailed(fieldErrors: Record<string, string>, message = "Fix the highlighted fields."): Outcome {
  return { status: 400, body: { error: "VALIDATION_FAILED", message, fieldErrors } };
}

function staleBody(currentVersion: number) {
  return {
    error: "STALE_VERSION",
    message: "This ticket was changed by someone else. Reload to see the latest version.",
    currentVersion,
  };
}

class LostRace extends Error {}

const EXPECTED_VERSION_ERROR = "expectedVersion is required and must be an integer.";

// Runs one guarded change. The common checks come first in the order of
// specification BR-25 (404, stale version, terminal Ticket); `change` then
// applies the rules specific to the route and returns either an answer or the
// data to write. A successful write increments `version` in the same
// conditional UPDATE, so a second writer holding the old version matches no row.
async function guardedChange(
  ticketId: number | null,
  expectedVersion: number,
  change: (tx: Prisma.TransactionClient, ticket: Prisma.TicketGetPayload<object>) => Promise<Change>,
): Promise<Outcome> {
  if (ticketId === null) return { status: 404, body: NOT_FOUND };
  const result = await getPrisma().$transaction(async (tx): Promise<Outcome | "ok"> => {
    const ticket = await lockTicket(tx, ticketId);
    if (!ticket) return { status: 404, body: NOT_FOUND };
    if (ticket.version !== expectedVersion) return { status: 409, body: staleBody(ticket.version) };
    if (isTerminal(ticket.currentStatus)) return { status: 409, body: CLOSED };

    const decided = await change(tx, ticket);
    if ("status" in decided) return decided;

    const updated = await tx.ticket.updateMany({
      where: { id: ticketId, version: expectedVersion },
      data: { ...decided.data, version: { increment: 1 } },
    });
    // Throwing (not returning) rolls back anything `change` already wrote,
    // such as the cancel cascade, if the conditional UPDATE lost the race.
    if (updated.count === 0) throw new LostRace();
    return "ok";
  }).catch(async (err) => {
    if (!(err instanceof LostRace)) throw err;
    const current = await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { version: true } });
    return { status: 409, body: staleBody(current.version) } as Outcome;
  });
  if (result !== "ok") return result;
  return { status: 200, body: await loadDetail(ticketId) };
}

// section 11 - claim / assign / reassign / unassign
staffTicketsRouter.patch("/api/staff/tickets/:id/owner", ...actors, async (req: Request, res: Response) => {
  const body: Record<string, unknown> = req.body && typeof req.body === "object" ? req.body : {};
  const raw = body.ownerId;
  const ownerId = raw === null ? null : typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : undefined;
  const expectedVersion = expectedVersionOf(body);
  const fieldErrors: Record<string, string> = {};
  if (ownerId === undefined) fieldErrors.ownerId = "ownerId must be a positive integer, or null to unassign.";
  if (expectedVersion === null) fieldErrors.expectedVersion = EXPECTED_VERSION_ERROR;
  if (Object.keys(fieldErrors).length > 0 || ownerId === undefined) {
    const out = validationFailed(fieldErrors, fieldErrors.ownerId);
    res.status(out.status).json(out.body);
    return;
  }
  try {
    const out = await guardedChange(parseId(req.params.id), expectedVersion!, async (tx, ticket) => {
      if (ownerId !== null) {
        // BR-17: only an active IT Staff user can own a Ticket.
        const candidate = await tx.user.findFirst({ where: { id: ownerId, role: "IT_STAFF", isActive: true } });
        if (!candidate) {
          return { status: 409, body: { error: "INVALID_OWNER", message: "Owner must be an active IT Staff user." } };
        }
      }
      // Unassigning while the Ticket is in an owner-required state would
      // strand active work with nobody responsible (BR-20).
      if (ownerId === null && requiresOwner(ticket.currentStatus)) {
        return {
          status: 409,
          body: {
            error: "OWNER_REQUIRED",
            message: "An owner is required while a ticket is In Progress, Waiting for Requester, or Resolved.",
          },
        };
      }
      return { data: { ownerId } };
    });
    res.status(out.status).json(out.body);
  } catch {
    res.status(500).json(INTERNAL);
  }
});

// section 12
staffTicketsRouter.patch("/api/staff/tickets/:id/it-priority", ...actors, async (req: Request, res: Response) => {
  const body: Record<string, unknown> = req.body && typeof req.body === "object" ? req.body : {};
  const value = body.itPriority;
  const expectedVersion = expectedVersionOf(body);
  const fieldErrors: Record<string, string> = {};
  if (typeof value !== "string" || !(PRIORITIES as readonly string[]).includes(value)) {
    fieldErrors.itPriority = "itPriority must be one of LOW, MEDIUM, HIGH, URGENT.";
  }
  if (expectedVersion === null) fieldErrors.expectedVersion = EXPECTED_VERSION_ERROR;
  if (Object.keys(fieldErrors).length > 0) {
    const out = validationFailed(fieldErrors, fieldErrors.itPriority);
    res.status(out.status).json(out.body);
    return;
  }
  try {
    const out = await guardedChange(parseId(req.params.id), expectedVersion!, async () => ({
      data: { itPriority: value as (typeof PRIORITIES)[number] },
    }));
    res.status(out.status).json(out.body);
  } catch {
    res.status(500).json(INTERNAL);
  }
});

// section 13
staffTicketsRouter.patch("/api/staff/tickets/:id/status", ...actors, async (req: Request, res: Response) => {
  const body: Record<string, unknown> = req.body && typeof req.body === "object" ? req.body : {};
  const target = body.status;
  const expectedVersion = expectedVersionOf(body);
  const fieldErrors: Record<string, string> = {};
  if (!isTicketStatus(target)) fieldErrors.status = "status must be a valid ticket status.";
  if (expectedVersion === null) fieldErrors.expectedVersion = EXPECTED_VERSION_ERROR;
  if (Object.keys(fieldErrors).length > 0 || !isTicketStatus(target)) {
    const out = validationFailed(fieldErrors, fieldErrors.status);
    res.status(out.status).json(out.body);
    return;
  }
  try {
    const out = await guardedChange(parseId(req.params.id), expectedVersion!, async (tx, ticket) => {
      if (!canTransition(ticket.currentStatus, target)) {
        return {
          status: 409,
          body: { error: "INVALID_TRANSITION", message: `Cannot move from ${ticket.currentStatus} to ${target}.` },
        };
      }

      let resolutionSummary: string | undefined;
      if (target === "RESOLVED") {
        const check = validateEntryBody(body.resolutionSummary);
        if (!check.ok) {
          return validationFailed(
            { resolutionSummary: check.message },
            "A Resolution Summary is required to resolve a ticket.",
          );
        }
        resolutionSummary = check.body;
      }

      if (requiresOwner(target) && ticket.ownerId === null) {
        return {
          status: 409,
          body: { error: "OWNER_REQUIRED", message: "Assign an owner before starting work on this ticket." },
        };
      }

      // BR-20, BR-21: the gate is read under the Ticket row lock, so an Action
      // written at the same moment waits for this transaction to finish.
      if (target === "RESOLVED") {
        const actions = await tx.actionTaken.findMany({
          where: { ticketId: ticket.id },
          select: { id: true, actionStatus: true },
        });
        const gate = checkResolutionGate(actions);
        if (gate.blockers.length > 0) {
          return {
            status: 409,
            body: {
              error: "RESOLUTION_BLOCKED",
              message: "Finish or cancel the open actions, and complete at least one action, before resolving.",
              blockers: gate.blockers,
              openActionIds: gate.openActionIds,
            },
          };
        }
      }

      // BR-22: cancelling the Ticket cancels its open Actions in the same
      // transaction. An empty Result gets the system reason first, because a
      // Cancelled Action must carry one (Lab 4 BR-09).
      if (target === "CANCELLED") {
        const open = { ticketId: ticket.id, actionStatus: { in: ["PLANNED", "IN_PROGRESS"] as ("PLANNED" | "IN_PROGRESS")[] } };
        await tx.actionTaken.updateMany({
          where: { ...open, OR: [{ result: null }, { result: "" }] },
          data: { result: AUTO_CANCEL_RESULT },
        });
        await tx.actionTaken.updateMany({ where: open, data: { actionStatus: "CANCELLED", version: { increment: 1 } } });
      }

      return {
        data: {
          currentStatus: target,
          ...(resolutionSummary !== undefined ? { resolutionSummary } : {}),
          // BR-23: reopening clears the Requester's earlier "appears resolved".
          ...(target === "REOPENED" ? { requesterResolvedAt: null } : {}),
        },
      };
    });
    res.status(out.status).json(out.body);
  } catch {
    res.status(500).json(INTERNAL);
  }
});

// Loads the Ticket for an append (Internal Notes), answering 404/409 itself.
// Terminal Tickets accept nothing new (BR-22). Notes are not versioned: they
// are append-only, so two writers cannot overwrite each other.
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
