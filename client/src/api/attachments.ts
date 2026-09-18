import { apiFetch } from "./http.js";

export interface AttachmentAddResult {
  id: number;
  ticketId: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return (body && typeof body.message === "string" && body.message) || fallback;
}

// Issue 31/64 — POST /api/tickets/:id/attachments (api-spec.md §7).
// Ownership now comes from the session (BR-03); no requesterId is sent.
export async function addAttachment(ticketId: number, file: File): Promise<AttachmentAddResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiFetch(`/api/tickets/${ticketId}/attachments`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Unable to add this attachment."));
  }
  return res.json();
}

// Issue 31/64 — DELETE /api/attachments/:id (api-spec.md §10).
export async function removeAttachment(
  attachmentId: number,
  removalReason: string,
): Promise<{ id: number; removedAt: string; removalReason: string }> {
  const res = await apiFetch(`/api/attachments/${attachmentId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ removalReason }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Unable to remove this attachment."));
  }
  return res.json();
}

// Issue 31/64 — GET /api/attachments/:id/download (api-spec.md §9). The
// endpoint is session-cookie-authenticated (credentials: "include"), so a
// plain <a href> still can't carry the cookie across origins reliably —
// fetch the bytes, then hand them to the browser as a download via a
// throwaway object URL, same as Lab 2.
export async function downloadAttachment(attachmentId: number, filename: string): Promise<void> {
  const res = await apiFetch(`/api/attachments/${attachmentId}/download`);
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Unable to download this attachment."));
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
