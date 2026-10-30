import { useCallback, useEffect, useState } from "react";
import { ActionItem, ActionsResult, fetchActions } from "../../api/actions.js";

export type ActionsLoadState = "loading" | "ready" | "error";

// Loads the Actions of one Ticket (GET /api/tickets/:id/actions). `reload`
// refreshes in place, without going back to "loading", so a list the user is
// looking at (or editing beside) does not flicker or lose its place.
export function useActions(ticketId: number | null) {
  const [state, setState] = useState<ActionsLoadState>("loading");
  const [result, setResult] = useState<ActionsResult>({ items: [], counts: { open: 0, completed: 0, cancelled: 0 } });

  const load = useCallback(
    async (showLoading: boolean): Promise<ActionItem[] | null> => {
      if (ticketId === null) return null;
      if (showLoading) setState("loading");
      try {
        const next = await fetchActions(ticketId);
        setResult(next);
        setState("ready");
        return next.items;
      } catch {
        setState("error");
        return null;
      }
    },
    [ticketId],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  const retry = useCallback(() => load(true), [load]);
  const reload = useCallback(() => load(false), [load]);

  return { state, items: result.items, counts: result.counts, retry, reload };
}
