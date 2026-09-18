import { apiFetch } from "./http.js";

export interface CreateTicketResult {
  id: number;
  ticketNumber: string;
  requesterId: number;
  summary: string;
  description: string;
  categoryId: number;
  relatedSystemId: number;
  requestedPriority: string;
  itPriority: string | null;
  currentStatus: string;
  createdAt: string;
  updatedAt: string;
  attachments: { id: number; originalFilename: string }[];
  attachmentErrors: { originalFilename: string; reason: string; message: string }[];
}

// Thrown on a 400 VALIDATION_FAILED response so callers can tell "your
// input was rejected" apart from "the request itself failed" (BR-17/AC-04).
export class ValidationError extends Error {
  fieldErrors: Record<string, string>;
  constructor(fieldErrors: Record<string, string>) {
    super("Validation failed");
    this.fieldErrors = fieldErrors;
  }
}

export interface CreateTicketInput {
  summary: string;
  description: string;
  categoryId: string;
  relatedSystemId: string;
  requestedPriority: string;
  files: File[];
}

// Issue 27/64 — POST /api/tickets (api-spec.md §4). multipart/form-data;
// the Requester identity comes from the session (BR-03), not a header.
export async function createTicket(input: CreateTicketInput): Promise<CreateTicketResult> {
  const formData = new FormData();
  formData.append("summary", input.summary);
  formData.append("description", input.description);
  formData.append("categoryId", input.categoryId);
  formData.append("relatedSystemId", input.relatedSystemId);
  formData.append("requestedPriority", input.requestedPriority);
  for (const file of input.files) {
    formData.append("attachments", file);
  }

  const res = await apiFetch("/api/tickets", { method: "POST", body: formData });

  if (res.status === 400) {
    const body = await res.json().catch(() => ({}));
    throw new ValidationError(body.fieldErrors ?? {});
  }

  if (!res.ok) {
    throw new Error("Unable to create the ticket. Please try again.");
  }

  return res.json();
}
