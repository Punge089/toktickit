import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AppShell } from "./components/shell/AppShell.js";
import { RequireRequester } from "./components/shell/RequireRequester.js";
import { useRequester } from "./context/RequesterContext.js";
import { RequesterSelectPage } from "./pages/RequesterSelectPage.js";
import { CreateTicketPage } from "./pages/CreateTicketPage.js";
import { MyTicketsPage } from "./pages/MyTicketsPage.js";
import { TicketDetailPage } from "./pages/TicketDetailPage.js";

// Issue 23/25 — router + app shell. Every route except /select-requester is
// guarded by RequireRequester (AC-02). The shell's Requester display and
// Change Requester action are wired to the real RequesterContext here.
export function AppRouter() {
  const { requester, clearRequester } = useRequester();
  const navigate = useNavigate();

  function handleChangeRequester() {
    clearRequester();
    navigate("/select-requester");
  }

  return (
    <AppShell requesterName={requester?.fullName ?? null} onChangeRequester={handleChangeRequester}>
      <Routes>
        <Route
          path="/"
          element={<Navigate to={requester ? "/tickets" : "/select-requester"} replace />}
        />
        <Route path="/select-requester" element={<RequesterSelectPage />} />
        <Route
          path="/tickets/new"
          element={
            <RequireRequester>
              <CreateTicketPage />
            </RequireRequester>
          }
        />
        <Route
          path="/tickets"
          element={
            <RequireRequester>
              <MyTicketsPage />
            </RequireRequester>
          }
        />
        <Route
          path="/tickets/:id"
          element={
            <RequireRequester>
              <TicketDetailPage />
            </RequireRequester>
          }
        />
      </Routes>
    </AppShell>
  );
}
