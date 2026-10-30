import { describe, it, expect } from "vitest";
import { TICKET_STATUSES, TicketStatusValue, allowedTransitions, canTransition } from "../../src/lib/transitions.js";
import { ACTIVE_TICKET_STATUSES, checkResolutionGate, isActiveStatus } from "../../src/lib/workflowRules.js";

// docs/lab-04/tests.md UNIT-03, UNIT-04, UNIT-05 - specification.md BR-19,
// BR-20, BR-28. Pure functions: no database, no network.
const action = (id: number, actionStatus: string) => ({ id, actionStatus });

describe("Resolution gate (UNIT-03)", () => {
  it("passes when no Action is open and at least one is Completed", () => {
    expect(checkResolutionGate([action(1, "COMPLETED")])).toEqual({ blockers: [], openActionIds: [] });
    expect(checkResolutionGate([action(1, "COMPLETED"), action(2, "CANCELLED"), action(3, "COMPLETED")]).blockers).toEqual([]);
  });

  it("reports OPEN_ACTIONS with the ids of every Planned and In Progress Action", () => {
    const r = checkResolutionGate([action(1, "COMPLETED"), action(2, "PLANNED"), action(3, "IN_PROGRESS"), action(4, "CANCELLED")]);
    expect(r.blockers).toEqual(["OPEN_ACTIONS"]);
    expect(r.openActionIds).toEqual([2, 3]);
  });

  it("reports NO_COMPLETED_ACTION when there are no Actions or only Cancelled ones", () => {
    expect(checkResolutionGate([])).toEqual({ blockers: ["NO_COMPLETED_ACTION"], openActionIds: [] });
    expect(checkResolutionGate([action(1, "CANCELLED"), action(2, "CANCELLED")]).blockers).toEqual(["NO_COMPLETED_ACTION"]);
  });

  it("reports both reasons when an Action is open and none is Completed", () => {
    const r = checkResolutionGate([action(7, "PLANNED"), action(8, "CANCELLED")]);
    expect(r.blockers).toEqual(["OPEN_ACTIONS", "NO_COMPLETED_ACTION"]);
    expect(r.openActionIds).toEqual([7]);
  });
});

describe("Final Ticket status matrix (UNIT-04)", () => {
  // Written out independently of src/lib/transitions.ts, in the documented
  // column order (specification §5): Open, In Progress, Waiting for Requester,
  // Resolved, Closed, Reopened, Cancelled.
  const COLUMN_ORDER: TicketStatusValue[] = ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];
  const TABLE: Record<TicketStatusValue, TicketStatusValue[]> = {
    NEW: ["OPEN", "IN_PROGRESS", "CANCELLED"],
    OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
    IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
    WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
    RESOLVED: ["CLOSED", "REOPENED"],
    REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
    CLOSED: [],
    CANCELLED: [],
  };

  it("allows exactly the pairs of the table, checked against all 64 (from, to) pairs", () => {
    for (const from of TICKET_STATUSES) {
      for (const to of TICKET_STATUSES) {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(TABLE[from].includes(to));
      }
    }
  });

  it("returns the allowed targets in the documented column order", () => {
    for (const from of TICKET_STATUSES) {
      const targets = [...allowedTransitions(from)];
      expect(targets, from).toEqual(TABLE[from]);
      const positions = targets.map((t) => COLUMN_ORDER.indexOf(t));
      expect(positions, `${from} is in column order`).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it("never moves out of Closed or Cancelled", () => {
    for (const to of TICKET_STATUSES) {
      expect(canTransition("CLOSED", to)).toBe(false);
      expect(canTransition("CANCELLED", to)).toBe(false);
    }
  });
});

describe("Active status set (UNIT-05)", () => {
  it("is exactly New, Open, In Progress, Waiting for Requester and Reopened", () => {
    expect([...ACTIVE_TICKET_STATUSES].sort()).toEqual(["IN_PROGRESS", "NEW", "OPEN", "REOPENED", "WAITING_FOR_REQUESTER"]);
    for (const s of TICKET_STATUSES) {
      expect(isActiveStatus(s), s).toBe(["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"].includes(s));
    }
    expect(isActiveStatus("NOT_A_STATUS")).toBe(false);
  });
});
