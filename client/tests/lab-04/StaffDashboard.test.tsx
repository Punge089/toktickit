import { describe, it, expect } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { AppRouter } from "../../src/AppRouter.js";

const API_URL = "http://localhost:3000";

const STAFF = { id: 8, fullName: "Jennifer Anderson", email: "j@example.dev", role: "IT_STAFF" as const, mustChangePassword: false };
const ADMIN = { id: 12, fullName: "John Smith", email: "john@example.dev", role: "ADMINISTRATOR" as const, mustChangePassword: false };

type Json = Record<string, unknown>;

const ticket = (id: number, over: Json = {}) => ({
  id,
  ticketNumber: `TKT-2026-0000${id}`,
  summary: `Summary of ticket ${id}`,
  currentStatus: "OPEN",
  itPriority: "URGENT",
  owner: { id: 6, fullName: "Michael Brown" },
  updatedAt: "2026-10-30T01:00:00.000Z",
  ...over,
});

const FULL: Json = {
  generatedAt: "2026-10-30T03:00:00.000Z",
  role: "IT_STAFF",
  statusCounts: { NEW: 14, OPEN: 23, IN_PROGRESS: 18, WAITING_FOR_REQUESTER: 7 },
  unassigned: 5,
  activeByPriority: { URGENT: 2, HIGH: 9, MEDIUM: 30, LOW: 21 },
  personal: { myAssigned: 16, myOpenActions: 4 },
  urgentTickets: [ticket(42, { summary: "VPN down for finance" })],
  recentTickets: [ticket(45, { summary: "Need new monitor", itPriority: "LOW", owner: null, currentStatus: "IN_PROGRESS" })],
  myActions: [
    { id: 14, ticketId: 42, ticketNumber: "TKT-2026-000042", description: "Check the VPN gateway logs.", actionAt: "2026-10-30T02:00:00.000Z", actionStatus: "IN_PROGRESS", followUpRequired: false },
  ],
  accounts: null,
};

