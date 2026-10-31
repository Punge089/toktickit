import { apiFetch } from "./http.js";

// Lab 4 - Issue 82: Actions Taken (docs/lab-04/api-spec.md section 1 to 3).
export type ActionStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface ActionPerson {
  id: number;
  fullName: string;
  isActive: boolean;
}

export interface ActionItem {
  id: number;
  ticketId: number;
  actionAt: string;
  description: string;
  result: string | null;
  performedBy: ActionPerson;
  assignee: ActionPerson;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  actionStatus: ActionStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActionsResult {
  items: ActionItem[];
  counts: { open: number; completed: number; cancelled: number };
}

// The body of an Action create or update, as the form builds it.
export interface ActionPayload {
  actionAt?: string;
  description?: string;
  result?: string;
  assigneeId?: number;
  followUpRequired?: boolean;
  followUpNote?: string;
  attachmentNotes?: string;
  actionStatus?: ActionStatus;
}

// 400: each failing field is named, so the form can show it under the field.
export class ActionValidationError extends Error {
  fieldErrors: Record<string, string>;
  constructor(message: string, fieldErrors: Record<string, string>) {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}
// 409 INVALID_ASSIGNEE: the chosen person is not an active IT Staff user.
export class InvalidAssigneeError extends Error {}
// 409 STALE_VERSION: somebody else changed the Action first.
export class ActionStaleError extends Error {}
// 409 ACTION_LOCKED / ACTIONS_LOCKED / INVALID_ACTION_TRANSITION / DUPLICATE_REQUEST_KEY: a safe reason to show.
export class ActionLockedError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
export class ActionsNotFoundError extends Error {}
export class ActionsForbiddenError extends Error {}

// GET /api/tickets/:id/actions - the same route serves Requester (own Ticket), IT Staff and Administrator.
export async function fetchActions(ticketId: number): Promise<ActionsResult> {
  const res = await apiFetch(`/api/tickets/${ticketId}/actions`);
  if (res.status === 404) throw new ActionsNotFoundError("Ticket not found.");
  if (res.status === 403) throw new ActionsForbiddenError("You do not have access to these actions.");
  if (!res.ok) throw new Error("Unable to load actions. Please try again.");
  return res.json();
}

async function send(path: string, method: "POST" | "PATCH", payload: unknown): Promise<ActionItem> {
  const res = await apiFetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.ok) return res.json();

  const body = await res.json().catch(() => null);
  const message = (body && typeof body.message === "string" && body.message) || "Unable to save this action. Please try again.";
  if (res.status === 400) throw new ActionValidationError(message, (body && body.fieldErrors) || {});
  if (res.status === 409) {
    if (body?.error === "INVALID_ASSIGNEE") throw new InvalidAssigneeError(message);
    if (body?.error === "STALE_VERSION") throw new ActionStaleError(message);
    throw new ActionLockedError(body?.error ?? "CONFLICT", message);
  }
  if (res.status === 404) throw new ActionsNotFoundError(message);
  if (res.status === 403) throw new ActionsForbiddenError("You do not have access to change actions.");
  throw new Error("Unable to save this action. Please try again.");
}

// POST /api/staff/tickets/:id/actions. `clientRequestId` is generated when the form opens and reused
// for any retry of that same form, so a retried request creates one Action only (BR-18).
export const createAction = (ticketId: number, clientRequestId: string, payload: ActionPayload) =>
  send(`/api/staff/tickets/${ticketId}/actions`, "POST", { clientRequestId, ...payload });

// PATCH /api/staff/tickets/:id/actions/:actionId with the version last seen (BR-16).
export const updateAction = (ticketId: number, actionId: number, expectedVersion: number, payload: ActionPayload) =>
  send(`/api/staff/tickets/${ticketId}/actions/${actionId}`, "PATCH", { expectedVersion, ...payload });

export function newClientRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
