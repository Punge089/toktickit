// Lab 4 — Issue 81: pure workflow rules added on top of the Lab 3 matrix in
// transitions.ts (docs/lab-04/specification.md BR-20, BR-28). No database
// here, so the gate is unit tested on its own (tests/lab-04/workflow-rules.unit.test.ts).

// BR-28: the statuses in which a Ticket is still being worked. The dashboard
// counts, the `active=true` list filter and the "Actions can be recorded"
// rule (BR-12) all use this one list, so they can never disagree.
export const ACTIVE_TICKET_STATUSES = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] as const;

export function isActiveStatus(status: string): boolean {
  return (ACTIVE_TICKET_STATUSES as readonly string[]).includes(status);
}

export type ResolutionBlocker = "OPEN_ACTIONS" | "NO_COMPLETED_ACTION";

interface ActionLike {
  id: number;
  actionStatus: string;
}

export interface ResolutionCheck {
  blockers: ResolutionBlocker[];
  openActionIds: number[];
}

// BR-20 (b) and (c): none of the Actions may be Planned or In Progress, and at
// least one must be Completed. Follow-Up Required never blocks. Owner and
// Resolution Summary (BR-20 (a)) are checked by the route, not here.
export function checkResolutionGate(actions: readonly ActionLike[]): ResolutionCheck {
  const open = actions.filter((a) => a.actionStatus === "PLANNED" || a.actionStatus === "IN_PROGRESS");
  const blockers: ResolutionBlocker[] = [];
  if (open.length > 0) blockers.push("OPEN_ACTIONS");
  if (!actions.some((a) => a.actionStatus === "COMPLETED")) blockers.push("NO_COMPLETED_ACTION");
  return { blockers, openActionIds: open.map((a) => a.id) };
}

// BR-22: the text written into the Result of an open Action that is cancelled
// because its Ticket was cancelled, when the Result was still empty.
export const AUTO_CANCEL_RESULT = "Cancelled automatically because the Ticket was cancelled.";
