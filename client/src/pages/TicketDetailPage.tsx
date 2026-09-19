import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchTicketDetail, TicketDetail, TicketNotFoundError } from "../api/ticketDetail.js";
import { formatDateTime } from "../lib/format.js";
import { Spinner } from "../components/ui/Spinner.js";
import { Alert } from "../components/ui/Alert.js";
import { PriorityBadge, StatusBadge } from "../components/ui/Badge.js";
import { AttachmentSection } from "../components/tickets/AttachmentSection.js";
import { EntryThread } from "../components/tickets/EntryThread.js";
import { Button } from "../components/ui/Button.js";
import { Badge } from "../components/ui/Badge.js";
import { Entry, fetchComments, markProblemResolved, postComment } from "../api/entries.js";

type PageState = "loading" | "loaded" | "not-found" | "error";

// Issue 30/31 — Requester Ticket Detail (ui-spec.md §8): read-only header
// block, clearly separated by a divider from the Attachments section,
// which supports add/download/soft-remove (Issue 31) on top of the
// always-visible metadata Issue 30 established (BR-23).
export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<PageState>("loading");
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [comments, setComments] = useState<Entry[]>([]);
  const [confirmingResolved, setConfirmingResolved] = useState(false);
  const [resolvedBusy, setResolvedBusy] = useState(false);
  const [resolvedError, setResolvedError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setState("loading");
    fetchTicketDetail(id)
      .then((detail) => {
        setTicket(detail);
        setState("loaded");
        fetchComments(detail.id).then(setComments).catch(() => setComments([]));
      })
      .catch((err) => {
        setState(err instanceof TicketNotFoundError ? "not-found" : "error");
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (state === "loading") {
    return <Spinner label="Loading ticket…" />;
  }

  if (state === "not-found") {
    // BR-10/BR-28 — identical whether the ticket never existed or belongs
    // to another Requester; never reveal which.
    return (
      <div>
        <Alert tone="error">Ticket not found.</Alert>
        <p style={{ marginTop: "var(--zen-space-3)" }}>
          <Link to="/tickets">← Back to My Tickets</Link>
        </p>
      </div>
    );
  }

  if (state === "error" || !ticket) {
    return <Alert tone="error">Unable to load this ticket. Please try again.</Alert>;
  }

  // Closed and Cancelled Tickets accept no more comments or resolved signals (BR-22).
  const finished = ticket.currentStatus === "CLOSED" || ticket.currentStatus === "CANCELLED";
  const canIndicateResolved =
    !finished && ticket.currentStatus !== "RESOLVED" && ticket.requesterResolvedAt === null;

  async function confirmResolved() {
    if (!ticket) return;
    setResolvedBusy(true);
    setResolvedError(null);
    try {
      await markProblemResolved(ticket.id);
      setConfirmingResolved(false);
      load();
    } catch (err) {
      setResolvedError(err instanceof Error ? err.message : "Unable to send this. Please try again.");
    } finally {
      setResolvedBusy(false);
    }
  }

  return (
    <div>
      <p style={{ marginBottom: "var(--zen-space-3)" }}>
        <Link to="/tickets">← Back to My Tickets</Link>
      </p>

      <h1 style={{ fontSize: "var(--zen-fs-h1)", marginTop: 0 }}>{ticket.ticketNumber}</h1>

      <div className="zen-detail-header">
        <div className="zen-detail-field">
          <span className="zen-detail-label">Ticket Date</span>
          <span className="zen-detail-value">{formatDateTime(ticket.createdAt)}</span>
        </div>
        <div className="zen-detail-field">
          <span className="zen-detail-label">Requester</span>
          <span className="zen-detail-value">{ticket.requesterName}</span>
        </div>
        <div className="zen-detail-field">
          <span className="zen-detail-label">Category</span>
          <span className="zen-detail-value">{ticket.categoryName}</span>
        </div>
        <div className="zen-detail-field">
          <span className="zen-detail-label">Related System</span>
          <span className="zen-detail-value">{ticket.relatedSystemName}</span>
        </div>
        <div className="zen-detail-field">
          <span className="zen-detail-label">Requested Priority</span>
          <span className="zen-detail-value">
            <PriorityBadge priority={ticket.requestedPriority} />
          </span>
        </div>
        <div className="zen-detail-field">
          <span className="zen-detail-label">Current Status</span>
          <span className="zen-detail-value">
            <StatusBadge status={ticket.currentStatus} />
          </span>
        </div>
        <div className="zen-detail-field">
          <span className="zen-detail-label">Last Updated</span>
          <span className="zen-detail-value">{formatDateTime(ticket.updatedAt)}</span>
        </div>
        <div className="zen-detail-field" style={{ gridColumn: "1 / -1" }}>
          <span className="zen-detail-label">Summary</span>
          <span className="zen-detail-value">{ticket.summary}</span>
        </div>
        <div className="zen-detail-field" style={{ gridColumn: "1 / -1" }}>
          <span className="zen-detail-label">Description</span>
          <span className="zen-detail-value" style={{ whiteSpace: "pre-wrap" }}>
            {ticket.description}
          </span>
        </div>
        {ticket.resolutionSummary && (
          <div className="zen-detail-field" style={{ gridColumn: "1 / -1" }}>
            <span className="zen-detail-label">Resolution Summary</span>
            <span className="zen-detail-value" style={{ whiteSpace: "pre-wrap" }}>
              {ticket.resolutionSummary}
            </span>
          </div>
        )}
      </div>

      <div style={{ marginTop: "var(--zen-space-4)" }}>
        {ticket.requesterResolvedAt ? (
          <Badge tone="success">✓ You told IT Staff this looks resolved</Badge>
        ) : (
          canIndicateResolved &&
          (confirmingResolved ? (
            <div className="zen-confirm" role="alertdialog" aria-label="Confirm problem appears resolved">
              <span>Let IT Staff know you think this is fixed? They will still close the ticket.</span>
              {resolvedError && <Alert tone="error">{resolvedError}</Alert>}
              <div style={{ display: "flex", gap: "var(--zen-space-3)" }}>
                <Button variant="primary" busy={resolvedBusy} busyText="Sending…" onClick={confirmResolved}>
                  Yes, it looks resolved
                </Button>
                <Button variant="tertiary" onClick={() => setConfirmingResolved(false)} disabled={resolvedBusy}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setConfirmingResolved(true)}>
              Problem Appears Resolved
            </Button>
          ))
        )}
      </div>

      <hr className="zen-detail-divider" />

      <h2 style={{ fontSize: "var(--zen-fs-h2)" }}>Attachments</h2>

      <AttachmentSection ticketId={ticket.id} attachments={ticket.attachments} onChange={load} />

      <hr className="zen-detail-divider" />

      <h2 style={{ fontSize: "var(--zen-fs-h2)" }}>Comments</h2>
      <EntryThread
        kind="public"
        entries={comments}
        canPost={!finished}
        readOnlyNote="This ticket is closed. Comments can no longer be added."
        onPost={async (body) => {
          await postComment(ticket.id, body);
          setComments(await fetchComments(ticket.id));
        }}
      />
    </div>
  );
}
