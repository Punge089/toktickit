import { useEffect, useRef, useState } from "react";
import {
  ActionItem,
  ActionLockedError,
  ActionStaleError,
  ActionStatus,
  InvalidAssigneeError,
  updateAction,
} from "../../api/actions.js";
import { fetchAssignableUsers } from "../../api/staffQueue.js";
import { formatDateTime } from "../../lib/format.js";
import { Alert } from "../ui/Alert.js";
import { ActionStatusBadge, FollowUpMarker, STATUS_LABEL, TicketStatus } from "../ui/Badge.js";
import { Button } from "../ui/Button.js";
import { Spinner } from "../ui/Spinner.js";
import { ActionForm, StaffOption } from "./ActionForm.js";
import { ActionList } from "./ActionList.js";
import { ActionsLoadState } from "./useActions.js";

interface ActionsTakenProps {
  ticketId: number;
  ticketStatus: TicketStatus;
  /** IT Staff and Administrators may write Actions (BR-05, BR-06). */
  canWrite: boolean;
  user: { id: number; role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR" };
  state: ActionsLoadState;
  items: ActionItem[];
  retry: () => Promise<unknown>;
  reload: () => Promise<ActionItem[] | null>;
  /** The Ticket's own counts and resolution blockers changed; refresh them. */
  onChanged: () => void;
}

type Panel =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "view"; id: number }
  | { kind: "edit"; id: number; status?: ActionStatus; focusResult?: boolean };

// Actions can be written only while the Ticket is being worked (BR-12).
const WRITABLE: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];

const isOpen = (a: ActionItem) => a.actionStatus === "PLANNED" || a.actionStatus === "IN_PROGRESS";

