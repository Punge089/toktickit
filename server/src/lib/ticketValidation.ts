// Issue 26 — BR-14/BR-15 field validation for POST /api/tickets.
// Returns a fieldErrors map (empty if valid) so the route handler can build
// the api-spec.md §4 VALIDATION_FAILED response directly from it.
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface CreateTicketInput {
  summary?: unknown;
  description?: unknown;
  categoryId?: unknown;
  relatedSystemId?: unknown;
  requestedPriority?: unknown;
}

export interface ValidatedCreateTicket {
  summary: string;
  description: string;
  categoryId: number;
  relatedSystemId: number;
  requestedPriority: Priority;
}

interface ValidationResult {
  ok: boolean;
  fieldErrors: Record<string, string>;
  value?: ValidatedCreateTicket;
}

function toPositiveInt(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
}

export function validateCreateTicketInput(input: CreateTicketInput): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const summary = typeof input.summary === "string" ? input.summary.trim() : "";
  if (summary.length < 5 || summary.length > 120) {
    fieldErrors.summary = "Summary must be 5-120 characters.";
  }

  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (description.length < 20 || description.length > 4000) {
    fieldErrors.description = "Description must be 20-4000 characters.";
  }

  const categoryId = toPositiveInt(input.categoryId);
  if (categoryId === null) {
    fieldErrors.categoryId = "Select a category.";
  }

  const relatedSystemId = toPositiveInt(input.relatedSystemId);
  if (relatedSystemId === null) {
    fieldErrors.relatedSystemId = "Select a related system.";
  }

  const requestedPriority =
    typeof input.requestedPriority === "string" &&
    (PRIORITIES as readonly string[]).includes(input.requestedPriority)
      ? (input.requestedPriority as Priority)
      : null;
  if (requestedPriority === null) {
    fieldErrors.requestedPriority = "Select a requested priority.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    fieldErrors: {},
    value: {
      summary,
      description,
      categoryId: categoryId!,
      relatedSystemId: relatedSystemId!,
      requestedPriority: requestedPriority!,
    },
  };
}
