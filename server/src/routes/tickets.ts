import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { getPrisma } from "../prisma.js";
import { requesterAuth } from "../middleware/requesterAuth.js";
import { validateCreateTicketInput } from "../lib/ticketValidation.js";
import { nextTicketNumber } from "../lib/ticketNumber.js";
import { checkAttachmentFile, generateStoredFilename, MAX_ATTACHMENT_BYTES } from "../lib/attachmentRules.js";
import { saveAttachmentFile } from "../lib/attachmentStorage.js";

// Issue 26 — POST /api/tickets (api-spec.md §4). multipart/form-data because
// it optionally carries files in the same request as the initial submission
// — the one endpoint in the contract that isn't plain JSON.
export const ticketsRouter = Router();

// A generous safety-net ceiling against abuse; the real 5MB-per-file rule
// (BR-21) is enforced per-file below so one oversized file doesn't abort
// the whole request (BR-19 — the Ticket must still be created).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES * 4, files: 5 },
});

function parseAttachments(req: Request, res: Response, next: NextFunction) {
  upload.array("attachments", 5)(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: "UPLOAD_FAILED", message: "Could not process the uploaded files." });
      return;
    }
    next();
  });
}

ticketsRouter.post(
  "/api/tickets",
  requesterAuth,
  parseAttachments,
  async (req: Request, res: Response) => {
    const validation = validateCreateTicketInput(req.body);
    if (!validation.ok) {
      res.status(400).json({
        error: "VALIDATION_FAILED",
        message: "Fix the highlighted fields.",
        fieldErrors: validation.fieldErrors,
      });
      return;
    }

    const { summary, description, categoryId, relatedSystemId, requestedPriority } = validation.value!;

    // BR-15 — the referenced Category/RelatedSystem must exist and be active.
    const [category, relatedSystem] = await Promise.all([
      getPrisma().category.findFirst({ where: { id: categoryId, isActive: true } }),
      getPrisma().relatedSystem.findFirst({ where: { id: relatedSystemId, isActive: true } }),
    ]);
    const fieldErrors: Record<string, string> = {};
    if (!category) fieldErrors.categoryId = "Select a valid, active category.";
    if (!relatedSystem) fieldErrors.relatedSystemId = "Select a valid, active related system.";
    if (Object.keys(fieldErrors).length > 0) {
      res
        .status(400)
        .json({ error: "VALIDATION_FAILED", message: "Fix the highlighted fields.", fieldErrors });
      return;
    }

    try {
      const prisma = getPrisma();

      // BR-01 — Ticket Number generated inside the same transaction as the
      // insert, via the per-year TicketCounter row.
      const ticket = await prisma.$transaction(async (tx) => {
        const ticketNumber = await nextTicketNumber(tx);
        return tx.ticket.create({
          data: {
            ticketNumber,
            requesterId: req.requester!.id,
            categoryId,
            relatedSystemId,
            summary,
            description,
            requestedPriority,
          },
        });
      });

      // BR-19 — attachment failures never roll back an already-created
      // Ticket; each file succeeds or fails independently.
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const attachments: { id: number; originalFilename: string }[] = [];
      const attachmentErrors: { originalFilename: string; reason: string; message: string }[] = [];

      for (const file of files) {
        const check = checkAttachmentFile(file.originalname, file.mimetype, file.size);
        if (!check.ok) {
          attachmentErrors.push({
            originalFilename: file.originalname,
            reason: check.reason,
            message: check.message,
          });
          continue;
        }

        const storedFilename = generateStoredFilename(file.originalname);
        try {
          await saveAttachmentFile(storedFilename, file.buffer);
          const attachment = await prisma.attachment.create({
            data: {
              ticketId: ticket.id,
              originalFilename: file.originalname,
              storedFilename,
              mimeType: file.mimetype,
              sizeBytes: file.size,
              uploadedById: req.requester!.id,
            },
          });
          attachments.push({ id: attachment.id, originalFilename: attachment.originalFilename });
        } catch {
          attachmentErrors.push({
            originalFilename: file.originalname,
            reason: "SAVE_FAILED",
            message: "Could not save this file. You can add it again from Ticket Detail.",
          });
        }
      }

      res.status(201).json({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        requesterId: ticket.requesterId,
        summary: ticket.summary,
        description: ticket.description,
        categoryId: ticket.categoryId,
        relatedSystemId: ticket.relatedSystemId,
        requestedPriority: ticket.requestedPriority,
        itPriority: ticket.itPriority,
        currentStatus: ticket.currentStatus,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        attachments,
        attachmentErrors,
      });
    } catch {
      res.status(500).json({ error: "INTERNAL_ERROR", message: "Something went wrong. Please try again." });
    }
  },
);
