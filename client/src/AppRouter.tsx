import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/shell/AppShell.js";
import { RequireAuth } from "./components/shell/RequireAuth.js";
import { useAuth } from "./context/AuthContext.js";
import { homeRouteForRole } from "./lib/roleRoutes.js";
import { LoginPage } from "./pages/LoginPage.js";
import { ChangePasswordPage } from "./pages/ChangePasswordPage.js";
import { ForbiddenPage } from "./pages/ForbiddenPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { ComingSoonPage } from "./pages/ComingSoonPage.js";
import { StaffTicketQueuePage } from "./pages/StaffTicketQueuePage.js";
import { CreateTicketPage } from "./pages/CreateTicketPage.js";
import { MyTicketsPage } from "./pages/MyTicketsPage.js";
import { TicketDetailPage } from "./pages/TicketDetailPage.js";

// Issue 64 — replaces the Development Requester router. Every route
// except /login is guarded by RequireAuth (AC-09); "/" redirects to the
// current role's home route once the session is known (AC-01/AC-10).
export function AppRouter() {
  const { status, user } = useAuth();

  return (
    <AppShell>
      <Routes>
        <Route
          path="/"
          element={
            status === "loading" ? null : <Navigate to={homeRouteForRole(user?.role)} replace />
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/change-password"
          element={
            <RequireAuth>
              <ChangePasswordPage />
            </RequireAuth>
          }
        />
        <Route path="/forbidden" element={<ForbiddenPage />} />

        <Route
          path="/tickets/new"
          element={
            <RequireAuth roles={["REQUESTER"]}>
              <CreateTicketPage />
            </RequireAuth>
          }
        />
        <Route
          path="/tickets"
          element={
            <RequireAuth roles={["REQUESTER"]}>
              <MyTicketsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/tickets/:id"
          element={
            <RequireAuth roles={["REQUESTER"]}>
              <TicketDetailPage />
            </RequireAuth>
          }
        />

        {/* IT Staff Ticket Queue (Issue 65). Administrator may read it too
            (BR-36) but has no nav link: their home is User Management. */}
        <Route
          path="/staff/queue"
          element={
            <RequireAuth roles={["IT_STAFF", "ADMINISTRATOR"]}>
              <StaffTicketQueuePage />
            </RequireAuth>
          }
        />
        {/* Placeholder until Issue 66 ships the real Staff Ticket Detail. */}
        <Route
          path="/staff/tickets/:id"
          element={
            <RequireAuth roles={["IT_STAFF", "ADMINISTRATOR"]}>
              <ComingSoonPage title="Ticket Detail" />
            </RequireAuth>
          }
        />
        {/* Placeholder until Issue 67 ships User Management. */}
        <Route
          path="/admin/users"
          element={
            <RequireAuth roles={["ADMINISTRATOR"]}>
              <ComingSoonPage title="Users" />
            </RequireAuth>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}
