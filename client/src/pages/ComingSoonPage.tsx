// Issue 64 — minimal placeholder so an IT Staff/Administrator home route
// exists and never dead-ends into Forbidden/Not Found. Replaced by the
// real IT Staff Ticket Queue in Issue 65 and Administrator User
// Management in Issue 67.
export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div>
      <h1 style={{ fontSize: "var(--zen-fs-h1)" }}>{title}</h1>
      <p style={{ color: "var(--zen-text-muted)" }}>This screen is not built yet in this sprint.</p>
    </div>
  );
}
