import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { TicketDetailPage } from "../../src/pages/TicketDetailPage.js";

const API_URL = "http://localhost:3000";

// Issue 64 (REG) — session-authenticated instead of a sessionStorage-based
// Requester selection; the mocked /api/auth/me handler in msw/handlers.ts
// supplies the identity.
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Requester Ticket Detail screen", () => {
  it("shows the owned ticket's header fields and attachments", async () => {
    renderAt("/tickets/1");
    expect(await screen.findByRole("heading", { name: "TKT-2026-000001" })).toBeInTheDocument();
    expect(screen.getByText("Laptop battery drains quickly")).toBeInTheDocument();
    expect(screen.getByText("battery-log.pdf")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  // UI-12 (adapted) — Lab 2 exercised this by switching the sessionStorage
  // Requester; identity is fixed for the session now, so this proves the
  // same not-found behavior via a ticket id that isn't owned by whoever
  // the (mocked) session belongs to, matching the real endpoint's
  // not-found-vs-not-owned indistinguishability (BR-10/BR-28).
  it("shows 'Ticket not found' with a link back for a ticket not owned by the session", async () => {
    server.use(
      http.get(`${API_URL}/api/tickets/:id`, () =>
        HttpResponse.json({ error: "TICKET_NOT_FOUND", message: "Ticket not found." }, { status: 404 }),
      ),
    );
    renderAt("/tickets/1");
    expect(await screen.findByText("Ticket not found.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to my tickets/i })).toHaveAttribute("href", "/tickets");
  });

  it("shows the identical 'Ticket not found' message for a nonexistent ticket id", async () => {
    renderAt("/tickets/999999");
    expect(await screen.findByText("Ticket not found.")).toBeInTheDocument();
  });
});