// Lab 4 ui-spec.md §4.1: the Actions Taken tab of the IT Staff Ticket Detail.
// The create and edit form opens inline above the list (never a modal), so
// there is no focus trap and the list stays in view.
export function ActionsTaken({ ticketId, ticketStatus, canWrite, user, state, items, retry, reload, onChanged }: ActionsTakenProps) {
  const [panel, setPanel] = useState<Panel>({ kind: "closed" });
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [saved, setSaved] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickError, setQuickError] = useState<{ tone: "warning" | "error"; text: string } | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const quickInFlight = useRef(false);
  const refocusAdd = useRef(false);

  const writable = canWrite && WRITABLE.includes(ticketStatus);

  useEffect(() => {
    if (canWrite) fetchAssignableUsers().then(setStaff).catch(() => setStaff([]));
  }, [canWrite]);

  // Focus goes back to the Add Action button once the form has closed and the button is enabled again.
  useEffect(() => {
    if (panel.kind === "closed" && refocusAdd.current) {
      refocusAdd.current = false;
      addButton.current?.focus();
    }
  }, [panel]);

  const selected = panel.kind === "view" || panel.kind === "edit" ? items.find((a) => a.id === panel.id) ?? null : null;

  function announce(message: string) {
    setSaved(message);
  }

  function closePanel(returnFocus: boolean) {
    setPanel({ kind: "closed" });
    setQuickError(null);
    setConfirmCancelId(null);
    if (returnFocus) refocusAdd.current = true;
  }

  async function afterSave(message: string, next: Panel) {
    await reload();
    onChanged();
    announce(message);
    if (next.kind === "closed") refocusAdd.current = true;
    setPanel(next);
  }

  // Start, and Complete or Cancel when a Result already exists, send one
  // request straight away. Without a Result they open the form on the Result
  // field instead of submitting (ui-spec §4.1 quick actions).
  async function quick(action: ActionItem, status: ActionStatus) {
    if ((status === "COMPLETED" || status === "CANCELLED") && !(action.result ?? "").trim()) {
      setQuickError(null);
      setPanel({ kind: "edit", id: action.id, status, focusResult: true });
      return;
    }
    if (status === "CANCELLED" && confirmCancelId !== action.id) {
      setConfirmCancelId(action.id);
      return;
    }
    if (quickInFlight.current) return;
    quickInFlight.current = true;
    setQuickBusy(true);
    setQuickError(null);
    try {
      await updateAction(ticketId, action.id, action.version, { actionStatus: status });
      setConfirmCancelId(null);
      await afterSave("Action saved.", { kind: "view", id: action.id });
    } catch (err) {
      setConfirmCancelId(null);
      if (err instanceof ActionStaleError) {
        setQuickError({ tone: "warning", text: "Someone else changed this action. Reload to see the latest version." });
      } else if (err instanceof ActionLockedError || err instanceof InvalidAssigneeError) {
        setQuickError({ tone: "error", text: err.message });
        await reload();
        onChanged();
      } else {
        setQuickError({ tone: "warning", text: err instanceof Error ? err.message : "Unable to save this action. Please try again." });
      }
    } finally {
      quickInFlight.current = false;
      setQuickBusy(false);
    }
  }

  const lockedLine =
    ticketStatus === "RESOLVED"
      ? "Actions cannot be changed while the ticket is Resolved. Reopen it first."
      : `Actions cannot be changed while the ticket is ${STATUS_LABEL[ticketStatus]}.`;

  return (
    <div className="zen-action-area">
      <p className="zen-action-notice">
        <span role="img" aria-label="Visible to requester">
          👁
        </span>{" "}
        Everything in an Action is visible to the Requester.
      </p>

      <div className="zen-action-toolbar">
        {writable ? (
          <Button
            ref={addButton}
            variant="primary"
            onClick={() => {
              setQuickError(null);
              setPanel({ kind: "create" });
            }}
            disabled={panel.kind === "create"}
          >
            Add Action
          </Button>
        ) : (
          <p className="zen-action-locked">
            {canWrite ? lockedLine : "You have read-only access to this ticket."}
          </p>
        )}
      </div>

      <p className="zen-action-saved" role="status" aria-live="polite">
        {saved}
      </p>

      {panel.kind === "create" && writable && (
        <div className="zen-action-panel" ref={panelRef}>
          <h3 className="zen-action-panel-title">New action</h3>
          <ActionForm
            key="create"
            ticketId={ticketId}
            mode="create"
            staff={staff}
            hideSharedLabel
            defaultAssigneeId={user.role === "IT_STAFF" && staff.some((u) => u.id === user.id) ? user.id : null}
            loadLatest={async () => null}
            onSaved={() => void afterSave("Action saved.", { kind: "closed" })}
            onCancel={() => closePanel(true)}
            onOutOfDate={() => {
              void reload();
              onChanged();
            }}
          />
        </div>
      )}

      {state === "loading" && <Spinner label="Loading actions…" />}
      {state === "error" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--zen-space-3)" }}>
          <Alert tone="warning">Unable to load the actions on this ticket. Please try again.</Alert>
          <div>
            <Button variant="secondary" onClick={() => void retry()}>
              Retry
            </Button>
          </div>
        </div>
      )}
      {state === "ready" &&
        (items.length === 0 ? (
          <div className="zen-empty-state">
            <p style={{ margin: 0 }}>No actions recorded yet.</p>
          </div>
        ) : (
          <ActionList
            items={items}
            variant="staff"
            selectedId={selected?.id ?? null}
            onSelect={(id) => {
              setQuickError(null);
              setConfirmCancelId(null);
              setPanel({ kind: "view", id });
            }}
          />
        ))}

      {selected && panel.kind === "view" && (
        <div className="zen-action-panel" aria-label="Action details" role="region">
          <h3 className="zen-action-panel-title">Action details</h3>
          <dl className="zen-action-detail">
            <dt>Date/Time</dt>
            <dd>{formatDateTime(selected.actionAt)}</dd>
            <dt>Status</dt>
            <dd>
              <ActionStatusBadge status={selected.actionStatus} />
              {selected.followUpRequired && <FollowUpMarker />}
            </dd>
            <dt>Description</dt>
            <dd className="zen-action-pre">{selected.description}</dd>
            <dt>Result</dt>
            <dd className="zen-action-pre">{selected.result ?? "No result yet."}</dd>
            {selected.followUpRequired && (
              <>
                <dt>Follow-up Note</dt>
                <dd className="zen-action-pre">{selected.followUpNote}</dd>
              </>
            )}
            <dt>Attachment Notes</dt>
            <dd className="zen-action-pre">{selected.attachmentNotes ?? "None"}</dd>
            <dt>Assignee</dt>
            <dd>
              {selected.assignee.fullName}
              {selected.assignee.isActive ? "" : " (inactive)"}
            </dd>
            <dt>Performed by</dt>
            <dd>{selected.performedBy.fullName}</dd>
            <dt>Recorded</dt>
            <dd>{formatDateTime(selected.createdAt)}</dd>
          </dl>

          {quickError && <Alert tone={quickError.tone}>{quickError.text}</Alert>}

          {!isOpen(selected) && <p className="zen-action-final">This action is final.</p>}

          {confirmCancelId === selected.id ? (
            <div className="zen-confirm" role="alertdialog" aria-label="Confirm cancel action">
              <span>Cancel this action? This cannot be undone.</span>
              <div style={{ display: "flex", gap: "var(--zen-space-3)" }}>
                <Button variant="destructive" busy={quickBusy} busyText="Cancelling…" onClick={() => void quick(selected, "CANCELLED")}>
                  Confirm
                </Button>
                <Button variant="tertiary" onClick={() => setConfirmCancelId(null)} disabled={quickBusy}>
                  Keep
                </Button>
              </div>
            </div>
          ) : (
            <div className="zen-action-form-buttons">
              {writable && isOpen(selected) && (
                <>
                  <Button variant="primary" onClick={() => setPanel({ kind: "edit", id: selected.id })} disabled={quickBusy}>
                    Edit
                  </Button>
                  {selected.actionStatus === "PLANNED" && (
                    <Button variant="secondary" onClick={() => void quick(selected, "IN_PROGRESS")} disabled={quickBusy}>
                      Start
                    </Button>
                  )}
                  <Button variant="secondary" onClick={() => void quick(selected, "COMPLETED")} disabled={quickBusy}>
                    Complete
                  </Button>
                  <Button variant="destructive" onClick={() => void quick(selected, "CANCELLED")} disabled={quickBusy}>
                    Cancel action
                  </Button>
                </>
              )}
              <Button variant="tertiary" onClick={() => closePanel(false)}>
                Close
              </Button>
            </div>
          )}
        </div>
      )}

      {selected && panel.kind === "edit" && writable && (
        <div className="zen-action-panel" ref={panelRef}>
          <h3 className="zen-action-panel-title">Edit action</h3>
          <ActionForm
            key={`edit-${selected.id}-${selected.version}-${panel.status ?? ""}`}
            ticketId={ticketId}
            mode="edit"
            action={selected}
            staff={staff}
            hideSharedLabel
            defaultAssigneeId={null}
            initialStatus={panel.status}
            focusResultOnOpen={panel.focusResult}
            loadLatest={async () => {
              const latest = await reload();
              return latest?.find((a) => a.id === selected.id) ?? null;
            }}
            onSaved={() => void afterSave("Action saved.", { kind: "view", id: selected.id })}
            onCancel={() => setPanel({ kind: "view", id: selected.id })}
            onOutOfDate={() => {
              void reload();
              onChanged();
            }}
          />
        </div>
      )}

      {selected === null && (panel.kind === "view" || panel.kind === "edit") && state === "ready" && (
        <Alert tone="warning">This action is no longer on the ticket.</Alert>
      )}
    </div>
  );
}
