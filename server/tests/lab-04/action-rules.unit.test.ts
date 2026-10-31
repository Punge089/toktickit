import { describe, it, expect } from "vitest";
import {
  ACTION_STATUSES,
  ActionStatusValue,
  canActionTransition,
  isOpenAction,
  ticketAllowsActions,
  validateActionFields,
} from "../../src/lib/actionRules.js";

// docs/lab-04/tests.md UNIT-01, UNIT-02 - specification.md BR-07 to BR-09,
// BR-11, BR-12. Pure functions: no database, no network.
const NOW = new Date("2026-10-30T10:00:00.000Z");

function valid(overrides: Record<string, unknown> = {}) {
  return {
    actionAt: "2026-10-30T09:00:00.000Z",
    description: "Replaced the laptop battery.",
    result: undefined as unknown,
    followUpRequired: false,
    followUpNote: undefined as unknown,
    attachmentNotes: undefined as unknown,
    actionStatus: "PLANNED",
    ...overrides,
  };
}

describe("validateActionFields (UNIT-01)", () => {
  it("accepts a minimal valid Action and trims the description", () => {
    const r = validateActionFields(valid({ description: "  Replaced the battery  " }), NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.description).toBe("Replaced the battery");
      expect(r.value.actionStatus).toBe("PLANNED");
      expect(r.value.result).toBeNull();
      expect(r.value.followUpNote).toBeNull();
      expect(r.value.attachmentNotes).toBeNull();
    }
  });

  it("defaults actionAt to now and status to Planned when they are not sent", () => {
    const r = validateActionFields(valid({ actionAt: undefined, actionStatus: undefined }), NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.actionAt).toEqual(NOW);
      expect(r.value.actionStatus).toBe("PLANNED");
    }
  });

  it("requires a description of 1 to 2000 characters after trimming", () => {
    for (const bad of [undefined, "", "   ", 42]) {
      const r = validateActionFields(valid({ description: bad }), NOW);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(Object.keys(r.fieldErrors)).toEqual(["description"]);
    }
    expect(validateActionFields(valid({ description: "a".repeat(2000) }), NOW).ok).toBe(true);
    const tooLong = validateActionFields(valid({ description: "a".repeat(2001) }), NOW);
    expect(tooLong.ok).toBe(false);
  });

  it("limits result, follow-up note and attachment notes", () => {
    const r = validateActionFields(
      valid({
        result: "r".repeat(2001),
        followUpRequired: true,
        followUpNote: "n".repeat(2001),
        attachmentNotes: "a".repeat(1001),
      }),
      NOW,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(["attachmentNotes", "followUpNote", "result"]);
    expect(validateActionFields(valid({ attachmentNotes: "a".repeat(1000) }), NOW).ok).toBe(true);
  });

  it("rejects an actionAt more than 5 minutes ahead and accepts one just inside the window", () => {
    const tooFar = validateActionFields(valid({ actionAt: "2026-10-30T10:05:01.000Z" }), NOW);
    expect(tooFar.ok).toBe(false);
    if (!tooFar.ok) expect(tooFar.fieldErrors.actionAt).toBeDefined();
    expect(validateActionFields(valid({ actionAt: "2026-10-30T10:04:59.000Z" }), NOW).ok).toBe(true);
  });

  it("rejects an actionAt that is not a date", () => {
    for (const bad of ["not a date", "", 12345]) {
      const r = validateActionFields(valid({ actionAt: bad }), NOW);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fieldErrors.actionAt).toBeDefined();
    }
  });

  it("requires a follow-up note when follow-up is on, and names followUpNote", () => {
    for (const note of [undefined, "", "   "]) {
      const r = validateActionFields(valid({ followUpRequired: true, followUpNote: note }), NOW);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fieldErrors.followUpNote).toBe("Follow-up Note is required when a follow-up is needed.");
    }
    const ok = validateActionFields(valid({ followUpRequired: true, followUpNote: " Check next week " }), NOW);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.followUpNote).toBe("Check next week");
  });

  it("discards a note sent while follow-up is off (BR-08)", () => {
    const r = validateActionFields(valid({ followUpRequired: false, followUpNote: "Stale note" }), NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.followUpNote).toBeNull();
  });

  it("rejects values of the wrong type", () => {
    const r = validateActionFields(valid({ followUpRequired: "yes", result: 5, attachmentNotes: {} }), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(["attachmentNotes", "followUpRequired", "result"]);
  });

  it("rejects an unknown action status", () => {
    const r = validateActionFields(valid({ actionStatus: "DONE" }), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.actionStatus).toBeDefined();
  });
});

describe("Action status rules (UNIT-02)", () => {
  const allowed: Array<[ActionStatusValue, ActionStatusValue]> = [
    ["PLANNED", "IN_PROGRESS"],
    ["PLANNED", "COMPLETED"],
    ["PLANNED", "CANCELLED"],
    ["IN_PROGRESS", "COMPLETED"],
    ["IN_PROGRESS", "CANCELLED"],
  ];

  it("allows exactly the five pairs of the Action matrix, checked against all 16 pairs", () => {
    for (const from of ACTION_STATUSES) {
      for (const to of ACTION_STATUSES) {
        const expected = allowed.some(([f, t]) => f === from && t === to);
        expect(canActionTransition(from, to), `${from} -> ${to}`).toBe(expected);
      }
    }
  });

  it("treats Completed and Cancelled as final and Planned and In Progress as open", () => {
    expect(ACTION_STATUSES.filter(isOpenAction)).toEqual(["PLANNED", "IN_PROGRESS"]);
    for (const to of ACTION_STATUSES) {
      expect(canActionTransition("COMPLETED", to)).toBe(false);
      expect(canActionTransition("CANCELLED", to)).toBe(false);
    }
  });

  it("requires a Result to complete and a Result (the reason) to cancel", () => {
    for (const status of ["COMPLETED", "CANCELLED"]) {
      for (const result of [undefined, "", "  "]) {
        const r = validateActionFields(valid({ actionStatus: status, result }), NOW);
        expect(r.ok, `${status} with result ${JSON.stringify(result)}`).toBe(false);
        if (!r.ok) expect(r.fieldErrors.result).toBeDefined();
      }
      expect(validateActionFields(valid({ actionStatus: status, result: "Done." }), NOW).ok).toBe(true);
    }
    expect(validateActionFields(valid({ actionStatus: "IN_PROGRESS" }), NOW).ok).toBe(true);
  });

  it("allows Actions only on a New, Open, In Progress, Waiting or Reopened Ticket (BR-12)", () => {
    for (const s of ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"]) {
      expect(ticketAllowsActions(s), s).toBe(true);
    }
    for (const s of ["RESOLVED", "CLOSED", "CANCELLED"]) {
      expect(ticketAllowsActions(s), s).toBe(false);
    }
  });
});
