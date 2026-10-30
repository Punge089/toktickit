import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { lockTicket } from "../lib/ticketLock.js";
import { requireAuth, requirePasswordCurrent, requireRole } from "../middleware/auth.js";
import {
  CLIENT_REQUEST_ID_PATTERN,
  CREATABLE_STATUSES,
  ActionStatusValue,
  canActionTransition,
  isActionStatus,
  isOpenAction,
  ticketAllowsActions,
  validateActionFields,
} from "../lib/actionRules.js";

// Lab 4 — Issue 80: Actions Taken (docs/lab-04/api-spec.md §1 to §3). One
// read route serves Requester (own Ticket only), IT Staff and Administrator;
// the two write routes are IT Staff and Administrator (BR-05, BR-06).
export const actionsRouter = Router();

const readers = [requireAuth, requirePasswordCurrent, requireRole("REQUESTER", "IT_STAFF", "ADMINISTRATOR")];
const writers = [requireAuth, requirePasswordCurrent, requireRole("IT_STAFF", "ADMINISTRATOR")];

const NOT_FOUND = { error: "TICKET_NOT_FOUND", message: "Ticket not found." };
const ACTION_NOT_FOUND = { error: "ACTION_NOT_FOUND", message: "Action not found on this ticket." };
const INTERNAL = { error: "INTERNAL_ERROR", message: "Something went wrong. Please try again." };
const INVALID_ASSIGNEE = { error: "INVALID_ASSIGNEE", message: "The assignee must be an active IT Staff user." };

const actionInclude = {
  performedBy: { select: { id: true, fullName: true, isActive: true } },
  assignee: { select: { id: true, fullName: true, isActive: true } },
} satisfies Prisma.ActionTakenInclude;

type ActionRow = Prisma.ActionTakenGetPayload<{ include: typeof actionInclude }>;

// Prisma interactive transactions return one value, so each branch hands back
// the HTTP answer it wants sent instead of writing to `res` inside the lock.
interface Outcome {
  status: number;
  body: unknown;
}

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function has(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined;
}

