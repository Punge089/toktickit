import { createContext, ReactNode, useCallback, useContext, useState } from "react";

// Issue 25 — BR-05/BR-08: the Development Requester selection is a Lab 2
// testing mechanism, not authentication. It lives in sessionStorage (not
// localStorage, not a cookie) so it resets per tab/session instead of
// surviving a browser restart like a real login would.
const STORAGE_KEY = "toktickit:lab2:selectedRequester";

export interface SelectedRequester {
  id: number;
  fullName: string;
}

interface RequesterContextValue {
  requester: SelectedRequester | null;
  selectRequester: (requester: SelectedRequester) => void;
  clearRequester: () => void;
}

const RequesterContext = createContext<RequesterContextValue | undefined>(undefined);

function readStoredRequester(): SelectedRequester | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.id === "number" && typeof parsed?.fullName === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function RequesterProvider({ children }: { children: ReactNode }) {
  const [requester, setRequester] = useState<SelectedRequester | null>(readStoredRequester);

  const selectRequester = useCallback((next: SelectedRequester) => {
    setRequester(next);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const clearRequester = useCallback(() => {
    setRequester(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <RequesterContext.Provider value={{ requester, selectRequester, clearRequester }}>
      {children}
    </RequesterContext.Provider>
  );
}

export function useRequester(): RequesterContextValue {
  const ctx = useContext(RequesterContext);
  if (!ctx) {
    throw new Error("useRequester must be used within a RequesterProvider");
  }
  return ctx;
}
