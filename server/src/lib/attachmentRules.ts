import { randomUUID } from "node:crypto";
import path from "node:path";

// Issue 26/31 — BR-20/BR-21/BR-25. Shared by Create Ticket's inline
// attachment handling (Issue 26) and the standalone attachment endpoints
// (Issue 31), so the rule is defined exactly once.
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ACTIVE_ATTACHMENTS = 5;

// Both the extension AND the mimetype must match — either one alone can be
// spoofed by renaming a file or forging a Content-Type header.
const ALLOWED: Record<string, string[]> = {
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".webp": ["image/webp"],
  ".pdf": ["application/pdf"],
};

export type AttachmentRejectReason = "TYPE" | "SIZE";

export function checkAttachmentFile(
  originalname: string,
  mimetype: string,
  sizeBytes: number,
): { ok: true } | { ok: false; reason: AttachmentRejectReason; message: string } {
  if (sizeBytes > MAX_ATTACHMENT_BYTES) {
    return { ok: false, reason: "SIZE", message: `File exceeds the ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB limit.` };
  }

  const ext = path.extname(originalname).toLowerCase();
  const allowedMimes = ALLOWED[ext];
  if (!allowedMimes || !allowedMimes.includes(mimetype)) {
    return {
      ok: false,
      reason: "TYPE",
      message: "Only JPG, JPEG, PNG, WEBP, and PDF files are allowed.",
    };
  }

  return { ok: true };
}

// BR-25 — the stored filename is a generated UUID plus the validated
// extension; the Requester-supplied original filename is display metadata
// only and is never used to build a filesystem path.
export function generateStoredFilename(originalname: string): string {
  const ext = path.extname(originalname).toLowerCase();
  return `${randomUUID()}${ext}`;
}
