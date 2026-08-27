import { ReactNode } from "react";

export type AlertTone = "error" | "warning" | "success";

interface AlertProps {
  tone: AlertTone;
  children: ReactNode;
}

const ICON: Record<AlertTone, string> = {
  error: "⚠",
  warning: "▲",
  success: "✓",
};

// ui-spec.md §1 — every error/warning/success state carries an icon and
// text, never color alone.
export function Alert({ tone, children }: AlertProps) {
  return (
    <div className={`zen-alert zen-alert-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span aria-hidden="true">{ICON[tone]}</span>
      <div>{children}</div>
    </div>
  );
}
