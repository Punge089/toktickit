const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

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

// Issue 31 — POST /api/tickets/:id/attachments (api-spec.md §7).
export async function addAttachment(
  requesterId: number,
  ticketId: number,
  file: File,
): Promise<AttachmentAddResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments`, {
    method: "POST",
    headers: { "X-Dev-Requester-Id": String(requesterId) },
    body: formData,
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Unable to add this attachment."));
  }
  return res.json();
}

// Issue 31 — DELETE /api/attachments/:id (api-spec.md §10).
export async function removeAttachment(
  requesterId: number,
  attachmentId: number,
  removalReason: string,
): Promise<{ id: number; removedAt: string; removalReason: string }> {
  const res = await fetch(`${API_URL}/api/attachments/${attachmentId}`, {
    method: "DELETE",
    headers: {
      "X-Dev-Requester-Id": String(requesterId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ removalReason }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Unable to remove this attachment."));
  }
  return res.json();
}

// Issue 31 — GET /api/attachments/:id/download (api-spec.md §9). The
// endpoint is header-authenticated, so a plain <a href> can't carry
// X-Dev-Requester-Id — fetch the bytes, then hand them to the browser as a
// download via a throwaway object URL.
export async function downloadAttachment(
  requesterId: number,
  attachmentId: number,
  filename: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/attachments/${attachmentId}/download`, {
    headers: { "X-Dev-Requester-Id": String(requesterId) },
  });
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
