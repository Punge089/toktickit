import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/shell/AppShell.js";
import { RequesterSelectPage } from "./pages/RequesterSelectPage.js";
import { CreateTicketPage } from "./pages/CreateTicketPage.js";
import { MyTicketsPage } from "./pages/MyTicketsPage.js";
import { TicketDetailPage } from "./pages/TicketDetailPage.js";

// Issue 23 — router skeleton for the 4 Lab 2 screens. The route guard that
// redirects to /select-requester when no Development Requester is selected
// (AC-02) is wired in Issue 25 once the real Requester context exists.
export function AppRouter() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/select-requester" replace />} />
        <Route path="/select-requester" element={<RequesterSelectPage />} />
        <Route path="/tickets/new" element={<CreateTicketPage />} />
        <Route path="/tickets" element={<MyTicketsPage />} />
        <Route path="/tickets/:id" element={<TicketDetailPage />} />
      </Routes>
    </AppShell>
  );
}
