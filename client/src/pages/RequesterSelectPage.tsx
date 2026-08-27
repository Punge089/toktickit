import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchActiveRequesters, DevRequester } from "../api/requesters.js";
import { useRequester } from "../context/RequesterContext.js";
import { Select } from "../components/ui/Select.js";
import { Button } from "../components/ui/Button.js";
import { Alert } from "../components/ui/Alert.js";
import { Spinner } from "../components/ui/Spinner.js";

type ScreenState = "loading" | "loaded" | "empty" | "error";

// Issue 25 — ui-spec.md §5: loading/loaded/empty/failure states, keyboard-
// accessible native <select>, Continue disabled until a choice is made.
export function RequesterSelectPage() {
  const [state, setState] = useState<ScreenState>("loading");
  const [requesters, setRequesters] = useState<DevRequester[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const { selectRequester } = useRequester();
  const navigate = useNavigate();

  const load = useCallback(() => {
    setState("loading");
    fetchActiveRequesters()
      .then((list) => {
        setRequesters(list);
        setState(list.length === 0 ? "empty" : "loaded");
      })
      .catch(() => setState("error"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleContinue() {
    const chosen = requesters.find((r) => String(r.id) === selectedId);
    if (!chosen) return;
    selectRequester({ id: chosen.id, fullName: chosen.fullName });
    navigate("/tickets");
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <h1 style={{ fontSize: "var(--zen-fs-h1)" }}>TokTickIT</h1>
      <p style={{ color: "var(--zen-text-muted)" }}>
        Select a Development Requester to test requester-specific ticket behavior. This is not a
        login screen. Authentication and role-based access will be introduced in Lab 3.
      </p>

      {state === "loading" && <Spinner label="Loading Development Requesters…" />}

      {state === "error" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--zen-space-3)" }}>
          <Alert tone="error">Unable to load Development Requesters.</Alert>
          <Button variant="secondary" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      {state === "empty" && (
        <Alert tone="warning">
          No active Development Requesters are available. Ask your instructor to check the seed
          data.
        </Alert>
      )}

      {state === "loaded" && (
        <>
          <Select
            label="Development Requester"
            required
            placeholder="Choose a Development Requester"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            options={requesters.map((r) => ({
              value: String(r.id),
              label: `${r.fullName} (${r.email})`,
            }))}
          />
          <Button variant="primary" disabled={!selectedId} onClick={handleContinue}>
            Continue
          </Button>
        </>
      )}
    </div>
  );
}
