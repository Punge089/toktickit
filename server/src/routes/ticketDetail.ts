import { Router, Request, Response } from "express";
import { getPrisma } from "../prisma.js";
import { requesterAuth } from "../middleware/requesterAuth.js";

// Issue 30 — GET /api/tickets/:id (api-spec.md §6). BR-10/BR-28: a ticket
// that doesn't exist and a ticket that exists but belongs to someone else
// return the identical 404 body, so ownership can never be probed.
export const ticketDetailRouter = Router();

const NOT_FOUND = { error: "TICKET_NOT_FOUND", message: "Ticket not found." };

ticketDetailRouter.get("/api/tickets/:id", requesterAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json(NOT_FOUND);
    return;
  }

  try {
    const ticket = await getPrisma().ticket.findFirst({
      where: { id, requesterId: req.requester!.id },
      include: {
        requester: { select: { fullName: true } },
        category: { select: { name: true } },
        relatedSystem: { select: { name: true } },
        attachments: {
          orderBy: { uploadedAt: "asc" },
          include: {
            uploadedBy: { select: { fullName: true } },
            removedBy: { select: { fullName: true } },
          },
        },
      },
    });

    if (!ticket) {
      res.status(404).json(NOT_FOUND);
      return;
    }

    res.status(200).json({
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
    });
  } catch {
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Something went wrong. Please try again." });
  }
});
