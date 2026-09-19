import { apiFetch } from "./http.js";
import { TicketStatus } from "../components/ui/Badge.js";
import { TicketDetailAttachment } from "./ticketDetail.js";
import { Priority } from "./staffQueue.js";

export interface StaffTicketDetail {
  id: number;
  ticketNumber: string;
  requesterId: number;
  requesterName: string;
  summary: string;
  description: string;
  categoryName: string;
  relatedSystemName: string;
  requestedPriority: Priority;
  itPriority: Priority;
  currentStatus: TicketStatus;
  allowedTransitions: TicketStatus[];
  ownerId: number | null;
  ownerName: string | null;
  ownerIsActive: boolean | null;
  resolutionSummary: string | null;
  requesterResolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: TicketDetailAttachment[];
}

export class StaffTicketNotFoundError extends Error {}
export class StaffForbiddenError extends Error {}
// A 409 with a safe, displayable reason (invalid transition, owner required, ...).
export class OperationRejectedError extends Error {}
export class OperationValidationError extends Error {
  fieldErrors: Record<string, string>;
  constructor(message: string, fieldErrors: Record<string, string>) {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}

async function readMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return (body && typeof body.message === "string" && body.message) || fallback;
}

// Issue 66 - GET /api/staff/tickets/:id (api-spec.md section 9).
export async function fetchStaffTicket(id: string): Promise<StaffTicketDetail> {
  const res = await apiFetch(`/api/staff/tickets/${id}`);
  if (res.status === 404) throw new StaffTicketNotFoundError("Ticket not found.");
  if (res.status === 403) throw new StaffForbiddenError("Forbidden");
  if (!res.ok) throw new Error("Unable to load this ticket. Please try again.");
  return res.json();
}

async function patch(ticketId: number, path: string, payload: unknown): Promise<StaffTicketDetail> {
  const res = await apiFetch(`/api/staff/tickets/${ticketId}/${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 400) {
    const body = await res.json().catch(() => ({}));
    throw new OperationValidationError(body.message ?? "Fix the highlighted fields.", body.fieldErrors ?? {});
  }
  if (res.status === 409) throw new OperationRejectedError(await readMessage(res, "That change isn't allowed right now."));
  if (res.status === 404) throw new StaffTicketNotFoundError("Ticket not found.");
  if (!res.ok) throw new Error("Unable to save this change. Please try again.");
  return res.json();
}

// api-spec.md section 11-13
export const updateOwner = (ticketId: number, ownerId: number | null) => patch(ticketId, "owner", { ownerId });
export const updateItPriority = (ticketId: number, itPriority: Priority) => patch(ticketId, "it-priority", { itPriority });
export const updateStatus = (ticketId: number, status: TicketStatus, resolutionSummary?: string) =>
  patch(ticketId, "status", { status, ...(resolutionSummary !== undefined ? { resolutionSummary } : {}) });
