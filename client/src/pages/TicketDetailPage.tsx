import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useRequester } from "../context/RequesterContext.js";
import { fetchTicketDetail, TicketDetail, TicketNotFoundError } from "../api/ticketDetail.js";
import { formatDateTime } from "../lib/format.js";
import { Spinner } from "../components/ui/Spinner.js";
import { Alert } from "../components/ui/Alert.js";
import { PriorityBadge, StatusBadge } from "../components/ui/Badge.js";
import { AttachmentSection } from "../components/tickets/AttachmentSection.js";

type PageState = "loading" | "loaded" | "not-found" | "error";

// Issue 30/31 — Requester Ticket Detail (ui-spec.md §8): read-only header
// block, clearly separated by a divider from the Attachments section,
// which supports add/download/soft-remove (Issue 31) on top of the
// always-visible metadata Issue 30 established (BR-23).
export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { requester } = useRequester();
  const [state, setState] = useState<PageState>("loading");
  const [ticket, setTicket] = useState<TicketDetail | null>(null);

  const load = useCallback(() => {
    if (!requester || !id) return;
    setState("loading");
    fetchTicketDetail(requester.id, id)
      .then((detail) => {
        setTicket(detail);
        setState("loaded");
      })
      .catch((err) => {
        setState(err instanceof TicketNotFoundError ? "not-found" : "error");
      });
  }, [requester?.id, id]);

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
      </div>

      <hr className="zen-detail-divider" />

      <h2 style={{ fontSize: "var(--zen-fs-h2)" }}>Attachments</h2>

      <AttachmentSection ticketId={ticket.id} attachments={ticket.attachments} onChange={load} />
    </div>
  );
}
