// Issue 27 — client-side mirror of server/src/lib/attachmentRules.ts
// (BR-20/BR-21). Rejects an obviously invalid file before it is ever sent,
// per AC-07; the backend re-checks everything regardless (BR-17).
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ACTIVE_ATTACHMENTS = 5;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

export function checkAttachmentFile(file: File): { ok: true } | { ok: false; message: string } {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, message: `${file.name} exceeds the 5MB limit.` };
  }

  const lowerName = file.name.toLowerCase();
  const hasAllowedExtension = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const hasAllowedType = ALLOWED_TYPES.includes(file.type);

  if (!hasAllowedExtension || !hasAllowedType) {
    return { ok: false, message: `${file.name} is not a permitted file type (JPG, PNG, WEBP, or PDF only).` };
  }

  return { ok: true };
}