const ZERO: Json = {
  generatedAt: "2026-10-30T03:00:00.000Z",
  role: "IT_STAFF",
  statusCounts: { NEW: 0, OPEN: 0, IN_PROGRESS: 0, WAITING_FOR_REQUESTER: 0 },
  unassigned: 0,
  activeByPriority: { URGENT: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
  personal: { myAssigned: 0, myOpenActions: 0 },
  urgentTickets: [],
  recentTickets: [],
  myActions: [],
  accounts: null,
};

const ADMIN_DATA: Json = {
  ...FULL,
  role: "ADMINISTRATOR",
  personal: null,
  myActions: null,
  accounts: { activeRequesters: 5, activeItStaff: 3, activeAdministrators: 1, inactive: 2 },
};

function renderDashboard(data: Json | (() => Response | Promise<Response>), user: typeof STAFF | typeof ADMIN = STAFF) {
  server.use(
    http.get(`${API_URL}/api/auth/me`, () => HttpResponse.json(user)),
    http.get(`${API_URL}/api/dashboard/staff`, typeof data === "function" ? data : () => HttpResponse.json(data)),
  );
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const card = (name: RegExp | string) => screen.getByRole("link", { name });

// docs/lab-04/tests.md UI-01 to UI-04 - specification.md FR-13, FR-14, BR-31, BR-32, BR-35; ui-spec.md §3.1, §3.3.
describe("IT Staff Dashboard", () => {
  it("UI-01: shows every card and list with the link targets of api-spec §8, and no Create Ticket control", async () => {
    renderDashboard(FULL);
    await screen.findByRole("link", { name: "New: 14, view tickets" }); // the title shows while loading, the cards do not
    expect(screen.getByRole("heading", { name: "Welcome back, Jennifer" })).toBeInTheDocument();

    const targets: Array<[string, string]> = [
      ["New: 14, view tickets", "/staff/queue?status=NEW"],
      ["Open: 23, view tickets", "/staff/queue?status=OPEN"],
      ["In Progress: 18, view tickets", "/staff/queue?status=IN_PROGRESS"],
      ["Waiting for Requester: 7, view tickets", "/staff/queue?status=WAITING_FOR_REQUESTER"],
      ["Unassigned: 5, view tickets", "/staff/queue?owner=unassigned&active=true"],
      ["My Assigned: 16, view tickets", "/staff/queue?owner=me&active=true"],
      ["Urgent: 2, view tickets", "/staff/queue?itPriority=URGENT&active=true"],
      ["High: 9, view tickets", "/staff/queue?itPriority=HIGH&active=true"],
      ["Medium: 30, view tickets", "/staff/queue?itPriority=MEDIUM&active=true"],
      ["Low: 21, view tickets", "/staff/queue?itPriority=LOW&active=true"],
    ];
    for (const [name, href] of targets) expect(card(name), name).toHaveAttribute("href", href);

    // My Open Actions is a figure, not a link: its rows below are the way in.
    expect(screen.getByText("My Open Actions", { selector: ".zen-dash-card-label" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /my open actions: 4/i })).not.toBeInTheDocument();
    expect(screen.getByText("listed below")).toBeInTheDocument();

    const urgent = screen.getByRole("region", { name: "Urgent and High Priority" });
    expect(within(urgent).getByRole("link", { name: "TKT-2026-000042" })).toHaveAttribute("href", "/staff/tickets/42");
    expect(within(urgent).getByText("VPN down for finance")).toBeInTheDocument();
    expect(within(urgent).getByText("Michael Brown")).toBeInTheDocument();
    expect(within(urgent).getByRole("link", { name: /view all/i })).toHaveAttribute("href", "/staff/queue?active=true");

    const recent = screen.getByRole("region", { name: "Recently Updated" });
    expect(within(recent).getByText("Unassigned")).toBeInTheDocument();
    expect(within(recent).getByRole("link", { name: /view all/i })).toHaveAttribute("href", "/staff/queue");

    const actions = screen.getByRole("region", { name: "My Open Actions" });
    expect(within(actions).getByText("Check the VPN gateway logs.")).toBeInTheDocument();
    expect(within(actions).getByRole("link", { name: "TKT-2026-000042" })).toHaveAttribute("href", "/staff/tickets/42?tab=actions");

    const quick = screen.getByRole("region", { name: "Quick Actions" });
    expect(within(quick).getByRole("link", { name: "Open Ticket Queue" })).toHaveAttribute("href", "/staff/queue");
    expect(within(quick).getByRole("link", { name: "My Queue" })).toHaveAttribute("href", "/staff/queue?owner=me&active=true");
    expect(screen.queryByRole("link", { name: /create ticket/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create ticket/i })).not.toBeInTheDocument();
  });

  it("UI-02: with no data every card shows 0 and each list shows its own message", async () => {
    renderDashboard(ZERO);
    await screen.findByRole("link", { name: "New: 0, view tickets" });
    for (const name of ["New: 0", "Open: 0", "In Progress: 0", "Waiting for Requester: 0", "Unassigned: 0", "My Assigned: 0", "Urgent: 0", "High: 0", "Medium: 0", "Low: 0"]) {
      expect(card(new RegExp(`^${name}, view tickets$`)), name).toBeInTheDocument();
    }
    expect(screen.getByText("No urgent tickets.")).toBeInTheDocument();
    expect(screen.getByText("No recent tickets.")).toBeInTheDocument();
    expect(screen.getByText("You have no open actions.")).toBeInTheDocument();
    expect(document.querySelectorAll(".zen-dash-zero").length).toBeGreaterThanOrEqual(10); // zeros are shown, in the muted style
  });

  it("UI-03: shows loading, then a failure callout with no figures, and Retry loads them", async () => {
    let calls = 0;
    renderDashboard(() => {
      calls += 1;
      return calls === 1 ? HttpResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 }) : HttpResponse.json(FULL);
    });
    expect(await screen.findByText("Loading dashboard…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();

    expect(await screen.findByText("We could not load the dashboard.")).toBeInTheDocument();
    expect(screen.queryByText("14")).not.toBeInTheDocument(); // no stale or partial numbers
    expect(screen.queryByRole("link", { name: /view tickets/i })).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: "New: 14, view tickets" })).toBeInTheDocument();
    expect(screen.queryByText("We could not load the dashboard.")).not.toBeInTheDocument();
  });

  it("UI-03: a failed Refresh keeps the figures on screen and warns", async () => {
    let calls = 0;
    renderDashboard(() => {
      calls += 1;
      return calls === 1 ? HttpResponse.json(FULL) : HttpResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
    });
    await screen.findByRole("link", { name: "New: 14, view tickets" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText(/could not refresh the dashboard/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New: 14, view tickets" })).toBeInTheDocument();
  });

  it("UI-04: the Administrator view has no personal cards, no My Queue and no My Open Actions, and links to Users", async () => {
    renderDashboard(ADMIN_DATA, ADMIN);
    await screen.findByRole("link", { name: "Unassigned: 5, view tickets" });
    expect(screen.getByRole("heading", { name: "Welcome back, John" })).toBeInTheDocument();
    expect(screen.getByText("Read-only view of the IT Staff dashboard.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /my assigned/i })).not.toBeInTheDocument();
    expect(screen.queryByText("My Open Actions")).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Quick Actions" })).queryByRole("link", { name: "My Queue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /create ticket/i })).not.toBeInTheDocument();

    const accounts = screen.getByRole("link", { name: /accounts/i });
    expect(accounts).toHaveAttribute("href", "/admin/users");
    expect(within(accounts).getByText("Active Requesters: 5")).toBeInTheDocument();
    expect(within(accounts).getByText("Active IT Staff: 3")).toBeInTheDocument();
    expect(within(accounts).getByText("Active Administrators: 1")).toBeInTheDocument();
    expect(within(accounts).getByText("Inactive: 2")).toBeInTheDocument();
    expect(card("Unassigned: 5, view tickets")).toBeInTheDocument(); // the shared figures remain
  });

  it("UI-03: a 403 from the API shows the Forbidden panel and no figures", async () => {
    renderDashboard(() => HttpResponse.json({ error: "FORBIDDEN" }, { status: 403 }));
    expect(await screen.findByRole("heading", { name: /access|forbidden|not allowed/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("link", { name: /view tickets/i })).not.toBeInTheDocument());
  });
});
