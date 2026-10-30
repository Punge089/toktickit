import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { DashboardState } from "./useDashboard.js";
import { formatDateTime } from "../../lib/format.js";
import { Alert } from "../ui/Alert.js";
import { Button } from "../ui/Button.js";
import { PriorityBadge, StatusBadge, TicketStatus } from "../ui/Badge.js";
import { ForbiddenPage } from "../../pages/ForbiddenPage.js";

interface FrameProps {
  firstName: string;
  subtitle: string;
  state: DashboardState;
  refreshing: boolean;
  refreshFailed: boolean;
  onRefresh: () => void;
  onRetry: () => void;
  skeletonCards: number;
  children: ReactNode;
}

// The title, the Refresh button and the loading, failure and forbidden states
// shared by both dashboards (ui-spec §3.3). `children` is only rendered once
// there is data, so a failed first load never shows stale figures.
export function DashboardFrame({ firstName, subtitle, state, refreshing, refreshFailed, onRefresh, onRetry, skeletonCards, children }: FrameProps) {
  if (state === "forbidden") return <ForbiddenPage />;
  return (
    <div className="zen-dash">
      <div className="zen-dash-header">
        <div>
          <h1 className="zen-dash-title">Welcome back, {firstName}</h1>
          <p className="zen-dash-subtitle">{subtitle}</p>
        </div>
        <Button variant="secondary" onClick={onRefresh} busy={refreshing} busyText="Refreshing…" disabled={state !== "ready"}>
          Refresh
        </Button>
      </div>

      {refreshFailed && (
        <Alert tone="warning">We could not refresh the dashboard. The figures below are from the last successful load.</Alert>
      )}

      {state === "loading" && (
        <div aria-busy="true">
          <p role="status" className="zen-dash-loading">
            Loading dashboard…
          </p>
          <div className="zen-dash-cards zen-dash-cards-4" aria-hidden="true">
            {Array.from({ length: skeletonCards }, (_, i) => (
              <div key={i} className="zen-dash-card zen-dash-skeleton" />
            ))}
          </div>
          <div className="zen-dash-lists" aria-hidden="true">
            <div className="zen-dash-panel zen-dash-skeleton zen-dash-skeleton-panel" />
            <div className="zen-dash-panel zen-dash-skeleton zen-dash-skeleton-panel" />
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="zen-dash-failure">
          <Alert tone="warning">We could not load the dashboard.</Alert>
          <div>
            <Button variant="secondary" onClick={onRetry}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {state === "ready" && children}
    </div>
  );
}

interface CardProps {
  label: string;
  value: number;
  /** Where the card goes; without it the card is plain text (My Open Actions). */
  to?: string;
  hint?: string;
}

// The whole card is the link, and its accessible name carries the figure
// (ui-spec §3). A zero stays visible, only muted (BR-32).
export function DashCard({ label, value, to, hint }: CardProps) {
  const body = (
    <>
      <span className="zen-dash-card-label">{label}</span>
      <span className={value === 0 ? "zen-dash-card-value zen-dash-zero" : "zen-dash-card-value"}>{value}</span>
      {hint && <span className="zen-dash-card-hint">{hint}</span>}
    </>
  );
  if (!to) return <div className="zen-dash-card">{body}</div>;
  return (
    <Link to={to} className="zen-dash-card zen-dash-card-link" aria-label={`${label}: ${value}, view tickets`}>
      {body}
    </Link>
  );
}

export function DashSection({ title, viewAll, children }: { title: string; viewAll?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section className="zen-dash-panel" aria-label={title}>
      <div className="zen-dash-panel-head">
        <h2 className="zen-dash-panel-title">{title}</h2>
        {viewAll && (
          <Link to={viewAll.to} className="zen-dash-viewall" aria-label={`View all: ${title}`}>
            {viewAll.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

interface TicketRow {
  id: number;
  ticketNumber: string;
  summary: string;
  currentStatus: TicketStatus;
  itPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  updatedAt: string;
  owner?: { id: number; fullName: string } | null;
}

// Up to five Tickets as two-line rows: number, badges and date on top, summary
// below. `staff` rows show the owner and the IT Priority; Requester rows do not.
export function DashTicketList({ rows, hrefFor, staff, empty }: { rows: TicketRow[]; hrefFor: (id: number) => string; staff: boolean; empty: string }) {
  if (rows.length === 0) return <p className="zen-dash-empty">{empty}</p>;
  return (
    <ul className="zen-dash-rows">
      {rows.map((t) => (
        <li key={t.id} className="zen-dash-row">
          <div className="zen-dash-row-top">
            <Link to={hrefFor(t.id)} className="zen-dash-row-number">
              {t.ticketNumber}
            </Link>
            <StatusBadge status={t.currentStatus} />
            {staff && <PriorityBadge priority={t.itPriority} />}
            <span className="zen-dash-row-date">{formatDateTime(t.updatedAt)}</span>
          </div>
          <div className="zen-dash-row-summary">{t.summary}</div>
          {staff && <div className="zen-dash-row-owner">{t.owner ? t.owner.fullName : "Unassigned"}</div>}
        </li>
      ))}
    </ul>
  );
}
