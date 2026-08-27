import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useRequester } from "../context/RequesterContext.js";
import { fetchTicketDetail, TicketDetail, TicketNotFoundError } from "../api/ticketDetail.js";
import { Spinner } from "../components/ui/Spinner.js";
import { Alert } from "../components/ui/Alert.js";
import { PriorityBadge, StatusBadge, AttachmentStateBadge } from "../components/ui/Badge.js";

type PageState = "loading" | "loaded" | "not-found" | "error";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Issue 30 — Requester Ticket Detail (ui-spec.md §8): read-only header
// block, clearly separated from the Attachments section. Attachment
// add/download/soft-remove actions ship in Issue 31 — this issue only
// displays existing attachment metadata (BR-23: metadata always visible,
// active vs removed distinguished by badge, not by hiding removed rows).
export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { requester } = useRequester();
  const [state, setState] = useState<PageState>("loading");
  const [ticket, setTicket] = useState<TicketDetail | null>(null);

  useEffect(() => {
    if (!requester || !id) return;
    let cancelled = false;
    setState("loading");
    fetchTicketDetail(requester.id, id)
      .then((detail) => {
        if (cancelled) return;
        setTicket(detail);
        setState("loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        setState(err instanceof TicketNotFoundError ? "not-found" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [requester?.id, id]);

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

      {ticket.attachments.length === 0 ? (
        <p style={{ color: "var(--zen-text-muted)" }}>No attachments on this ticket yet.</p>
      ) : (
        <div>
          {ticket.attachments.map((a) => (
            <div key={a.id} className="zen-attachment-row">
              <span className="zen-attachment-name" title={a.originalFilename}>
                {a.originalFilename}
              </span>
              <AttachmentStateBadge removed={a.removedAt !== null} />
              <span className="zen-attachment-meta">
                {formatSize(a.sizeBytes)} · uploaded {formatDateTime(a.uploadedAt)}
              </span>
              {a.removedAt && a.removalReason && (
                <span className="zen-attachment-meta">Removed: {a.removalReason}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
