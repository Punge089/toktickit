import { useCallback, useEffect, useState } from "react";
import { DashboardForbiddenError } from "../../api/dashboard.js";

export type DashboardState = "loading" | "ready" | "error" | "forbidden";

// Loads one dashboard. The first load shows skeletons; a later refresh keeps
// the figures on screen and only shows a callout if it fails (ui-spec §3.3), so
// a failed refresh never blanks numbers the user is reading, and a failed first
// load never leaves stale numbers behind.
export function useDashboard<T>(fetcher: () => Promise<T>) {
  const [state, setState] = useState<DashboardState>("loading");
  const [data, setData] = useState<T | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);

  const load = useCallback(
    async (firstLoad: boolean) => {
      if (firstLoad) {
        setState("loading");
        setData(null);
      } else {
        setRefreshing(true);
      }
      setRefreshFailed(false);
      try {
        const next = await fetcher();
        setData(next);
        setState("ready");
      } catch (err) {
        if (err instanceof DashboardForbiddenError) setState("forbidden");
        else if (firstLoad) setState("error");
        else setRefreshFailed(true);
      } finally {
        setRefreshing(false);
      }
    },
    [fetcher],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  return {
    state,
    data,
    refreshing,
    refreshFailed,
    retry: () => load(true),
    refresh: () => load(false),
  };
}
