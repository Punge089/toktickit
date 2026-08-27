import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { requesterAuth } from "../middleware/requesterAuth.js";
import { PRIORITIES } from "../lib/ticketValidation.js";

// Issue 28 — GET /api/tickets (api-spec.md §5). Every result is scoped to
// the requesting Requester (BR-09); search/filter/sort/pagination are all
// query-driven and every invalid value returns 400 naming the parameter
// (BR-13) rather than silently clamping or ignoring it.
export const myTicketsRouter = Router();

const SORT_FIELDS = ["createdAt", "updatedAt", "ticketNumber", "requestedPriority"] as const;
type SortField = (typeof SORT_FIELDS)[number];
const PAGE_SIZES = [10, 20, 50] as const;
const STATUSES = ["NEW"] as const; // only status reachable in Lab 2

function invalidQuery(res: Response, field: string, message: string) {
  res.status(400).json({ error: "INVALID_QUERY", message, fieldErrors: { [field]: message } });
}

function parsePositiveInt(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

myTicketsRouter.get("/api/tickets", requesterAuth, async (req: Request, res: Response) => {
  const q = req.query;
  const prisma = getPrisma();

  // pageSize — 10 | 20 | 50 only (BR-13)
  let pageSize = 10;
  if (q.pageSize !== undefined) {
    const n = Number(q.pageSize);
    if (!(PAGE_SIZES as readonly number[]).includes(n)) {
      invalidQuery(res, "pageSize", "pageSize must be 10, 20, or 50.");
      return;
    }
    pageSize = n;
  }

  // sort — field[:asc|desc], default createdAt:desc (BR-12)
  let sortField: SortField = "createdAt";
  let sortDir: "asc" | "desc" = "desc";
  if (q.sort !== undefined) {
    const [field, dir] = String(q.sort).split(":");
    if (!(SORT_FIELDS as readonly string[]).includes(field) || (dir && dir !== "asc" && dir !== "desc")) {
      invalidQuery(
        res,
        "sort",
        "sort must be one of createdAt, updatedAt, ticketNumber, requestedPriority, optionally suffixed :asc or :desc.",
      );
      return;
    }
    sortField = field as SortField;
    sortDir = (dir as "asc" | "desc") ?? "desc";
  }

  // filters — always scoped to the requesting Requester (BR-09)
  const where: Prisma.TicketWhereInput = { requesterId: req.requester!.id };
  const appliedFilters: Record<string, string | number | null> = {
    search: null,
    categoryId: null,
    relatedSystemId: null,
    requestedPriority: null,
    status: null,
  };

  if (q.search !== undefined) {
    const search = String(q.search);
    where.OR = [
      { ticketNumber: { contains: search, mode: "insensitive" } },
      { summary: { contains: search, mode: "insensitive" } },
    ];
    appliedFilters.search = search;
  }

  if (q.categoryId !== undefined) {
    const categoryId = parsePositiveInt(q.categoryId);
    if (categoryId === null) {
      invalidQuery(res, "categoryId", "categoryId must be a positive integer.");
      return;
    }
    where.categoryId = categoryId;
    appliedFilters.categoryId = categoryId;
  }

  if (q.relatedSystemId !== undefined) {
    const relatedSystemId = parsePositiveInt(q.relatedSystemId);
    if (relatedSystemId === null) {
      invalidQuery(res, "relatedSystemId", "relatedSystemId must be a positive integer.");
      return;
    }
    where.relatedSystemId = relatedSystemId;
    appliedFilters.relatedSystemId = relatedSystemId;
  }

  if (q.requestedPriority !== undefined) {
    const requestedPriority = String(q.requestedPriority);
    if (!(PRIORITIES as readonly string[]).includes(requestedPriority)) {
      invalidQuery(res, "requestedPriority", "requestedPriority must be one of LOW, MEDIUM, HIGH, URGENT.");
      return;
    }
    where.requestedPriority = requestedPriority as Prisma.TicketWhereInput["requestedPriority"];
    appliedFilters.requestedPriority = requestedPriority;
  }

  if (q.status !== undefined) {
    const status = String(q.status);
    if (!(STATUSES as readonly string[]).includes(status)) {
      invalidQuery(res, "status", "status must be NEW.");
      return;
    }
    where.currentStatus = status as Prisma.TicketWhereInput["currentStatus"];
    appliedFilters.status = status;
  }

  try {
    const totalItems = await prisma.ticket.count({ where });
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    // page — defaults to 1; anything beyond the real range is 400, not an
    // empty page (BR-13, AC-13)
    let page = 1;
    if (q.page !== undefined) {
      const n = parsePositiveInt(q.page);
      if (n === null) {
        invalidQuery(res, "page", "page must be a positive integer.");
        return;
      }
      if (n > totalPages) {
        invalidQuery(res, "page", `page must be between 1 and ${totalPages}.`);
        return;
      }
      page = n;
    }

    const tickets = await prisma.ticket.findMany({
      where,
      // Secondary sort by id:desc always applied (BR-12) so pagination stays
      // stable when the primary sort key has ties.
      orderBy: [{ [sortField]: sortDir } as Prisma.TicketOrderByWithRelationInput, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { category: { select: { name: true } } },
    });

    res.status(200).json({
      data: tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        summary: t.summary,
        categoryId: t.categoryId,
        categoryName: t.category.name,
        requestedPriority: t.requestedPriority,
        currentStatus: t.currentStatus,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      meta: {
        page,
        pageSize,
        totalItems,
        totalPages,
        sort: `${sortField}:${sortDir}`,
        appliedFilters,
      },
    });
  } catch {
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Something went wrong. Please try again." });
  }
});
