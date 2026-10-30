import { apiFetch } from "./http.js";
import { TicketStatus } from "../components/ui/Badge.js";
import { TicketDetailAttachment } from "./ticketDetail.js";
import { Priority } from "./staffQueue.js";

export type ResolutionBlocker = "OPEN_ACTIONS" | "NO_COMPLETED_ACTION";

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
  // Lab 4: the concurrency token every owner, priority and status change sends
  // back (BR-17), the Action tally, and why Resolved is not available yet.
  version: number;
  actionCounts: { open: number; completed: number; cancelled: number };
  resolutionBlockers: ResolutionBlocker[];
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
// 409 STALE_VERSION: somebody else changed the Ticket since it was loaded.
export class StaleVersionError extends Error {}
// 409 RESOLUTION_BLOCKED: open or missing Completed Actions (BR-20).
export class ResolutionBlockedError extends Error {
  blockers: ResolutionBlocker[];
  constructor(message: string, blockers: ResolutionBlocker[]) {
    super(message);
    this.blockers = blockers;
  }
}
export class OperationValidationError extends Error {
  fieldErrors: Record<string, string>;
  constructor(message: string, fieldErrors: Record<string, string>) {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}

// Issue 66 - GET /api/staff/tickets/:id (api-spec.md section 9).
export async function fetchStaffTicket(id: string): Promise<StaffTicketDetail> {
  const res = await apiFetch(`/api/staff/tickets/${id}`);
  if (res.status === 404) throw new StaffTicketNotFoundError("Ticket not found.");
  if (res.status === 403) throw new StaffForbiddenError("Forbidden");
  if (!res.ok) throw new Error("Unable to load this ticket. Please try again.");
  return res.json();
}

async function patch(ticketId: number, path: string, payload: Record<string, unknown>, expectedVersion: number): Promise<StaffTicketDetail> {
  const res = await apiFetch(`/api/staff/tickets/${ticketId}/${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, expectedVersion }),
  });
  if (res.status === 400) {
    const body = await res.json().catch(() => ({}));
    throw new OperationValidationError(body.message ?? "Fix the highlighted fields.", body.fieldErrors ?? {});
  }
  if (res.status === 409) {
    const body = await res.json().catch(() => null);
    const message = (body && typeof body.message === "string" && body.message) || "That change isn't allowed right now.";
    if (body?.error === "STALE_VERSION") throw new StaleVersionError(message);
    if (body?.error === "RESOLUTION_BLOCKED") {
      throw new ResolutionBlockedError(message, Array.isArray(body.blockers) ? body.blockers : []);
    }
    throw new OperationRejectedError(message);
  }
  if (res.status === 404) throw new StaffTicketNotFoundError("Ticket not found.");
  if (!res.ok) throw new Error("Unable to save this change. Please try again.");
  return res.json();
}

// api-spec.md section 11-13, each with the Ticket version last seen (Lab 4 §4)
export const updateOwner = (ticketId: number, ownerId: number | null, expectedVersion: number) =>
  patch(ticketId, "owner", { ownerId }, expectedVersion);
export const updateItPriority = (ticketId: number, itPriority: Priority, expectedVersion: number) =>
  patch(ticketId, "it-priority", { itPriority }, expectedVersion);
export const updateStatus = (ticketId: number, status: TicketStatus, expectedVersion: number, resolutionSummary?: string) =>
  patch(ticketId, "status", { status, ...(resolutionSummary !== undefined ? { resolutionSummary } : {}) }, expectedVersion);
