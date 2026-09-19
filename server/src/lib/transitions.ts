// Issue 66 — the Status Transition Matrix (docs/lab-03/specification.md §5,
// BR-19..BR-23). One source of truth: the API enforces it, and detail
// responses return `allowedTransitions` so the UI never re-implements it.
export const TICKET_STATUSES = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
] as const;
export type TicketStatusValue = (typeof TICKET_STATUSES)[number];

const TRANSITIONS: Record<TicketStatusValue, readonly TicketStatusValue[]> = {
  NEW: ["OPEN", "IN_PROGRESS", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  CLOSED: [],
  CANCELLED: [],
};

// BR-20: active work needs an owner first.
const OWNER_REQUIRED_TARGETS: readonly TicketStatusValue[] = ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED"];

export function isTicketStatus(value: unknown): value is TicketStatusValue {
  return typeof value === "string" && (TICKET_STATUSES as readonly string[]).includes(value);
}

export function allowedTransitions(from: TicketStatusValue): readonly TicketStatusValue[] {
  return TRANSITIONS[from];
}

export function canTransition(from: TicketStatusValue, to: TicketStatusValue): boolean {
  return TRANSITIONS[from].includes(to);
}

// BR-22: Closed and Cancelled accept no further change of any kind.
export function isTerminal(status: TicketStatusValue): boolean {
  return TRANSITIONS[status].length === 0;
}

export function requiresOwner(to: TicketStatusValue): boolean {
  return OWNER_REQUIRED_TARGETS.includes(to);
}

// BR-05/AC-21: statuses in which a Requester may say "problem appears resolved".
export function requesterMayIndicateResolved(status: TicketStatusValue): boolean {
  return ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"].includes(status);
}
