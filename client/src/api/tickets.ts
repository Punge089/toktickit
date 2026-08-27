const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

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
  requesterId: number;
  summary: string;
  description: string;
  categoryId: string;
  relatedSystemId: string;
  requestedPriority: string;
  files: File[];
}

// Issue 27 — POST /api/tickets (api-spec.md §4). multipart/form-data with
// the Requester identity on X-Dev-Requester-Id, per api-spec.md §0.
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

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets`, {
      method: "POST",
      headers: { "X-Dev-Requester-Id": String(input.requesterId) },
      body: formData,
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API. Please try again.");
  }

  if (res.status === 400) {
    const body = await res.json().catch(() => ({}));
    throw new ValidationError(body.fieldErrors ?? {});
  }

  if (!res.ok) {
    throw new Error("Unable to create the ticket. Please try again.");
  }

  return res.json();
}
