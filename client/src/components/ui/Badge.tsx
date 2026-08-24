import { ReactNode } from "react";

export type BadgeTone = "neutral" | "warning" | "error" | "secondary" | "success";

interface BadgeProps {
  tone: BadgeTone;
  children: ReactNode;
}

// ui-spec.md §3 — badges pair color with text; color is never the only
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

export function StatusBadge({ status }: { status: "NEW" }) {
  return <Badge tone="secondary">{status}</Badge>;
}

export function AttachmentStateBadge({ removed }: { removed: boolean }) {
  return <Badge tone={removed ? "neutral" : "success"}>{removed ? "Removed" : "Active"}</Badge>;
}
