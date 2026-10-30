import { useActions } from "./useActions.js";
import { ActionList } from "./ActionList.js";
import { Alert } from "../ui/Alert.js";
import { Button } from "../ui/Button.js";
import { Spinner } from "../ui/Spinner.js";

// Lab 4 ui-spec.md §5: the Requester sees every Action of their own Ticket,
// every field, and no write control (BR-10). The Ticket is already known to be
// theirs, so a 404 here is just "could not load".
export function RequesterActions({ ticketId }: { ticketId: number }) {
  const { state, items, retry } = useActions(ticketId);

  return (
    <section aria-labelledby="requester-actions-heading">
      <h2 id="requester-actions-heading" style={{ fontSize: "var(--zen-fs-h2)" }}>
        Actions Taken
      </h2>
      {state === "loading" && <Spinner label="Loading actions…" />}
      {state === "error" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--zen-space-3)" }}>
          <Alert tone="error">Unable to load the actions on this ticket. Please try again.</Alert>
          <div>
            <Button variant="secondary" onClick={() => void retry()}>
              Retry
            </Button>
          </div>
        </div>
      )}
      {state === "ready" &&
        (items.length === 0 ? (
          <p style={{ color: "var(--zen-text-muted)" }}>No actions recorded yet.</p>
        ) : (
          <ActionList items={items} variant="requester" />
        ))}
    </section>
  );
}
