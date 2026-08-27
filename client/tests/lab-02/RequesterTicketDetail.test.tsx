import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import { TicketDetailPage } from "../../src/pages/TicketDetailPage.js";

function renderAt(path: string, requester = { id: 1, fullName: "Aran Suksawat" }) {
  sessionStorage.setItem("toktickit:lab2:selectedRequester", JSON.stringify(requester));
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RequesterProvider>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>,
  );
}

describe("Requester Ticket Detail screen", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("shows the owned ticket's header fields and attachments", async () => {
    renderAt("/tickets/1");
    expect(await screen.findByRole("heading", { name: "TKT-2026-000001" })).toBeInTheDocument();
    expect(screen.getByText("Laptop battery drains quickly")).toBeInTheDocument();
    expect(screen.getByText("battery-log.pdf")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  // UI-12
  it("shows 'Ticket not found' with a link back for another Requester's ticket", async () => {
    renderAt("/tickets/1", { id: 2, fullName: "Buppha Ratanakorn" });
    expect(await screen.findByText("Ticket not found.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to my tickets/i })).toHaveAttribute("href", "/tickets");
  });

  it("shows the identical 'Ticket not found' message for a nonexistent ticket id", async () => {
    renderAt("/tickets/999999");
    expect(await screen.findByText("Ticket not found.")).toBeInTheDocument();
  });
});
