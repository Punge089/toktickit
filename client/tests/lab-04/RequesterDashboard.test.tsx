import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { AppRouter } from "../../src/AppRouter.js";

const API_URL = "http://localhost:3000";
const REQUESTER = { id: 1, fullName: "Aran Suksawat", email: "a@example.dev", role: "REQUESTER" as const, mustChangePassword: false };

type Json = Record<string, unknown>;

const row = (id: number, over: Json = {}) => ({
  id,
  ticketNumber: `TKT-2026-0000${id}`,
  summary: `Summary of ticket ${id}`,
  currentStatus: "OPEN",
  itPriority: "MEDIUM",
  updatedAt: "2026-10-29T08:00:00.000Z",
  ...over,
});

const DATA: Json = {
  generatedAt: "2026-10-30T03:00:00.000Z",
  metrics: { openTickets: 3, waitingForYou: 1, resolved: 5, closed: 12 },
  attention: [row(42, { summary: "Laptop battery drains quickly", currentStatus: "WAITING_FOR_REQUESTER" })],
  recent: [row(45, { summary: "Need new monitor", currentStatus: "IN_PROGRESS" }), row(42, { summary: "Laptop battery drains quickly", currentStatus: "WAITING_FOR_REQUESTER" })],
};

const EMPTY: Json = {
  generatedAt: "2026-10-30T03:00:00.000Z",
  metrics: { openTickets: 0, waitingForYou: 0, resolved: 0, closed: 0 },
  attention: [],
  recent: [],
};

function renderDashboard(data: Json | (() => Response | Promise<Response>)) {
  server.use(
    http.get(`${API_URL}/api/auth/me`, () => HttpResponse.json(REQUESTER)),
    http.get(`${API_URL}/api/dashboard/requester`, typeof data === "function" ? data : () => HttpResponse.json(data)),
  );
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </MemoryRouter>,
  );
}

// docs/lab-04/tests.md UI-05, UI-06 - specification.md FR-12, BR-29, BR-32, BR-35; ui-spec.md §3.2, §3.3.
describe("Requester Dashboard", () => {
  it("UI-05: shows four cards that open the matching My Tickets views, and the two lists", async () => {
    renderDashboard(DATA);
    await screen.findByRole("link", { name: "Open Tickets: 3, view tickets" });
    expect(screen.getByRole("heading", { name: "Welcome back, Aran" })).toBeInTheDocument();

    const targets: Array<[string, string]> = [
      ["Open Tickets: 3, view tickets", "/tickets?active=true"],
      ["Waiting for You: 1, view tickets", "/tickets?status=WAITING_FOR_REQUESTER"],
      ["Resolved: 5, view tickets", "/tickets?status=RESOLVED"],
      ["Closed: 12, view tickets", "/tickets?status=CLOSED"],
    ];
    for (const [name, href] of targets) expect(screen.getByRole("link", { name }), name).toHaveAttribute("href", href);

    const attention = screen.getByRole("region", { name: "Needs Your Attention" });
    expect(within(attention).getByRole("link", { name: "TKT-2026-000042" })).toHaveAttribute("href", "/tickets/42");
    expect(within(attention).getByText("Laptop battery drains quickly")).toBeInTheDocument();

    const recent = screen.getByRole("region", { name: "Recently Updated" });
    expect(within(recent).getAllByRole("listitem")).toHaveLength(2);
    expect(within(recent).getByRole("link", { name: /view all/i })).toHaveAttribute("href", "/tickets");

    const quick = screen.getByRole("region", { name: "Quick Actions" });
    expect(within(quick).getByRole("link", { name: "Create Ticket" })).toHaveAttribute("href", "/tickets/new");
    expect(within(quick).getByRole("link", { name: "View My Tickets" })).toHaveAttribute("href", "/tickets");
    // A Requester never sees an IT Staff figure.
    expect(screen.queryByText(/unassigned|my assigned|my open actions/i)).not.toBeInTheDocument();
  });

  it("UI-05: with no tickets each list says so and every card shows 0", async () => {
    renderDashboard(EMPTY);
    await screen.findByRole("link", { name: "Open Tickets: 0, view tickets" });
    for (const name of ["Waiting for You: 0", "Resolved: 0", "Closed: 0"]) {
      expect(screen.getByRole("link", { name: `${name}, view tickets` })).toBeInTheDocument();
    }
    expect(screen.getByText("Nothing needs your attention right now.")).toBeInTheDocument();
    expect(screen.getByText("You have no tickets yet. Create one to get started.")).toBeInTheDocument();
  });

  it("UI-06: shows loading, then a failure callout with no figures, and Retry loads them", async () => {
    let calls = 0;
    renderDashboard(() => {
      calls += 1;
      return calls === 1 ? HttpResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 }) : HttpResponse.json(DATA);
    });
    expect(await screen.findByText("Loading dashboard…")).toBeInTheDocument();
    expect(await screen.findByText("We could not load the dashboard.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /view tickets/i })).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: "Open Tickets: 3, view tickets" })).toBeInTheDocument();
  });
});
