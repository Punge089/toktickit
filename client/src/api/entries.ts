import { apiFetch } from "./http.js";
import { Role } from "./auth.js";

// Issue 66 - Public Comments and Internal Notes share one shape
// (docs/lab-03/api-spec.md section 7, 14).
export interface Entry {
  id: number;
  authorId: number;
  authorName: string;
  authorRole: Role;
  body: string;
  createdAt: string;
}

export class EntryValidationError extends Error {}
export class TicketClosedError extends Error {}

async function readMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return (body && typeof body.message === "string" && body.message) || fallback;
}

async function list(path: string, fallback: string): Promise<Entry[]> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(fallback);
  return res.json();
}

async function post(path: string, body: string, fallback: string): Promise<Entry> {
  const res = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (res.status === 400) throw new EntryValidationError(await readMessage(res, "Text is not valid."));
  if (res.status === 409) throw new TicketClosedError(await readMessage(res, "This ticket is closed."));
  if (!res.ok) throw new Error(fallback);
  return res.json();
}

export const fetchComments = (ticketId: number) => list(`/api/tickets/${ticketId}/comments`, "Unable to load comments.");
export const postComment = (ticketId: number, body: string) =>
  post(`/api/tickets/${ticketId}/comments`, body, "Unable to post your comment. Please try again.");

export const fetchNotes = (ticketId: number) => list(`/api/staff/tickets/${ticketId}/notes`, "Unable to load internal notes.");
export const postNote = (ticketId: number, body: string) =>
  post(`/api/staff/tickets/${ticketId}/notes`, body, "Unable to save your note. Please try again.");

// api-spec.md section 6 - the Requester's opinion; never changes the status.
export async function markProblemResolved(ticketId: number): Promise<void> {
  const res = await apiFetch(`/api/tickets/${ticketId}/problem-resolved`, { method: "POST" });
  if (res.status === 409) throw new TicketClosedError(await readMessage(res, "This ticket can't be marked resolved right now."));
  if (!res.ok) throw new Error("Unable to send this. Please try again.");
}
