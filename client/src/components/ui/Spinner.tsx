interface SpinnerProps {
  label?: string;
}

// Standalone loading indicator (distinct from Button's inline busy spinner)
// for whole-screen/section loading states.
export function Spinner({ label = "Loading…" }: SpinnerProps) {
  return (
    <div role="status" style={{ display: "flex", alignItems: "center", gap: "var(--zen-space-2)" }}>
      <span className="zen-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
