import { describe, it, expect } from "vitest";
import {
  TICKET_STATUSES,
  allowedTransitions,
  canTransition,
  isTerminal,
  requiresOwner,
  requesterMayIndicateResolved,
} from "../../src/lib/transitions.js";

// docs/lab-03/tests.md UNIT-03 — specification.md §5 Status Transition Matrix.
// The expected table below is written out independently of the
// implementation so a typo in either one fails the test.
const EXPECTED: Record<string, string[]> = {
  NEW: ["OPEN", "IN_PROGRESS", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  CLOSED: [],
  CANCELLED: [],
};

describe("status transition matrix (UNIT-03)", () => {
  it("has exactly the 8 required statuses", () => {
    expect([...TICKET_STATUSES].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it("allows exactly the listed transitions and rejects every other pair, including same-status", () => {
    for (const from of TICKET_STATUSES) {
      for (const to of TICKET_STATUSES) {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(EXPECTED[from].includes(to));
      }
      expect([...allowedTransitions(from)].sort()).toEqual([...EXPECTED[from]].sort());
    }
  });

  it("treats only Closed and Cancelled as terminal", () => {
    expect(TICKET_STATUSES.filter(isTerminal).sort()).toEqual(["CANCELLED", "CLOSED"]);
  });

  it("requires an owner to move to In Progress, Waiting for Requester, or Resolved only", () => {
    expect(TICKET_STATUSES.filter(requiresOwner).sort()).toEqual(["IN_PROGRESS", "RESOLVED", "WAITING_FOR_REQUESTER"]);
  });

  it("lets a Requester indicate resolution only while the Ticket is still active", () => {
    expect(TICKET_STATUSES.filter(requesterMayIndicateResolved).sort()).toEqual([
      "IN_PROGRESS",
      "NEW",
      "OPEN",
      "REOPENED",
      "WAITING_FOR_REQUESTER",
    ]);
  });
});