// No Internal Note text and no password data ever reach this shape (BR-10).
function serializeAction(a: ActionRow) {
  return {
    id: a.id,
    ticketId: a.ticketId,
    actionAt: a.actionAt,
    description: a.description,
    result: a.result,
    performedBy: a.performedBy,
    assignee: a.assignee,
    followUpRequired: a.followUpRequired,
    followUpNote: a.followUpNote,
    attachmentNotes: a.attachmentNotes,
    actionStatus: a.actionStatus,
    version: a.version,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

// BR-14: an Action changes the Ticket's updatedAt, never its version.
async function touchTicket(tx: Prisma.TransactionClient, ticketId: number) {
  await tx.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
}

async function activeStaffExists(tx: Prisma.TransactionClient, userId: number) {
  const user = await tx.user.findFirst({ where: { id: userId, role: "IT_STAFF", isActive: true }, select: { id: true } });
  return user !== null;
}

// api-spec §1
actionsRouter.get("/api/tickets/:id/actions", ...readers, async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  try {
    // A Requester only reaches their own Tickets; another Requester's Ticket
    // is indistinguishable from a missing one (BR-10, Lab 3 BR-15).
    const ticket = await getPrisma().ticket.findFirst({
      where: req.user!.role === "REQUESTER" ? { id, requesterId: req.user!.id } : { id },
      select: { id: true },
    });
    if (!ticket) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    const rows = await getPrisma().actionTaken.findMany({
      where: { ticketId: ticket.id },
      orderBy: [{ actionAt: "asc" }, { id: "asc" }],
      include: actionInclude,
    });
    const counts = { open: 0, completed: 0, cancelled: 0 };
    for (const row of rows) {
      if (isOpenAction(row.actionStatus)) counts.open += 1;
      else if (row.actionStatus === "COMPLETED") counts.completed += 1;
      else counts.cancelled += 1;
    }
    res.status(200).json({ items: rows.map(serializeAction), counts });
  } catch {
    res.status(500).json(INTERNAL);
  }
});

// api-spec §2
actionsRouter.post("/api/staff/tickets/:id/actions", ...writers, async (req: Request, res: Response) => {
  const body: Record<string, unknown> = req.body && typeof req.body === "object" ? req.body : {};

  const requestId = body.clientRequestId;
  const fieldErrors: Record<string, string> = {};
  if (typeof requestId !== "string" || !CLIENT_REQUEST_ID_PATTERN.test(requestId)) {
    fieldErrors.clientRequestId = "clientRequestId is required: 1 to 64 letters, digits or hyphens.";
  }
  if (!isPositiveInt(body.assigneeId)) {
    fieldErrors.assigneeId = "Assignee is required.";
  }
  if (
    has(body, "actionStatus") &&
    !(isActionStatus(body.actionStatus) && CREATABLE_STATUSES.includes(body.actionStatus))
  ) {
    fieldErrors.actionStatus = "A new action can be Planned, In Progress or Completed.";
  }
  const checked = validateActionFields({
    actionAt: body.actionAt,
    description: body.description,
    result: body.result,
    followUpRequired: body.followUpRequired,
    followUpNote: body.followUpNote,
    attachmentNotes: body.attachmentNotes,
    actionStatus: body.actionStatus,
  });
  if (!checked.ok) {
    for (const [key, message] of Object.entries(checked.fieldErrors)) fieldErrors[key] ??= message;
  }
  if (Object.keys(fieldErrors).length > 0 || !checked.ok) {
    res.status(400).json({ error: "VALIDATION_FAILED", message: "Fix the highlighted fields.", fieldErrors });
    return;
  }

  const ticketId = parseId(req.params.id);
  if (ticketId === null) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  const clientRequestId = requestId as string;
  const assigneeId = body.assigneeId as number;
  const user = req.user!;

  try {
    const outcome = await getPrisma().$transaction(async (tx): Promise<Outcome> => {
      const ticket = await lockTicket(tx, ticketId);
      if (!ticket) return { status: 404, body: NOT_FOUND };

      // BR-18: a replay is recognised before the state checks, so retrying a
      // request that already succeeded gets its original answer even if the
      // Ticket has since moved on.
      const existing = await tx.actionTaken.findUnique({
        where: { ticketId_clientRequestId: { ticketId, clientRequestId } },
        include: actionInclude,
      });
      if (existing) {
        if (existing.performedById !== user.id) {
          return {
            status: 409,
            body: { error: "DUPLICATE_REQUEST_KEY", message: "This request key was already used by another user." },
          };
        }
        return { status: 200, body: serializeAction(existing) };
      }

      if (!ticketAllowsActions(ticket.currentStatus)) {
        return {
          status: 409,
          body: {
            error: "ACTIONS_LOCKED",
            message: "Actions cannot be added while the ticket is Resolved, Closed or Cancelled.",
          },
        };
      }
      if (!(await activeStaffExists(tx, assigneeId))) return { status: 409, body: INVALID_ASSIGNEE };

      // performedById comes from the session only; createdAt, version and
      // ticketId in the body are never read (BR-03, AC-05).
      const created = await tx.actionTaken.create({
        data: {
          ticketId,
          clientRequestId,
          performedById: user.id,
          assigneeId,
          ...checked.value,
        },
        include: actionInclude,
      });
      await touchTicket(tx, ticketId);
      return { status: 201, body: serializeAction(created) };
    });
    res.status(outcome.status).json(outcome.body);
  } catch {
    res.status(500).json(INTERNAL);
  }
});

const CHANGEABLE_FIELDS = [
  "actionAt",
  "description",
  "result",
  "assigneeId",
  "followUpRequired",
  "followUpNote",
  "attachmentNotes",
  "actionStatus",
] as const;

// api-spec §3. Checks run in the order of specification BR-25: shape (400),
// existence (404), stale version, final Action, locked Ticket, transition;
// then the field rules on the Action as it would be after the change, and
// last the assignee, which needs a database lookup.
actionsRouter.patch("/api/staff/tickets/:id/actions/:actionId", ...writers, async (req: Request, res: Response) => {
  const body: Record<string, unknown> = req.body && typeof req.body === "object" ? req.body : {};

  const shapeErrors: Record<string, string> = {};
  if (!Number.isInteger(body.expectedVersion)) {
    shapeErrors.expectedVersion = "expectedVersion is required and must be an integer.";
  }
  if (has(body, "assigneeId") && !isPositiveInt(body.assigneeId)) {
    shapeErrors.assigneeId = "Assignee must be a valid user.";
  }
  const supplied = CHANGEABLE_FIELDS.filter((key) => has(body, key));
  if (Object.keys(shapeErrors).length === 0 && supplied.length === 0) {
    res.status(400).json({
      error: "VALIDATION_FAILED",
      message: "Send at least one field to change.",
      fieldErrors: {},
    });
    return;
  }
  if (Object.keys(shapeErrors).length > 0) {
    res.status(400).json({ error: "VALIDATION_FAILED", message: "Fix the highlighted fields.", fieldErrors: shapeErrors });
    return;
  }

  const ticketId = parseId(req.params.id);
  const actionId = parseId(req.params.actionId);
  if (ticketId === null) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  if (actionId === null) {
    res.status(404).json(ACTION_NOT_FOUND);
    return;
  }
  const expectedVersion = body.expectedVersion as number;

  try {
    const outcome = await getPrisma().$transaction(async (tx): Promise<Outcome> => {
      const ticket = await lockTicket(tx, ticketId);
      if (!ticket) return { status: 404, body: NOT_FOUND };

      const action = await tx.actionTaken.findFirst({ where: { id: actionId, ticketId } });
      if (!action) return { status: 404, body: ACTION_NOT_FOUND };

      if (action.version !== expectedVersion) return { status: 409, body: staleBody(action.version) };
      if (!isOpenAction(action.actionStatus)) {
        return {
          status: 409,
          body: { error: "ACTION_LOCKED", message: "A completed or cancelled action can no longer be changed." },
        };
      }
      if (!ticketAllowsActions(ticket.currentStatus)) {
        return {
          status: 409,
          body: {
            error: "ACTIONS_LOCKED",
            message: "Actions cannot be changed while the ticket is Resolved, Closed or Cancelled.",
          },
        };
      }

      const target = body.actionStatus;
      if (has(body, "actionStatus") && isActionStatus(target) && !canActionTransition(action.actionStatus, target)) {
        return {
          status: 409,
          body: {
            error: "INVALID_ACTION_TRANSITION",
            message: `Cannot move an action from ${label(action.actionStatus)} to ${label(target)}.`,
          },
        };
      }

      const pick = (key: (typeof CHANGEABLE_FIELDS)[number], stored: unknown) => (has(body, key) ? body[key] : stored);
      const checked = validateActionFields({
        actionAt: pick("actionAt", action.actionAt),
        description: pick("description", action.description),
        result: pick("result", action.result),
        followUpRequired: pick("followUpRequired", action.followUpRequired),
        followUpNote: pick("followUpNote", action.followUpNote),
        attachmentNotes: pick("attachmentNotes", action.attachmentNotes),
        actionStatus: pick("actionStatus", action.actionStatus),
      });
      if (!checked.ok) {
        return {
          status: 400,
          body: { error: "VALIDATION_FAILED", message: "Fix the highlighted fields.", fieldErrors: checked.fieldErrors },
        };
      }

      // BR-04: only a changed assignee has to be active IT Staff, so an
      // unchanged one who was deactivated later does not block other edits.
      const assigneeId = has(body, "assigneeId") ? (body.assigneeId as number) : action.assigneeId;
      if (assigneeId !== action.assigneeId && !(await activeStaffExists(tx, assigneeId))) {
        return { status: 409, body: INVALID_ASSIGNEE };
      }

      // BR-16: one conditional UPDATE ... WHERE id = ? AND version = ?; zero
      // rows means someone else got there first.
      const updated = await tx.actionTaken.updateMany({
        where: { id: actionId, version: expectedVersion },
        data: { ...checked.value, assigneeId, version: { increment: 1 } },
      });
      if (updated.count === 0) {
        const current = await tx.actionTaken.findUniqueOrThrow({ where: { id: actionId }, select: { version: true } });
        return { status: 409, body: staleBody(current.version) };
      }
      await touchTicket(tx, ticketId);
      const fresh = await tx.actionTaken.findUniqueOrThrow({ where: { id: actionId }, include: actionInclude });
      return { status: 200, body: serializeAction(fresh) };
    });
    res.status(outcome.status).json(outcome.body);
  } catch {
    res.status(500).json(INTERNAL);
  }
});

function staleBody(currentVersion: number) {
  return {
    error: "STALE_VERSION",
    message: "This action was changed by someone else. Reload to see the latest version.",
    currentVersion,
  };
}

function label(status: ActionStatusValue): string {
  return status === "IN_PROGRESS" ? "In Progress" : status.charAt(0) + status.slice(1).toLowerCase();
}
