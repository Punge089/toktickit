const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface TicketDetailAttachment {
  id: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  removedAt: string | null;
  removalReason: string | null;
}

export interface TicketDetail {
  id: number;
  ticketNumber: string;
  requesterId: number;
  requesterName: string;
  summary: string;
  description: string;
  categoryId: number;
  categoryName: string;
  relatedSystemId: number;
  relatedSystemName: string;
  requestedPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  itPriority: string | null;
  currentStatus: "NEW";
  createdAt: string;
  updatedAt: string;
  attachments: TicketDetailAttachment[];
}

// Thrown on 404 so the page can show "Ticket not found" without
// distinguishing "doesn't exist" from "not yours" (BR-10/BR-28).
export class TicketNotFoundError extends Error {}

// Issue 30 — GET /api/tickets/:id (api-spec.md §6).
export async function fetchTicketDetail(requesterId: number, ticketId: string): Promise<TicketDetail> {
  const res = await fetch(`${API_URL}/api/tickets/${ticketId}`, {
    headers: { "X-Dev-Requester-Id": String(requesterId) },
  });
  if (res.status === 404) {
    throw new TicketNotFoundError("Ticket not found.");
  }
  if (!res.ok) {
    throw new Error("Unable to load this ticket. Please try again.");
  }
  return res.json();
}
