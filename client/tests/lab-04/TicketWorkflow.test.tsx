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

// The final Ticket status matrix (specification §5), written out independently
// of the server so the screen is checked against the documented table.
const MATRIX: Record<string, string[]> = {
  NEW: ["OPEN", "IN_PROGRESS", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  CLOSED: [],
  CANCELLED: [],
};
const LABEL: Record<string, string> = {
  NEW: "New",
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_REQUESTER: "Waiting for Requester",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  CANCELLED: "Cancelled",
};

function ticket(over: Record<string, unknown> = {}) {
  const status = (over.currentStatus as string) ?? "OPEN";
  return {
    id: 5,
    ticketNumber: "TKT-2026-000005",
    requesterId: 1,
    requesterName: "Aran Suksawat",
    summary: "Laptop battery drains quickly",
    description: "The battery drains within two hours.",
    categoryName: "Hardware",
    relatedSystemName: "Corporate Laptop",
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    currentStatus: status,
    allowedTransitions: MATRIX[status],
    version: 4,
    actionCounts: { open: 0, completed: 1, cancelled: 0 },
    resolutionBlockers: [],
    ownerId: 8,
    ownerName: "Jennifer Anderson",
    ownerIsActive: true,
    resolutionSummary: null,
    requesterResolvedAt: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-02T10:00:00.000Z",
    attachments: [],
    ...over,
  };
}

function renderDetail(initial: Record<string, unknown> = {}, onGet?: () => Record<string, unknown>) {
  server.use(
    http.get(`${API_URL}/api/auth/me`, () => HttpResponse.json(STAFF)),
    http.get(`${API_URL}/api/staff/tickets/:id`, () => HttpResponse.json(onGet ? onGet() : ticket(initial))),
    http.get(`${API_URL}/api/tickets/:id/comments`, () => HttpResponse.json([])),
    http.get(`${API_URL}/api/staff/tickets/:id/notes`, () => HttpResponse.json([])),
    http.get(`${API_URL}/api/staff/assignable-users`, () =>
      HttpResponse.json([
        { id: 8, fullName: "Jennifer Anderson" },
        { id: 9, fullName: "Michael Brown" },
      ]),
    ),
  );
  return render(
    <MemoryRouter initialEntries={["/staff/tickets/5"]}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const staleReply = () =>
  HttpResponse.json(
    { error: "STALE_VERSION", message: "This ticket was changed by someone else. Reload to see the latest version.", currentVersion: 5 },
    { status: 409 },
  );

// docs/lab-04/tests.md UI-19..UI-22 - specification.md BR-17, BR-20, BR-26,
// FR-06, FR-07, FR-11; ui-spec.md "Workflow controls".
describe("IT Staff Ticket workflow controls", () => {
  it("UI-19: offers only the current status and the allowed targets, in matrix order, for every status", async () => {
    for (const status of Object.keys(MATRIX)) {
      const view = renderDetail({ currentStatus: status });
      const header = await screen.findByRole("heading", { name: "TKT-2026-000005" });
      expect(header).toBeInTheDocument();
      if (MATRIX[status].length === 0) {
        expect(screen.queryByLabelText("Current Status")).not.toBeInTheDocument();
      } else {
        const options = within(await screen.findByLabelText("Current Status")).getAllByRole("option").map((o) => o.textContent);
        expect(options, status).toEqual([`${LABEL[status]} (current)`, ...MATRIX[status].map((s) => LABEL[s])]);
      }
      view.unmount();
    }
  });

  it("UI-20: explains why Resolved is unavailable and disables Update status while blockers exist", async () => {
    const user = userEvent.setup();
    renderDetail({ resolutionBlockers: ["OPEN_ACTIONS", "NO_COMPLETED_ACTION"], actionCounts: { open: 2, completed: 0, cancelled: 0 } });
    await user.selectOptions(await screen.findByLabelText("Current Status"), "RESOLVED");

    expect(screen.getByText(/resolved is not available yet/i)).toBeInTheDocument();
    expect(screen.getByText(/finish or cancel 2 open actions/i)).toBeInTheDocument();
    expect(screen.getByText(/complete at least one action/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update status/i })).toBeDisabled();

    // The message links to the Actions Taken tab, where the open Actions are dealt with.
    await user.click(screen.getByRole("button", { name: "Open Actions Taken" }));
    expect(screen.getByRole("tab", { name: /^Actions Taken/ })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("button", { name: "Add Action" })).toBeInTheDocument();

    // Other targets are unaffected.
    await user.selectOptions(screen.getByLabelText("Current Status"), "WAITING_FOR_REQUESTER");
    expect(screen.queryByText(/resolved is not available yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update status/i })).toBeEnabled();
  });

  it("UI-20: shows the server's reasons when it answers RESOLUTION_BLOCKED, and refreshes the blockers", async () => {
    let reads = 0;
    const user = userEvent.setup();
    renderDetail({}, () => {
      reads += 1;
      return ticket(reads > 1 ? { resolutionBlockers: ["OPEN_ACTIONS"], actionCounts: { open: 1, completed: 1, cancelled: 0 } } : {});
    });
    server.use(
      http.patch(`${API_URL}/api/staff/tickets/:id/status`, () =>
        HttpResponse.json(
          { error: "RESOLUTION_BLOCKED", message: "Finish or cancel the open actions.", blockers: ["OPEN_ACTIONS"], openActionIds: [14] },
          { status: 409 },
        ),
      ),
    );
    await user.selectOptions(await screen.findByLabelText("Current Status"), "RESOLVED");
    await user.type(screen.getByLabelText(/resolution summary/i), "Replaced the battery.");
    await user.click(screen.getByRole("button", { name: /update status/i }));

    expect(await screen.findByText(/this ticket cannot be resolved yet/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /update status/i })).toBeDisabled());
    expect(screen.getByLabelText(/resolution summary/i)).toHaveValue("Replaced the battery."); // input kept
  });

  it("UI-21: replaces the header status and the version from a successful status change, without reloading", async () => {
    const bodies: Record<string, unknown>[] = [];
    let gets = 0;
    server.use(
      http.patch(`${API_URL}/api/staff/tickets/:id/status`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        bodies.push(body);
        return HttpResponse.json(ticket({ currentStatus: "IN_PROGRESS", version: 5 + bodies.length - 1 }));
      }),
    );
    const user = userEvent.setup();
    renderDetail({}, () => {
      gets += 1;
      return ticket();
    });
    const heading = await screen.findByRole("heading", { name: "TKT-2026-000005" });
    const headerRow = heading.parentElement as HTMLElement;
    expect(within(headerRow).getByText("Open")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Current Status"), "IN_PROGRESS");
    await user.click(screen.getByRole("button", { name: /update status/i }));
    expect(await within(headerRow).findByText("In Progress")).toBeInTheDocument();
    expect(within(await screen.findByLabelText("Current Status")).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "In Progress (current)",
      "Waiting for Requester",
      "Resolved",
      "Cancelled",
    ]);
    expect(gets).toBe(1);

    // The next change carries the version the response returned.
    await user.selectOptions(screen.getByLabelText("Current Status"), "WAITING_FOR_REQUESTER");
    await user.click(screen.getByRole("button", { name: /update status/i }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies.map((b) => b.expectedVersion)).toEqual([4, 5]);
  });

  it("UI-22: a stale owner, priority or status change shows one banner, keeps the chosen value, and Reload latest clears it", async () => {
    let current = ticket();
    server.use(
      http.patch(`${API_URL}/api/staff/tickets/:id/owner`, staleReply),
      http.patch(`${API_URL}/api/staff/tickets/:id/it-priority`, staleReply),
      http.patch(`${API_URL}/api/staff/tickets/:id/status`, staleReply),
    );
    const user = userEvent.setup();
    renderDetail({}, () => current);

    await user.selectOptions(await screen.findByLabelText("Ticket Owner"), "9");
    expect(await screen.findByText(/changed by someone else/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Ticket Owner")).toHaveValue("9"); // the choice stays visible

    await user.selectOptions(screen.getByLabelText("IT Priority"), "URGENT");
    expect(screen.getByLabelText("IT Priority")).toHaveValue("URGENT");
    expect(screen.getAllByText(/changed by someone else/i)).toHaveLength(1);

    await user.selectOptions(screen.getByLabelText("Current Status"), "RESOLVED");
    await user.type(screen.getByLabelText(/resolution summary/i), "Replaced the battery.");
    await user.click(screen.getByRole("button", { name: /update status/i }));
    await waitFor(() => expect(screen.getByLabelText("Current Status")).toHaveValue("RESOLVED"));
    expect(screen.getByLabelText(/resolution summary/i)).toHaveValue("Replaced the battery.");

    // Someone else has since moved the Ticket on; Reload latest shows it and keeps the typed summary.
    current = ticket({ version: 5, itPriority: "HIGH", ownerId: 9, ownerName: "Michael Brown" });
    await user.click(screen.getByRole("button", { name: /reload latest/i }));
    await waitFor(() => expect(screen.queryByText(/changed by someone else/i)).not.toBeInTheDocument());
    expect(screen.getByLabelText("IT Priority")).toHaveValue("HIGH");
    expect(screen.getByLabelText("Ticket Owner")).toHaveValue("9");
    expect(screen.getByLabelText(/resolution summary/i)).toHaveValue("Replaced the battery.");
  });

  it("UI-23: cancelling a Ticket with open Actions says they will be cancelled too, and sends nothing until confirmed", async () => {
    let patched = 0;
    let actionReads = 0;
    server.use(
      http.patch(`${API_URL}/api/staff/tickets/:id/status`, () => {
        patched += 1;
        return HttpResponse.json(ticket({ currentStatus: "CANCELLED", version: 5 }));
      }),
      http.get(`${API_URL}/api/tickets/:id/actions`, () => {
        actionReads += 1;
        return HttpResponse.json({ items: [], counts: { open: 0, completed: 0, cancelled: 0 } });
      }),
    );
    const user = userEvent.setup();
    renderDetail({ actionCounts: { open: 2, completed: 0, cancelled: 0 } });
    await user.selectOptions(await screen.findByLabelText("Current Status"), "CANCELLED");
    await user.click(screen.getByRole("button", { name: /update status/i }));
    const dialog = await screen.findByRole("alertdialog", { name: /confirm status change/i });
    expect(dialog).toHaveTextContent(/open actions on this ticket will be cancelled/i);
    expect(patched).toBe(0);
    await waitFor(() => expect(actionReads).toBeGreaterThanOrEqual(1)); // the list was read when the page opened
    const before = actionReads;
    await user.click(screen.getByRole("button", { name: /^confirm$/i }));
    await waitFor(() => expect(patched).toBe(1));
    // The server cancelled the open Actions with the Ticket, so the list is read again.
    await waitFor(() => expect(actionReads).toBeGreaterThan(before));
  });
});
