import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ActionItem,
  ActionLockedError,
  ActionPayload,
  ActionStaleError,
  ActionStatus,
  ActionValidationError,
  InvalidAssigneeError,
  createAction,
  newClientRequestId,
  updateAction,
} from "../../api/actions.js";
import { Alert } from "../ui/Alert.js";
import { ACTION_STATUS_LABEL } from "../ui/Badge.js";
import { Button } from "../ui/Button.js";
import { Select } from "../ui/Select.js";
import { TextArea } from "../ui/TextArea.js";
import { TextField } from "../ui/TextField.js";

export interface StaffOption {
  id: number;
  fullName: string;
}

interface ActionFormProps {
  ticketId: number;
  mode: "create" | "edit";
  /** The Action being edited (edit mode only). */
  action?: ActionItem;
  staff: StaffOption[];
  /** Who the Assignee starts as when creating: the signed-in IT Staff member, none for an Administrator. */
  defaultAssigneeId: number | null;
  /** Edit mode: open with this status already chosen (the quick Complete and Cancel buttons). */
  initialStatus?: ActionStatus;
  focusResultOnOpen?: boolean;
  /** The tab already shows the shared-content notice right above the form, so the form need not repeat it. */
  hideSharedLabel?: boolean;
  /** Fetches the latest version of this Action for "Reload latest". */
  loadLatest: () => Promise<ActionItem | null>;
  onSaved: (saved: ActionItem) => void;
  onCancel: () => void;
  /** Called after any server answer that means the list or the Ticket is out of date. */
  onOutOfDate: () => void;
}

