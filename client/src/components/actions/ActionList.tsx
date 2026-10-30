import { ActionItem } from "../../api/actions.js";
import { formatDateTime } from "../../lib/format.js";
import { ActionStatusBadge, FollowUpMarker } from "../ui/Badge.js";
import { Button } from "../ui/Button.js";

interface ActionListProps {
  items: ActionItem[];
  /** "staff" is the compact row with a View button; "requester" shows every field, read-only. */
  variant: "staff" | "requester";
  selectedId?: number | null;
  onSelect?: (id: number) => void;
}

function personLabel(p: { fullName: string; isActive: boolean }): string {
  return p.isActive ? p.fullName : `${p.fullName} (inactive)`;
}

// Lab 4 ui-spec.md §4.1 and §5: one row per Action, in the order the API
// returns (actionAt, then id). From 992px up the rows line up as a table with
// a header; below that each row is a card whose cells carry their own label,
// so nothing scrolls sideways. Text is rendered as plain text (Lab 3 BR-26).
export function ActionList({ items, variant, selectedId, onSelect }: ActionListProps) {
  const staff = variant === "staff";
  return (
    <ul className={`zen-action-list zen-action-list-${variant}`} aria-label="Actions taken">
      <li className="zen-action-header" aria-hidden="true">
        <span>Date/Time</span>
        <span>Description</span>
        {!staff && <span>Result</span>}
        <span>Status</span>
        <span>Follow-up</span>
        {!staff && <span>Attachment notes</span>}
        <span>Assignee</span>
        <span>Performed by</span>
        {staff && <span />}
      </li>
      {items.map((a) => (
        <li key={a.id} className="zen-action-row" aria-current={selectedId === a.id ? "true" : undefined}>
          <span className="zen-action-cell zen-action-cell-date">
            <span className="zen-action-label">Date/Time</span>
            {formatDateTime(a.actionAt)}
          </span>
          <span className="zen-action-cell zen-action-cell-desc" title={staff ? a.description : undefined}>
            {a.description}
          </span>
          {!staff && (
            <span className="zen-action-cell zen-action-cell-result">
              <span className="zen-action-label">Result</span>
              {a.result ?? "No result yet."}
            </span>
          )}
          <span className="zen-action-cell zen-action-cell-status">
            <ActionStatusBadge status={a.actionStatus} />
          </span>
          <span className="zen-action-cell zen-action-cell-followup">
            {a.followUpRequired ? (
              <>
                <FollowUpMarker />
                {!staff && a.followUpNote && <span className="zen-action-followup-note">{a.followUpNote}</span>}
              </>
            ) : (
              <span className="zen-action-none">
                <span className="zen-action-label">Follow-up</span>None
              </span>
            )}
          </span>
          {!staff && (
            <span className="zen-action-cell zen-action-cell-notes">
              <span className="zen-action-label">Attachment notes</span>
              {a.attachmentNotes ?? "None"}
            </span>
          )}
          <span className="zen-action-cell zen-action-cell-assignee">
            <span className="zen-action-label">Assignee</span>
            {personLabel(a.assignee)}
          </span>
          <span className="zen-action-cell zen-action-cell-by">
            <span className="zen-action-label">Performed by</span>
            {personLabel(a.performedBy)}
          </span>
          {staff && (
            <span className="zen-action-cell zen-action-cell-open">
              <Button variant="secondary" onClick={() => onSelect?.(a.id)} aria-label={`View action: ${a.description}`}>
                View
              </Button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
