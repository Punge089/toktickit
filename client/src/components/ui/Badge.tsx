import { ReactNode } from "react";

export type BadgeTone = "neutral" | "warning" | "error" | "secondary" | "success" | "primary";

interface BadgeProps {
  tone: BadgeTone;
  children: ReactNode;
}

// ui-spec.md §1/§3 — badges pair color with text; color is never the only
// signal (AC-18).
export function Badge({ tone, children }: BadgeProps) {
  return <span className={`zen-badge zen-badge-${tone}`}>{children}</span>;
}

const PRIORITY_TONE: Record<string, BadgeTone> = {
  LOW: "neutral",
  MEDIUM: "warning",
  HIGH: "error",
  URGENT: "error",
};

export function PriorityBadge({ priority }: { priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" }) {
  return <Badge tone={PRIORITY_TONE[priority]}>{priority}</Badge>;
}

// docs/lab-03/ui-spec.md §1 — the 8 Ticket statuses (Issue 63 extends
// TicketStatus beyond Lab 2's single NEW value). The finer outlined/
// struck-through treatment for Waiting for Requester/Reopened/Cancelled
// described there is added with the IT Staff screens (Issue 65/66); this
// gives every status a distinct, correct tone in the meantime so a
// Requester's own Tickets (which can already carry any status once IT
// Staff act on them) never render an unstyled badge.
export type TicketStatus =
  | "NEW"
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_FOR_REQUESTER"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED"
  | "CANCELLED";

const STATUS_TONE: Record<TicketStatus, BadgeTone> = {
  NEW: "neutral",
  OPEN: "secondary",
  IN_PROGRESS: "warning",
  WAITING_FOR_REQUESTER: "warning",
  RESOLVED: "success",
  CLOSED: "neutral",
  REOPENED: "error",
  CANCELLED: "neutral",
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: "New",
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_REQUESTER: "Waiting for Requester",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  CANCELLED: "Cancelled",
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function AttachmentStateBadge({ removed }: { removed: boolean }) {
  return <Badge tone={removed ? "neutral" : "success"}>{removed ? "Removed" : "Active"}</Badge>;
}

// docs/lab-03/ui-spec.md §1 — role badges shown in the application shell.
const ROLE_TONE: Record<string, BadgeTone> = {
  REQUESTER: "neutral",
  IT_STAFF: "secondary",
  ADMINISTRATOR: "primary",
};

const ROLE_LABEL: Record<string, string> = {
  REQUESTER: "Requester",
  IT_STAFF: "IT Staff",
  ADMINISTRATOR: "Administrator",
};

export function RoleBadge({ role }: { role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR" }) {
  return <Badge tone={ROLE_TONE[role]}>{ROLE_LABEL[role]}</Badge>;
}
