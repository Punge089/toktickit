import { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

// ui-spec.md §7 — shared shape for My Tickets' empty state (AC-12) and
// no-results state (AC-11); the two are distinguished by the title/
// description text the caller passes in, not by this component's markup.
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="zen-empty-state">
      <p style={{ fontWeight: 600, fontSize: "var(--zen-fs-h2)", margin: 0 }}>{title}</p>
      {description && <p style={{ margin: 0 }}>{description}</p>}
      {action}
    </div>
  );
}
