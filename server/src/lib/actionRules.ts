// Lab 4 — Issue 80: pure rules for Actions Taken (docs/lab-04/specification.md
// BR-07 to BR-09, BR-12). No database or network here, so the rules are unit
// tested on their own (tests/lab-04/action-rules.unit.test.ts).

import { isActiveStatus } from "./workflowRules.js";

export const ACTION_STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type ActionStatusValue = (typeof ACTION_STATUSES)[number];

export const MAX_DESCRIPTION = 2000;
export const MAX_RESULT = 2000;
export const MAX_FOLLOW_UP_NOTE = 2000;
export const MAX_ATTACHMENT_NOTES = 1000;
// actionAt may be a little ahead of the server clock, to forgive client clock
// drift, but not a plan for next week (BR-07).
export const MAX_FUTURE_MS = 5 * 60 * 1000;

export const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

// An Action can be created as Planned, In Progress or Completed so work that
// is already finished can be logged in one step (BR-09). Cancelled only
// happens to an existing Action, with a reason.
export const CREATABLE_STATUSES: readonly ActionStatusValue[] = ["PLANNED", "IN_PROGRESS", "COMPLETED"];

// BR-12: Actions are written only while the Ticket is being worked, which is
// exactly the set of active statuses (BR-28).
export function ticketAllowsActions(status: string): boolean {
  return isActiveStatus(status);
}

export function isActionStatus(value: unknown): value is ActionStatusValue {
  return typeof value === "string" && (ACTION_STATUSES as readonly string[]).includes(value);
}

// Planned and In Progress are the "open" states; Completed and Cancelled are
// final (BR-11).
export function isOpenAction(status: ActionStatusValue): boolean {
  return status === "PLANNED" || status === "IN_PROGRESS";
}

// Action Status Transition Matrix (specification §5).
const ACTION_TRANSITIONS: Record<ActionStatusValue, readonly ActionStatusValue[]> = {
  PLANNED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canActionTransition(from: ActionStatusValue, to: ActionStatusValue): boolean {
  return ACTION_TRANSITIONS[from].includes(to);
}

export interface ActionFieldsInput {
  actionAt: unknown;
  description: unknown;
  result: unknown;
  followUpRequired: unknown;
  followUpNote: unknown;
  attachmentNotes: unknown;
  actionStatus: unknown;
}

export interface ActionFields {
  actionAt: Date;
  description: string;
  result: string | null;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  actionStatus: ActionStatusValue;
}

export type ActionFieldErrors = Partial<Record<keyof ActionFieldsInput, string>>;

export type ActionValidation =
  | { ok: true; value: ActionFields }
  | { ok: false; fieldErrors: ActionFieldErrors };

// Validates the Action as it would be after the change (api-spec §3), so one
// function serves both create and update. Optional text that is blank is
// stored as null rather than as an empty string.
export function validateActionFields(input: ActionFieldsInput, now: Date = new Date()): ActionValidation {
  const errors: ActionFieldErrors = {};

  let actionAt = now;
  if (input.actionAt !== undefined && input.actionAt !== null) {
    const parsed = input.actionAt instanceof Date ? input.actionAt : parseDate(input.actionAt);
    if (parsed === null) {
      errors.actionAt = "Action Date/Time must be a valid date and time.";
    } else if (parsed.getTime() > now.getTime() + MAX_FUTURE_MS) {
      errors.actionAt = "Action Date/Time cannot be in the future.";
    } else {
      actionAt = parsed;
    }
  }

  let description = "";
  if (typeof input.description !== "string" || input.description.trim().length === 0) {
    errors.description = "Action Description is required.";
  } else if (input.description.trim().length > MAX_DESCRIPTION) {
    errors.description = `Action Description must be at most ${MAX_DESCRIPTION} characters.`;
  } else {
    description = input.description.trim();
  }

  const result = optionalText(input.result, MAX_RESULT, "Result", "result", errors);
  const attachmentNotes = optionalText(
    input.attachmentNotes,
    MAX_ATTACHMENT_NOTES,
    "Attachment Notes",
    "attachmentNotes",
    errors,
  );
  let followUpNote = optionalText(input.followUpNote, MAX_FOLLOW_UP_NOTE, "Follow-up Note", "followUpNote", errors);

  let followUpRequired = false;
  if (input.followUpRequired !== undefined && input.followUpRequired !== null) {
    if (typeof input.followUpRequired !== "boolean") {
      errors.followUpRequired = "Follow-Up Required must be true or false.";
    } else {
      followUpRequired = input.followUpRequired;
    }
  }
  if (followUpRequired && followUpNote === null && !errors.followUpNote) {
    errors.followUpNote = "Follow-up Note is required when a follow-up is needed.";
  }
  // BR-08: a note sent while follow-up is off is discarded, not stored.
  if (!followUpRequired) followUpNote = null;

  let actionStatus: ActionStatusValue = "PLANNED";
  if (input.actionStatus !== undefined && input.actionStatus !== null) {
    if (isActionStatus(input.actionStatus)) {
      actionStatus = input.actionStatus;
    } else {
      errors.actionStatus = "Action Status must be Planned, In Progress, Completed or Cancelled.";
    }
  }
  // BR-09: finishing or cancelling an Action needs a Result (the reason, for Cancelled).
  if ((actionStatus === "COMPLETED" || actionStatus === "CANCELLED") && result === null && !errors.result) {
    errors.result =
      actionStatus === "COMPLETED"
        ? "Result is required to complete an action."
        : "Result is required to cancel an action. Say why it was cancelled.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: { actionAt, description, result, followUpRequired, followUpNote, attachmentNotes, actionStatus },
  };
}

function parseDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function optionalText(
  raw: unknown,
  max: number,
  label: string,
  key: keyof ActionFieldsInput,
  errors: ActionFieldErrors,
): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") {
    errors[key] = `${label} must be text.`;
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length > max) {
    errors[key] = `${label} must be at most ${max} characters.`;
    return null;
  }
  return trimmed.length === 0 ? null : trimmed;
}
