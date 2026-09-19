import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { requireAuth, requirePasswordCurrent, requireRole } from "../middleware/auth.js";
import { parseQueueQuery } from "../lib/staffQueueQuery.js";

// Issue 65 — IT Staff Ticket Queue (docs/lab-03/api-spec.md §8, §10).
// IT_STAFF and ADMINISTRATOR may read it; only IT_STAFF may act on Tickets
// (Issue 66), per the authorization matrix in specification.md §5.
export const staffQueueRouter = Router();

const readers = [requireAuth, requirePasswordCurrent, requireRole("IT_STAFF", "ADMINISTRATOR")];

staffQueueRouter.get("/api/staff/tickets", ...readers, async (req: Request, res: Response) => {
  const parsed = parseQueueQuery(req.query as Record<string, unknown>);
  if (!parsed.ok) {
    const [field, message] = Object.entries(parsed.fieldErrors)[0];
    res.status(400).json({
      error: "INVALID_QUERY",
      message: `${field}: ${message}`,
      fieldErrors: parsed.fieldErrors,
    });
    return;
  }
  const q = parsed.value;

  const where: Prisma.TicketWhereInput = {};
  if (q.search) {
    where.OR = [
      { ticketNumber: { contains: q.search, mode: "insensitive" } },
      { summary: { contains: q.search, mode: "insensitive" } },
      { requester: { fullName: { contains: q.search, mode: "insensitive" } } },
    ];
  }
  if (q.status) where.currentStatus = q.status;
  if (q.itPriority) where.itPriority = q.itPriority;
  if (q.categoryId) where.categoryId = q.categoryId;
  if (q.owner) {
    if (q.owner.kind === "unassigned") where.ownerId = null;
    else if (q.owner.kind === "me") where.ownerId = req.user!.id;
    else where.ownerId = q.owner.id;
  }

  try {
    const prisma = getPrisma();
    const totalItems = await prisma.ticket.count({ where });
    const totalPages = Math.max(1, Math.ceil(totalItems / q.pageSize));

    // A page past the end is a normal condition for a shared, constantly
    // changing queue, so it returns an empty page rather than a 400.
    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: [{ [q.sortField]: q.sortDir }, { id: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        category: { select: { name: true } },
        requester: { select: { fullName: true } },
        owner: { select: { id: true, fullName: true, isActive: true } },
      },
    });

    res.status(200).json({
      items: tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        summary: t.summary,
        categoryName: t.category.name,
        requestedPriority: t.requestedPriority,
        itPriority: t.itPriority,
        currentStatus: t.currentStatus,
        owner: t.owner ? { id: t.owner.id, fullName: t.owner.fullName, isActive: t.owner.isActive } : null,
        requesterName: t.requester.fullName,
        requesterResolvedAt: t.requesterResolvedAt,
      })),
      page: q.page,
      pageSize: q.pageSize,
      totalItems,
      totalPages,
      sort: `${q.sortField}:${q.sortDir}`,
      appliedFilters: {
        search: q.search,
        status: q.status,
        itPriority: q.itPriority,
        categoryId: q.categoryId,
        owner: q.owner === null ? null : q.owner.kind === "user" ? String(q.owner.id) : q.owner.kind,
      },
    });
  } catch {
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Something went wrong. Please try again." });
  }
});

// The list offered by the Queue's Owner filter now and by claim/reassign in
// Issue 66 (BR-17: only active IT Staff can own a Ticket).
staffQueueRouter.get("/api/staff/assignable-users", ...readers, async (_req: Request, res: Response) => {
  try {
    const users = await getPrisma().user.findMany({
      where: { role: "IT_STAFF", isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    });
    res.status(200).json(users);
  } catch {
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Something went wrong. Please try again." });
  }
});
