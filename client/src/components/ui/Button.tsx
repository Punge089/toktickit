import { ButtonHTMLAttributes, forwardRef } from "react";

// Issue 23 — Zen Green button hierarchy (ui-spec.md §3).
// Busy state replaces the label with a spinner + text and disables the
// button, so a Requester cannot double-submit while a request is in flight.
export type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  busy?: boolean;
  busyText?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", busy = false, busyText = "Working…", disabled, className = "", children, ...rest },
  ref,
) {
  const classes = ["zen-btn", `zen-btn-${variant}`, busy ? "zen-btn-busy" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button ref={ref} type="button" className={classes} disabled={disabled || busy} {...rest}>
      {busy ? (
        <>
          <span className="zen-spinner" aria-hidden="true" />
          {busyText}
        </>
      ) : (
        children
      )}
    </button>
  );
});
