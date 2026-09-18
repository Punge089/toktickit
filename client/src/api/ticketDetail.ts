import { apiFetch } from "./http.js";
import { TicketStatus } from "../components/ui/Badge.js";

export interface TicketDetailAttachment {
  id: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedByName: string;
  removedAt: string | null;
  removedByName: string | null;
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
  itPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  currentStatus: TicketStatus;
  createdAt: string;
  updatedAt: string;
  attachments: TicketDetailAttachment[];
}

// Thrown on 404 so the page can show "Ticket not found" without
// distinguishing "doesn't exist" from "not yours" (BR-10/BR-28).
export class TicketNotFoundError extends Error {}

// Issue 30/64 — GET /api/tickets/:id (api-spec.md §6). Ownership now
// comes from the session (BR-03); no requesterId is sent.
export async function fetchTicketDetail(ticketId: string): Promise<TicketDetail> {
  const res = await apiFetch(`/api/tickets/${ticketId}`);
  if (res.status === 404) {
    throw new TicketNotFoundError("Ticket not found.");
  }
  if (!res.ok) {
    throw new Error("Unable to load this ticket. Please try again.");
  }
  return res.json();
}
