import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { getPrisma } from "../prisma.js";
import { requesterAuth } from "../middleware/requesterAuth.js";
import {
  checkAttachmentFile,
  generateStoredFilename,
  MAX_ACTIVE_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
} from "../lib/attachmentRules.js";
import { saveAttachmentFile, attachmentFilePath } from "../lib/attachmentStorage.js";

// Issue 31 — attachment lifecycle (api-spec.md §7-10): add, metadata,
// download, and soft-remove. Reuses the same type/size rules and storage
// helpers Issue 26 introduced for Create Ticket's inline attachments.
export const attachmentsRouter = Router();

const TICKET_NOT_FOUND = { error: "TICKET_NOT_FOUND", message: "Ticket not found." };
const ATTACHMENT_NOT_FOUND = { error: "ATTACHMENT_NOT_FOUND", message: "Attachment not found." };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES * 4, files: 1 },
});

function parseSingleFile(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: "UPLOAD_FAILED", message: "Could not process the uploaded file." });
      return;
    }
    next();
  });
}

async function findOwnedAttachment(attachmentId: number, requesterId: number) {
  return getPrisma().attachment.findFirst({
    where: { id: attachmentId, ticket: { requesterId } },
    include: {
      uploadedBy: { select: { fullName: true } },
      removedBy: { select: { fullName: true } },
    },
  });
}

// BR-23 requires a removed Attachment to keep showing filename, size,
// uploader, removal reason and removal time, so the uploader/remover names
// travel with the metadata rather than only their ids.
function attachmentMetadata(a: {
  id: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  uploadedBy: { fullName: string };
  removedAt: Date | null;
  removedBy: { fullName: string } | null;
  removalReason: string | null;
}) {
  return {
    id: a.id,
    originalFilename: a.originalFilename,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    uploadedAt: a.uploadedAt,
    uploadedByName: a.uploadedBy.fullName,
    removedAt: a.removedAt,
    removedByName: a.removedBy?.fullName ?? null,
    removalReason: a.removalReason,
  };
}

// §7 — POST /api/tickets/:id/attachments
attachmentsRouter.post(
  "/api/tickets/:id/attachments",
  requesterAuth,
  parseSingleFile,
  async (req: Request, res: Response) => {
    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      res.status(404).json(TICKET_NOT_FOUND);
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "MISSING_FILE", message: "No file was included in the request." });
      return;
    }

    try {
      const prisma = getPrisma();
      const ticket = await prisma.ticket.findFirst({
        where: { id: ticketId, requesterId: req.requester!.id },
      });
      if (!ticket) {
        res.status(404).json(TICKET_NOT_FOUND);
        return;
      }

      const activeCount = await prisma.attachment.count({
        where: { ticketId: ticket.id, removedAt: null },
      });
      if (activeCount >= MAX_ACTIVE_ATTACHMENTS) {
        res.status(409).json({
          error: "ATTACHMENT_LIMIT_REACHED",
          message: `This ticket already has ${MAX_ACTIVE_ATTACHMENTS} active attachments.`,
        });
        return;
      }

      const check = checkAttachmentFile(file.originalname, file.mimetype, file.size);
      if (!check.ok) {
        const status = check.reason === "SIZE" ? 413 : 415;
        res.status(status).json({ error: `INVALID_ATTACHMENT_${check.reason}`, message: check.message });
        return;
      }

      const storedFilename = generateStoredFilename(file.originalname);
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

      res.status(201).json({
        id: attachment.id,
        ticketId: attachment.ticketId,
        originalFilename: attachment.originalFilename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        uploadedAt: attachment.uploadedAt,
      });
    } catch {
      res.status(500).json({ error: "INTERNAL_ERROR", message: "Something went wrong. Please try again." });
    }
  },
);

// §8 — GET /api/attachments/:id (metadata; active or removed — BR-23)
attachmentsRouter.get("/api/attachments/:id", requesterAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json(ATTACHMENT_NOT_FOUND);
    return;
  }
  try {
    const attachment = await findOwnedAttachment(id, req.requester!.id);
    if (!attachment) {
      res.status(404).json(ATTACHMENT_NOT_FOUND);
      return;
    }
    res.status(200).json(attachmentMetadata(attachment));
  } catch {
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Something went wrong. Please try again." });
  }
});

// §9 — GET /api/attachments/:id/download (active only — 410 if removed)
attachmentsRouter.get(
  "/api/attachments/:id/download",
  requesterAuth,
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(404).json(ATTACHMENT_NOT_FOUND);
      return;
    }
    try {
      const attachment = await findOwnedAttachment(id, req.requester!.id);
      if (!attachment) {
        res.status(404).json(ATTACHMENT_NOT_FOUND);
        return;
      }
      if (attachment.removedAt) {
        res.status(410).json({
          error: "ATTACHMENT_REMOVED",
          message: "This attachment has been removed and is no longer available.",
        });
        return;
      }

      res.set("Content-Type", attachment.mimeType);
      res.download(attachmentFilePath(attachment.storedFilename), attachment.originalFilename, (err) => {
        if (err && !res.headersSent) {
          res.status(500).json({ error: "INTERNAL_ERROR", message: "Something went wrong. Please try again." });
        }
      });
    } catch {
      if (!res.headersSent) {
        res.status(500).json({ error: "INTERNAL_ERROR", message: "Something went wrong. Please try again." });
      }
    }
  },
);

// §10 — DELETE /api/attachments/:id (soft removal)
attachmentsRouter.delete("/api/attachments/:id", requesterAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json(ATTACHMENT_NOT_FOUND);
    return;
  }

  const rawReason = req.body?.removalReason;
  const removalReason = typeof rawReason === "string" ? rawReason.trim() : "";
  if (removalReason.length < 5 || removalReason.length > 200) {
    res.status(400).json({
      error: "VALIDATION_FAILED",
      message: "removalReason must be 5-200 characters.",
      fieldErrors: { removalReason: "removalReason must be 5-200 characters." },
    });
    return;
  }

  try {
    const attachment = await findOwnedAttachment(id, req.requester!.id);
    if (!attachment) {
      res.status(404).json(ATTACHMENT_NOT_FOUND);
      return;
    }
    if (attachment.removedAt) {
      res.status(409).json({ error: "ALREADY_REMOVED", message: "This attachment was already removed." });
      return;
    }

    const updated = await getPrisma().attachment.update({
      where: { id: attachment.id },
      data: { removedAt: new Date(), removedById: req.requester!.id, removalReason },
    });

    res.status(200).json({
      id: updated.id,
      removedAt: updated.removedAt,
      removalReason: updated.removalReason,
    });
  } catch {
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Something went wrong. Please try again." });
  }
});