// Which statuses the Status select offers (Action Status Transition Matrix).
const CREATE_STATUSES: ActionStatus[] = ["PLANNED", "IN_PROGRESS", "COMPLETED"];
const NEXT_STATUSES: Record<ActionStatus, ActionStatus[]> = {
  PLANNED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

const FIELD_IDS = {
  actionAt: "action-date",
  description: "action-description",
  assigneeId: "action-assignee",
  actionStatus: "action-status",
  result: "action-result",
  followUpNote: "action-followup-note",
  attachmentNotes: "action-attachment-notes",
} as const;
type FieldKey = keyof typeof FIELD_IDS;
// The order the fields appear in, so the first invalid one takes focus.
const FIELD_ORDER: FieldKey[] = ["actionAt", "description", "assigneeId", "actionStatus", "result", "followUpNote", "attachmentNotes"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function localDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function localTime(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Values {
  date: string;
  time: string;
  description: string;
  assigneeId: string;
  actionStatus: ActionStatus;
  result: string;
  followUpRequired: boolean;
  followUpNote: string;
  attachmentNotes: string;
}

function valuesFrom(action: ActionItem | undefined, defaultAssigneeId: number | null, status?: ActionStatus): Values {
  const when = action ? new Date(action.actionAt) : new Date();
  return {
    date: localDate(when),
    time: localTime(when),
    description: action?.description ?? "",
    assigneeId: action ? String(action.assignee.id) : defaultAssigneeId !== null ? String(defaultAssigneeId) : "",
    actionStatus: status ?? action?.actionStatus ?? "PLANNED",
    result: action?.result ?? "",
    followUpRequired: action?.followUpRequired ?? false,
    followUpNote: action?.followUpNote ?? "",
    attachmentNotes: action?.attachmentNotes ?? "",
  };
}

// Lab 4 ui-spec.md §4.1 form: create and edit share one component. It never
// closes on a failure, never discards what was typed, sends one request at a
// time (BR-38), and reuses one clientRequestId for every retry of the same
// create (BR-18).
export function ActionForm({
  ticketId,
  mode,
  action,
  staff,
  defaultAssigneeId,
  initialStatus,
  focusResultOnOpen,
  hideSharedLabel,
  loadLatest,
  onSaved,
  onCancel,
  onOutOfDate,
}: ActionFormProps) {
  const [values, setValues] = useState<Values>(() => valuesFrom(action, defaultAssigneeId, initialStatus));
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [focusField, setFocusField] = useState<FieldKey | null>(focusResultOnOpen ? "result" : null);
  const [dateTouched, setDateTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [locked, setLocked] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [reloading, setReloading] = useState(false);
  const inFlight = useRef(false);
  const requestId = useRef(newClientRequestId());

  useEffect(() => {
    if (!focusField) return;
    document.getElementById(FIELD_IDS[focusField])?.focus();
    setFocusField(null);
  }, [focusField]);

  const readOnly = locked !== null;
  const statusChoices = mode === "create" ? CREATE_STATUSES : [action!.actionStatus, ...NEXT_STATUSES[action!.actionStatus]];

  // A since-deactivated assignee still shows, marked, so the Action's real state is visible (BR-04).
  const assigneeOptions = staff.map((u) => ({ value: String(u.id), label: u.fullName }));
  if (action && !staff.some((u) => u.id === action.assignee.id)) {
    assigneeOptions.push({
      value: String(action.assignee.id),
      label: `${action.assignee.fullName}${action.assignee.isActive ? "" : " (inactive)"}`,
    });
  }

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function validate(): Partial<Record<FieldKey, string>> {
    const e: Partial<Record<FieldKey, string>> = {};
    if (values.description.trim().length === 0) e.description = "Action Description is required.";
    if (values.assigneeId === "") e.assigneeId = "Choose an assignee.";
    if ((values.actionStatus === "COMPLETED" || values.actionStatus === "CANCELLED") && values.result.trim().length === 0) {
      e.result = values.actionStatus === "COMPLETED" ? "Result is required to complete an action." : "Result is required to cancel an action. Say why.";
    }
    if (values.followUpRequired && values.followUpNote.trim().length === 0) {
      e.followUpNote = "Follow-up Note is required when a follow-up is needed.";
    }
    return e;
  }

  function showErrors(e: Partial<Record<FieldKey, string>>) {
    setErrors(e);
    const first = FIELD_ORDER.find((k) => e[k]);
    if (first) setFocusField(first);
  }

  // Create sends the whole form; edit sends only what changed, so an untouched
  // date is never rewritten and the server sees exactly the user's intent.
  function buildPayload(): ActionPayload {
    const when = dateTouched || mode === "create" ? new Date(`${values.date}T${values.time}`) : null;
    const full: ActionPayload = {
      description: values.description,
      assigneeId: Number(values.assigneeId),
      result: values.result,
      followUpRequired: values.followUpRequired,
      followUpNote: values.followUpRequired ? values.followUpNote : "",
      attachmentNotes: values.attachmentNotes,
      actionStatus: values.actionStatus,
    };
    if (mode === "create") {
      if (dateTouched && when && !Number.isNaN(when.getTime())) full.actionAt = when.toISOString();
      return full;
    }
    const a = action!;
    const diff: ActionPayload = {};
    if (when && !Number.isNaN(when.getTime()) && dateTouched) diff.actionAt = when.toISOString();
    if (values.description.trim() !== a.description) diff.description = values.description;
    if (Number(values.assigneeId) !== a.assignee.id) diff.assigneeId = Number(values.assigneeId);
    if (values.result.trim() !== (a.result ?? "")) diff.result = values.result;
    if (values.followUpRequired !== a.followUpRequired) diff.followUpRequired = values.followUpRequired;
    if (values.followUpRequired && values.followUpNote.trim() !== (a.followUpNote ?? "")) diff.followUpNote = values.followUpNote;
    if (values.followUpRequired && !a.followUpRequired) diff.followUpNote = values.followUpNote;
    if (values.attachmentNotes.trim() !== (a.attachmentNotes ?? "")) diff.attachmentNotes = values.attachmentNotes;
    if (values.actionStatus !== a.actionStatus) diff.actionStatus = values.actionStatus;
    return diff;
  }

  async function send() {
    if (inFlight.current) return; // single-flight: a second click or Enter is ignored
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    setStale(false);
    try {
      const payload = buildPayload();
      if (mode === "edit" && Object.keys(payload).length === 0) {
        onCancel(); // nothing changed, nothing to send
        return;
      }
      const saved =
        mode === "create"
          ? await createAction(ticketId, requestId.current, payload)
          : await updateAction(ticketId, action!.id, action!.version, payload);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ActionValidationError) {
        const mapped: Partial<Record<FieldKey, string>> = {};
        for (const [key, message] of Object.entries(err.fieldErrors)) {
          if (key in FIELD_IDS) mapped[key as FieldKey] = message;
        }
        if (Object.keys(mapped).length === 0) setFailure(err.message);
        showErrors(mapped);
      } else if (err instanceof InvalidAssigneeError) {
        showErrors({ assigneeId: "Choose an active IT Staff member." });
      } else if (err instanceof ActionStaleError) {
        setStale(true);
      } else if (err instanceof ActionLockedError) {
        setLocked(err.message);
        onOutOfDate();
      } else {
        setFailure(err instanceof Error ? err.message : "Unable to save this action. Please try again.");
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
      setConfirmingCancel(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || readOnly) return;
    const found = validate();
    if (Object.keys(found).length > 0) {
      showErrors(found);
      return;
    }
    setErrors({});
    if (mode === "edit" && values.actionStatus === "CANCELLED" && action!.actionStatus !== "CANCELLED") {
      setConfirmingCancel(true);
      return;
    }
    void send();
  }

  async function reloadLatest() {
    setReloading(true);
    const latest = await loadLatest();
    setReloading(false);
    if (!latest) {
      setFailure("Unable to reload this action. Please try again.");
      return;
    }
    setValues(valuesFrom(latest, defaultAssigneeId));
    setDateTouched(false);
    setErrors({});
    setStale(false);
    onOutOfDate();
  }

  const showResultRequired = values.actionStatus === "COMPLETED" || values.actionStatus === "CANCELLED";

  return (
    <form className="zen-action-form" onSubmit={handleSubmit} noValidate aria-label={mode === "create" ? "Add action" : "Edit action"}>
      {!hideSharedLabel && (
        <p className="zen-action-shared-label">
          <span role="img" aria-label="Visible to requester">
            👁
          </span>{" "}
          Everything in an Action is visible to the Requester.
        </p>
      )}

      {stale && (
        <Alert tone="warning">
          <p style={{ margin: 0 }}>
            Someone else changed this action. Your changes are still in the form. Reload to see the latest version (your
            changes will be replaced).
          </p>
          <div style={{ marginTop: "var(--zen-space-2)" }}>
            <Button variant="secondary" busy={reloading} busyText="Reloading…" onClick={() => void reloadLatest()}>
              Reload latest
            </Button>
          </div>
        </Alert>
      )}
      {locked && <Alert tone="error">{locked}</Alert>}
      {failure && (
        <Alert tone="warning">
          <p style={{ margin: 0 }}>{failure}</p>
          <div style={{ marginTop: "var(--zen-space-2)" }}>
            <Button variant="secondary" onClick={() => void send()} disabled={busy}>
              Retry
            </Button>
          </div>
        </Alert>
      )}

      <div className="zen-action-form-grid">
        <fieldset className="zen-action-datetime" disabled={readOnly || busy}>
          <legend className="zen-field-label">Action Date/Time</legend>
          <TextField
            label="Date"
            type="date"
            id={FIELD_IDS.actionAt}
            value={values.date}
            onChange={(e) => {
              set("date", e.target.value);
              setDateTouched(true);
            }}
            error={errors.actionAt}
          />
          <TextField
            label="Time"
            type="time"
            value={values.time}
            onChange={(e) => {
              set("time", e.target.value);
              setDateTouched(true);
            }}
          />
        </fieldset>

        <Select
          label="Assignee"
          id={FIELD_IDS.assigneeId}
          required
          value={values.assigneeId}
          placeholder="Select assignee"
          options={assigneeOptions}
          onChange={(e) => set("assigneeId", e.target.value)}
          error={errors.assigneeId}
          disabled={readOnly || busy}
        />

        <div className="zen-field zen-action-wide">
          <span className="zen-field-label">Performed by</span>
          <span className="zen-detail-value">{mode === "create" ? "You" : action!.performedBy.fullName}</span>
        </div>

        <TextArea
          className="zen-action-wide"
          label="Action Description"
          id={FIELD_IDS.description}
          required
          rows={3}
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          error={errors.description}
          disabled={readOnly || busy}
        />

        <Select
          label="Status"
          id={FIELD_IDS.actionStatus}
          value={values.actionStatus}
          options={statusChoices.map((s) => ({
            value: s,
            label: mode === "edit" && s === action!.actionStatus ? `${ACTION_STATUS_LABEL[s]} (current)` : ACTION_STATUS_LABEL[s],
          }))}
          onChange={(e) => set("actionStatus", e.target.value as ActionStatus)}
          error={errors.actionStatus}
          disabled={readOnly || busy}
        />

        <TextArea
          className="zen-action-wide"
          label="Result"
          id={FIELD_IDS.result}
          required={showResultRequired}
          rows={3}
          value={values.result}
          onChange={(e) => set("result", e.target.value)}
          error={errors.result}
          disabled={readOnly || busy}
        />

        <div className="zen-field zen-action-wide">
          <label className="zen-action-check">
            <input
              type="checkbox"
              checked={values.followUpRequired}
              onChange={(e) => set("followUpRequired", e.target.checked)}
              disabled={readOnly || busy}
            />
            Follow-up required?
          </label>
        </div>

        {values.followUpRequired && (
          <TextArea
            className="zen-action-wide"
            label="Follow-up Note"
            id={FIELD_IDS.followUpNote}
            required
            rows={2}
            value={values.followUpNote}
            onChange={(e) => set("followUpNote", e.target.value)}
            error={errors.followUpNote}
            disabled={readOnly || busy}
          />
        )}

        <TextField
          className="zen-action-wide"
          label="Attachment Notes"
          id={FIELD_IDS.attachmentNotes}
          value={values.attachmentNotes}
          caption="Say which attached file to look for, for example the photo of the old battery."
          onChange={(e) => set("attachmentNotes", e.target.value)}
          error={errors.attachmentNotes}
          disabled={readOnly || busy}
        />
      </div>

      {confirmingCancel ? (
        <div className="zen-confirm" role="alertdialog" aria-label="Confirm cancel action">
          <span>Cancel this action? This cannot be undone.</span>
          <div style={{ display: "flex", gap: "var(--zen-space-3)" }}>
            <Button variant="destructive" busy={busy} busyText="Cancelling…" onClick={() => void send()}>
              Confirm
            </Button>
            <Button variant="tertiary" onClick={() => setConfirmingCancel(false)} disabled={busy}>
              Keep
            </Button>
          </div>
        </div>
      ) : (
        <div className="zen-action-form-buttons">
          {!readOnly && (
            <Button type="submit" variant="primary" busy={busy} busyText="Saving…">
              Save action
            </Button>
          )}
          <Button variant="tertiary" onClick={onCancel} disabled={busy}>
            {readOnly ? "Close" : "Cancel"}
          </Button>
        </div>
      )}
    </form>
  );
}
