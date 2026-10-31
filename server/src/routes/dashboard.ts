import { Router, Request, Response } from "express";
import { getPrisma } from "../prisma.js";
import { requireAuth, requirePasswordCurrent, requireRole } from "../middleware/auth.js";
import { ACTIVE_TICKET_STATUSES } from "../lib/workflowRules.js";

// Lab 4 — Issue 83: dashboards (docs/lab-04/api-spec.md §7 and §8). Every
// figure is computed here, from the database, at request time, with no cache
// (BR-27); the client only displays what it receives. The responses carry
// counts and short lists only, never whole Ticket collections and never
// Internal Note text (BR-33). Nothing depends on a calendar boundary (BR-34).
export const dashboardRouter = Router();

const INTERNAL = { error: "INTERNAL_ERROR", message: "Something went wrong. Please try again." };
const LIST_SIZE = 5;
const ACTIVE = [...ACTIVE_TICKET_STATUSES];
const DESCRIPTION_LIMIT = 120;

const requesterOnly = [requireAuth, requirePasswordCurrent, requireRole("REQUESTER")];
const staffReaders = [requireAuth, requirePasswordCurrent, requireRole("IT_STAFF", "ADMINISTRATOR")];

function cut(text: string): string {
  return text.length > DESCRIPTION_LIMIT ? `${text.slice(0, DESCRIPTION_LIMIT - 1)}…` : text;
}

// api-spec §7. Scope is always the session's user id; a `requesterId` in the
// query is never read (Lab 3 BR-03).
dashboardRouter.get("/api/dashboard/requester", ...requesterOnly, async (req: Request, res: Response) => {
  try {
    const prisma = getPrisma();
    const requesterId = req.user!.id;
    const own = { requesterId };
    const listFields = { id: true, ticketNumber: true, summary: true, currentStatus: true, itPriority: true, updatedAt: true };

    const [byStatus, attention, recent] = await Promise.all([
      prisma.ticket.groupBy({ by: ["currentStatus"], where: own, _count: { _all: true } }),
      prisma.ticket.findMany({
        where: { ...own, currentStatus: "WAITING_FOR_REQUESTER" },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: LIST_SIZE,
        select: listFields,
      }),
      prisma.ticket.findMany({
        where: own,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: LIST_SIZE,
        select: listFields,
      }),
    ]);

    const count = (status: string) => byStatus.find((g) => g.currentStatus === status)?._count._all ?? 0;
    res.status(200).json({
      generatedAt: new Date().toISOString(),
      metrics: {
        openTickets: byStatus.filter((g) => (ACTIVE as string[]).includes(g.currentStatus)).reduce((n, g) => n + g._count._all, 0),
        waitingForYou: count("WAITING_FOR_REQUESTER"),
        resolved: count("RESOLVED"),
        closed: count("CLOSED"),
      },
      attention,
      recent,
    });
  } catch {
    res.status(500).json(INTERNAL);
  }
});

// api-spec §8. IT Staff and Administrators read the same operational figures;
// the Administrator gets account counts instead of the personal ones (BR-31).
dashboardRouter.get("/api/dashboard/staff", ...staffReaders, async (req: Request, res: Response) => {
  try {
    const prisma = getPrisma();
    const user = req.user!;
    const isStaff = user.role === "IT_STAFF";
    const active = { currentStatus: { in: ACTIVE } };
    const ticketFields = {
      id: true,
      ticketNumber: true,
      summary: true,
      currentStatus: true,
      itPriority: true,
      updatedAt: true,
      owner: { select: { id: true, fullName: true } },
    };
    const openActions = { actionStatus: { in: ["PLANNED", "IN_PROGRESS"] as ("PLANNED" | "IN_PROGRESS")[] } };

    const [byStatus, unassigned, byPriority, urgent, recent] = await Promise.all([
      prisma.ticket.groupBy({ by: ["currentStatus"], _count: { _all: true } }),
      prisma.ticket.count({ where: { ownerId: null, ...active } }),
      prisma.ticket.groupBy({ by: ["itPriority"], where: active, _count: { _all: true } }),
      prisma.ticket.findMany({
        where: { ...active, itPriority: { in: ["URGENT", "HIGH"] } },
        // The Priority enum is declared Low to Urgent, so descending puts Urgent first.
        orderBy: [{ itPriority: "desc" }, { updatedAt: "asc" }, { id: "asc" }],
        take: LIST_SIZE,
        select: ticketFields,
      }),
      prisma.ticket.findMany({ orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: LIST_SIZE, select: ticketFields }),
    ]);

    const statusCount = (status: string) => byStatus.find((g) => g.currentStatus === status)?._count._all ?? 0;
    const priorityCount = (p: string) => byPriority.find((g) => g.itPriority === p)?._count._all ?? 0;

    let personal: { myAssigned: number; myOpenActions: number } | null = null;
    let myActions: unknown[] | null = null;
    let accounts: { activeRequesters: number; activeItStaff: number; activeAdministrators: number; inactive: number } | null = null;

    if (isStaff) {
      const [myAssigned, myOpenActions, actions] = await Promise.all([
        prisma.ticket.count({ where: { ownerId: user.id, ...active } }),
        prisma.actionTaken.count({ where: { assigneeId: user.id, ...openActions } }),
        prisma.actionTaken.findMany({
          where: { assigneeId: user.id, ...openActions },
          orderBy: [{ actionAt: "asc" }, { id: "asc" }],
          take: LIST_SIZE,
          select: { id: true, ticketId: true, description: true, actionAt: true, actionStatus: true, followUpRequired: true, ticket: { select: { ticketNumber: true } } },
        }),
      ]);
      personal = { myAssigned, myOpenActions };
      myActions = actions.map((a) => ({
        id: a.id,
        ticketId: a.ticketId,
        ticketNumber: a.ticket.ticketNumber,
        description: cut(a.description),
        actionAt: a.actionAt,
        actionStatus: a.actionStatus,
        followUpRequired: a.followUpRequired,
      }));
    } else {
      const [activeRequesters, activeItStaff, activeAdministrators, inactive] = await Promise.all([
        prisma.user.count({ where: { role: "REQUESTER", isActive: true } }),
        prisma.user.count({ where: { role: "IT_STAFF", isActive: true } }),
        prisma.user.count({ where: { role: "ADMINISTRATOR", isActive: true } }),
        prisma.user.count({ where: { isActive: false } }),
      ]);
      accounts = { activeRequesters, activeItStaff, activeAdministrators, inactive };
    }

    res.status(200).json({
      generatedAt: new Date().toISOString(),
      role: user.role,
      statusCounts: {
        NEW: statusCount("NEW"),
        OPEN: statusCount("OPEN"),
        IN_PROGRESS: statusCount("IN_PROGRESS"),
        WAITING_FOR_REQUESTER: statusCount("WAITING_FOR_REQUESTER"),
      },
      unassigned,
      activeByPriority: {
        URGENT: priorityCount("URGENT"),
        HIGH: priorityCount("HIGH"),
        MEDIUM: priorityCount("MEDIUM"),
        LOW: priorityCount("LOW"),
      },
      personal,
      urgentTickets: urgent,
      recentTickets: recent,
      myActions,
      accounts,
    });
  } catch {
    res.status(500).json(INTERNAL);
  }
});
