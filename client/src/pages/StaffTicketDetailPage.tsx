import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import {
  fetchStaffTicket,
  OperationRejectedError,
  OperationValidationError,
  StaffForbiddenError,
  StaffTicketDetail,
  StaffTicketNotFoundError,
  updateItPriority,
  updateOwner,
  updateStatus,
} from "../api/staffTicket.js";
import { fetchAssignableUsers, Priority } from "../api/staffQueue.js";
import { Entry, fetchComments, fetchNotes, postComment, postNote } from "../api/entries.js";
import { downloadAttachment } from "../api/attachments.js";
import { formatDateTime, formatSize } from "../lib/format.js";
import { Alert } from "../components/ui/Alert.js";
import { Button } from "../components/ui/Button.js";
import { Select } from "../components/ui/Select.js";
import { Spinner } from "../components/ui/Spinner.js";
import { AttachmentStateBadge, Badge, PriorityBadge, STATUS_LABEL, StatusBadge, TicketStatus } from "../components/ui/Badge.js";
import { EntryThread } from "../components/tickets/EntryThread.js";

type PageState = "loading" | "loaded" | "not-found" | "forbidden" | "error";
type Tab = "comments" | "notes" | "attachments";

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

// Issue 66 - IT Staff Ticket Detail (docs/lab-03/ui-spec.md section 8):
// grouped read-only Ticket information, operational controls (Owner, IT
// Priority, Status) editable only by IT Staff, and Public Comments /
// Internal Notes / Attachments tabs. An Administrator sees the same screen
// read-only (BR-36); a Closed or Cancelled Ticket is read-only for everyone
// (BR-22). Every control is a convenience: the backend enforces the same
// rules independently.
export function StaffTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canAct = user?.role === "IT_STAFF";

  const [state, setState] = useState<PageState>("loading");
  const [ticket, setTicket] = useState<StaffTicketDetail | null>(null);
  const [staff, setStaff] = useState<{ id: number; fullName: string }[]>([]);
  const [comments, setComments] = useState<Entry[]>([]);
  const [notes, setNotes] = useState<Entry[]>([]);
  const [tab, setTab] = useState<Tab>("comments");

  const [selectedStatus, setSelectedStatus] = useState<TicketStatus | "">("");
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"owner" | "priority" | "status" | null>(null);
  const [opError, setOpError] = useState<{ owner?: string; priority?: string; status?: string; summary?: string }>({});
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const loadEntries = useCallback((ticketId: number) => {
    fetchComments(ticketId).then(setComments).catch(() => setComments([]));
    fetchNotes(ticketId).then(setNotes).catch(() => setNotes([]));
  }, []);

  const load = useCallback(() => {
    if (!id) return;
    setState("loading");
    fetchStaffTicket(id)
      .then((detail) => {
        setTicket(detail);
        setSelectedStatus(detail.currentStatus);
        setState("loaded");
        loadEntries(detail.id);
      })
      .catch((err) => {
        if (err instanceof StaffTicketNotFoundError) setState("not-found");
        else if (err instanceof StaffForbiddenError) setState("forbidden");
        else setState("error");
      });
  }, [id, loadEntries]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetchAssignableUsers().then(setStaff).catch(() => setStaff([]));
  }, []);

  if (state === "loading") return <Spinner label="Loading ticket…" />;

  if (state === "not-found") {
    return (
      <div>
        <Alert tone="error">Ticket not found.</Alert>
        <p style={{ marginTop: "var(--zen-space-3)" }}>
          <Link to="/staff/queue">← Back to Queue</Link>
        </p>
      </div>
    );
  }
  if (state === "forbidden") return <Alert tone="error">You don't have access to this ticket.</Alert>;
  if (state === "error" || !ticket) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--zen-space-3)" }}>
        <Alert tone="error">Unable to load this ticket. Please try again.</Alert>
        <div>
          <Button variant="secondary" onClick={load}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const current = ticket;
  const terminal = current.allowedTransitions.length === 0;
  const editable = canAct && !terminal;

  // A since-deactivated owner still shows up so the Ticket's real state is visible (BR-17).
  const ownerOptions = [
    { value: "", label: "Unassigned" },
    ...staff.map((u) => ({ value: String(u.id), label: u.fullName })),
  ];
  if (current.ownerId !== null && !staff.some((u) => u.id === current.ownerId)) {
    ownerOptions.push({
      value: String(current.ownerId),
      label: `${current.ownerName ?? "Unknown"}${current.ownerIsActive === false ? " (inactive)" : ""}`,
    });
  }

  async function run(kind: "owner" | "priority" | "status", action: () => Promise<StaffTicketDetail>) {
    setBusy(kind);
    setOpError((e) => ({ ...e, [kind === "status" ? "status" : kind]: undefined, summary: undefined }));
    try {
      const updated = await action();
      setTicket(updated);
      setSelectedStatus(updated.currentStatus);
      setResolutionSummary("");
      setConfirming(false);
    } catch (err) {
      const text =
        err instanceof OperationValidationError || err instanceof OperationRejectedError
          ? err.message
          : messageOf(err, "Unable to save this change. Please try again.");
      if (err instanceof OperationValidationError && err.fieldErrors.resolutionSummary) {
        setOpError((e) => ({ ...e, summary: err.fieldErrors.resolutionSummary }));
      } else {
        setOpError((e) => ({ ...e, [kind]: text }));
      }
      setConfirming(false);
    } finally {
      setBusy(null);
    }
  }

  function handleOwner(value: string) {
    run("owner", () => updateOwner(current.id, value === "" ? null : Number(value)));
  }

  function handlePriority(value: string) {
    run("priority", () => updateItPriority(current.id, value as Priority));
  }

  function submitStatus() {
    if (!selectedStatus || selectedStatus === current.currentStatus) return;
    run("status", () => updateStatus(current.id, selectedStatus, selectedStatus === "RESOLVED" ? resolutionSummary : undefined));
  }

  function handleUpdateStatusClick() {
    if (!selectedStatus || selectedStatus === current.currentStatus) return;
    if (selectedStatus === "RESOLVED" && resolutionSummary.trim().length === 0) {
      setOpError((e) => ({ ...e, summary: "A Resolution Summary is required to resolve a ticket." }));
      return; // no request is sent (client-side validation)
    }
    if (selectedStatus === "CLOSED" || selectedStatus === "CANCELLED") {
      setConfirming(true); // ui-spec.md section 8: confirm the terminal transitions
      return;
    }
    submitStatus();
  }

  async function handleDownload(attachmentId: number, filename: string) {
    setDownloadError(null);
    try {
      await downloadAttachment(attachmentId, filename);
    } catch (err) {
      setDownloadError(messageOf(err, "Unable to download this attachment."));
    }
  }

  const statusOptions = [current.currentStatus, ...current.allowedTransitions].map((s) => ({
    value: s,
    label: s === current.currentStatus ? `${STATUS_LABEL[s]} (current)` : STATUS_LABEL[s],
  }));

  const readOnlyNote = terminal
    ? "This ticket is closed. Comments and notes can no longer be added."
    : "Administrators can read this ticket but not post to it.";

  return (
    <div>
      <p style={{ marginBottom: "var(--zen-space-3)" }}>
        <Link to="/staff/queue">← Back to Queue</Link>
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--zen-space-3)" }}>
        <h1 style={{ fontSize: "var(--zen-fs-h1)", margin: 0 }}>{current.ticketNumber}</h1>
        <StatusBadge status={current.currentStatus} />
        {current.requesterResolvedAt && <Badge tone="success">✓ Requester reports resolved</Badge>}
      </div>

      <div className="zen-detail-header" style={{ marginTop: "var(--zen-space-3)" }}>
        <div className="zen-detail-field">
          <span className="zen-detail-label">Requester</span>
          <span className="zen-detail-value">{current.requesterName}</span>
        </div>
        <div className="zen-detail-field">
          <span className="zen-detail-label">Category</span>
          <span className="zen-detail-value">{current.categoryName}</span>
        </div>
        <div className="zen-detail-field">
          <span className="zen-detail-label">Related System</span>
          <span className="zen-detail-value">{current.relatedSystemName}</span>
        </div>
        <div className="zen-detail-field">
          <span className="zen-detail-label">Requested Priority</span>
          <span className="zen-detail-value">
            <PriorityBadge priority={current.requestedPriority} />
          </span>
        </div>
        <div className="zen-detail-field">
          <span className="zen-detail-label">Created</span>
          <span className="zen-detail-value">{formatDateTime(current.createdAt)}</span>
        </div>
        <div className="zen-detail-field">
          <span className="zen-detail-label">Last Updated</span>
          <span className="zen-detail-value">{formatDateTime(current.updatedAt)}</span>
        </div>
        <div className="zen-detail-field" style={{ gridColumn: "1 / -1" }}>
          <span className="zen-detail-label">Summary</span>
          <span className="zen-detail-value">{current.summary}</span>
        </div>
        <div className="zen-detail-field" style={{ gridColumn: "1 / -1" }}>
          <span className="zen-detail-label">Description</span>
          <span className="zen-detail-value" style={{ whiteSpace: "pre-wrap" }}>
            {current.description}
          </span>
        </div>
        {current.resolutionSummary && (
          <div className="zen-detail-field" style={{ gridColumn: "1 / -1" }}>
            <span className="zen-detail-label">Resolution Summary (visible to requester)</span>
            <span className="zen-detail-value" style={{ whiteSpace: "pre-wrap" }}>
              {current.resolutionSummary}
            </span>
          </div>
        )}
      </div>

      <h2 style={{ fontSize: "var(--zen-fs-h2)", marginBottom: 0, marginTop: "var(--zen-space-5)" }}>Operations</h2>
      <div className="zen-ops-card">
        {editable ? (
          <div>
            <Select
              label="Ticket Owner"
              value={current.ownerId === null ? "" : String(current.ownerId)}
              onChange={(e) => handleOwner(e.target.value)}
              options={ownerOptions}
              disabled={busy !== null}
              error={opError.owner}
            />
            {current.ownerId !== user?.id && (
              <Button variant="tertiary" onClick={() => handleOwner(String(user!.id))} disabled={busy !== null}>
                Assign to me
              </Button>
            )}
          </div>
        ) : (
          <div className="zen-detail-field">
            <span className="zen-detail-label">Ticket Owner</span>
            <span className="zen-detail-value">
              {current.ownerName ? `${current.ownerName}${current.ownerIsActive === false ? " (inactive)" : ""}` : "Unassigned"}
            </span>
          </div>
        )}

        {editable ? (
          <Select
            label="IT Priority"
            value={current.itPriority}
            onChange={(e) => handlePriority(e.target.value)}
            options={PRIORITY_OPTIONS}
            disabled={busy !== null}
            error={opError.priority}
          />
        ) : (
          <div className="zen-detail-field">
            <span className="zen-detail-label">IT Priority</span>
            <span className="zen-detail-value">
              <PriorityBadge priority={current.itPriority} />
            </span>
          </div>
        )}

        {editable ? (
          <Select
            label="Current Status"
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value as TicketStatus);
              setConfirming(false);
              setOpError((o) => ({ ...o, status: undefined, summary: undefined }));
            }}
            options={statusOptions}
            disabled={busy !== null}
            error={opError.status}
          />
        ) : (
          <div className="zen-detail-field">
            <span className="zen-detail-label">Current Status</span>
            <span className="zen-detail-value">
              <StatusBadge status={current.currentStatus} />
            </span>
          </div>
        )}

        {editable && selectedStatus === "RESOLVED" && current.currentStatus !== "RESOLVED" && (
          <div className="zen-field zen-ops-wide">
            <label className="zen-field-label" htmlFor="resolution-summary">
              Resolution Summary <span className="zen-field-required-marker" aria-hidden="true">*</span>
            </label>
            <textarea
              id="resolution-summary"
              className="zen-field-control"
              rows={3}
              value={resolutionSummary}
              onChange={(e) => setResolutionSummary(e.target.value)}
              placeholder="Explain the fix (visible to requester)…"
              aria-required="true"
              aria-invalid={opError.summary ? true : undefined}
              disabled={busy !== null}
            />
            {opError.summary && (
              <p className="zen-field-error" role="alert">
                {opError.summary}
              </p>
            )}
          </div>
        )}

        {editable && selectedStatus !== current.currentStatus && (
          <div className="zen-ops-wide">
            {confirming ? (
              <div className="zen-confirm" role="alertdialog" aria-label="Confirm status change">
                <span>
                  Change status to <strong>{STATUS_LABEL[selectedStatus as TicketStatus]}</strong>? This cannot be undone.
                </span>
                <div style={{ display: "flex", gap: "var(--zen-space-3)" }}>
                  <Button variant="destructive" busy={busy === "status"} busyText="Saving…" onClick={submitStatus}>
                    Confirm
                  </Button>
                  <Button variant="tertiary" onClick={() => setConfirming(false)} disabled={busy !== null}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="primary" busy={busy === "status"} busyText="Saving…" onClick={handleUpdateStatusClick}>
                Update status
              </Button>
            )}
          </div>
        )}

        {!editable && (
          <p className="zen-ops-wide" style={{ margin: 0, color: "var(--zen-text-muted)" }}>
            {terminal ? "This ticket is closed and can no longer be changed." : "You have read-only access to this ticket."}
          </p>
        )}
      </div>

      <div className="zen-tabs" role="tablist" aria-label="Ticket activity">
        {(
          [
            ["comments", `Public Comments (${comments.length})`],
            ["notes", `Internal Notes (${notes.length})`],
            ["attachments", `Attachments (${current.attachments.length})`],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            className="zen-tab"
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "comments" && (
        <div role="tabpanel" id="panel-comments" aria-labelledby="tab-comments">
          <EntryThread
            kind="public"
            entries={comments}
            canPost={editable}
            readOnlyNote={readOnlyNote}
            onPost={async (body) => {
              await postComment(current.id, body);
              setComments(await fetchComments(current.id));
            }}
          />
        </div>
      )}

      {tab === "notes" && (
        <div role="tabpanel" id="panel-notes" aria-labelledby="tab-notes">
          <EntryThread
            kind="internal"
            entries={notes}
            canPost={editable}
            readOnlyNote={readOnlyNote}
            onPost={async (body) => {
              await postNote(current.id, body);
              setNotes(await fetchNotes(current.id));
            }}
          />
        </div>
      )}

      {tab === "attachments" && (
        <div role="tabpanel" id="panel-attachments" aria-labelledby="tab-attachments">
          {downloadError && <Alert tone="error">{downloadError}</Alert>}
          {current.attachments.length === 0 ? (
            <p style={{ color: "var(--zen-text-muted)" }}>No attachments on this ticket.</p>
          ) : (
            current.attachments.map((a) => {
              const removed = a.removedAt !== null;
              return (
                <div key={a.id} className="zen-attachment-row">
                  <span className="zen-attachment-name" title={a.originalFilename}>
                    {a.originalFilename}
                  </span>
                  <AttachmentStateBadge removed={removed} />
                  <span className="zen-attachment-meta">
                    {formatSize(a.sizeBytes)} · uploaded {formatDateTime(a.uploadedAt)} by {a.uploadedByName}
                  </span>
                  {!removed ? (
                    <Button variant="secondary" onClick={() => handleDownload(a.id, a.originalFilename)}>
                      Download
                    </Button>
                  ) : (
                    <span className="zen-attachment-meta">
                      Removed {a.removedAt && formatDateTime(a.removedAt)}
                      {a.removedByName && ` by ${a.removedByName}`}
                      {a.removalReason && `: ${a.removalReason}`}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
