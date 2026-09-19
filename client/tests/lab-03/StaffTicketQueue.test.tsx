import { describe, it, expect } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { AppRouter } from "../../src/AppRouter.js";

const API_URL = "http://localhost:3000";

const IT_STAFF = {
  id: 8,
  fullName: "Jennifer Anderson",
  email: "jennifer.anderson@example.dev",
  role: "IT_STAFF" as const,
  mustChangePassword: false,
};

const filters = (over: Record<string, string | number | null> = {}) => ({
  search: null,
  status: null,
  itPriority: null,
  categoryId: null,
  owner: null,
  ...over,
});

const row = (over: Record<string, unknown> = {}) => ({
  id: 1,
  ticketNumber: "TKT-2026-000001",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-02T10:00:00.000Z",
  summary: "Laptop battery drains quickly",
  categoryName: "Hardware",
  requestedPriority: "MEDIUM",
  itPriority: "HIGH",
  currentStatus: "IN_PROGRESS",
  owner: { id: 9, fullName: "Michael Brown", isActive: true },
  requesterName: "Aran Suksawat",
  requesterResolvedAt: null,
  ...over,
});

function page(items: unknown[], over: Record<string, unknown> = {}) {
  return {
    items,
    page: 1,
    pageSize: 10,
    totalItems: items.length,
    totalPages: 1,
    sort: "createdAt:desc",
    appliedFilters: filters(),
    ...over,
  };
}

function renderQueue() {
  server.use(http.get(`${API_URL}/api/auth/me`, () => HttpResponse.json(IT_STAFF)));
  return render(
    <MemoryRouter initialEntries={["/staff/queue"]}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </MemoryRouter>,
  );
}

// docs/lab-03/tests.md UI-08, UI-09 — specification.md AC-23; ui-spec.md §7.
describe("IT Staff Ticket Queue screen", () => {
  it("lists tickets with ownership, both priorities, status, and an Open link", async () => {
    server.use(
      http.get(`${API_URL}/api/staff/tickets`, () =>
        HttpResponse.json(
          page([
            row(),
            row({ id: 2, ticketNumber: "TKT-2026-000002", owner: null, currentStatus: "NEW", summary: "Second one" }),
            row({ id: 3, ticketNumber: "TKT-2026-000003", owner: { id: 5, fullName: "Robert Wilson", isActive: false }, summary: "Third one" }),
          ]),
        ),
      ),
    );
    renderQueue();

    const first = (await screen.findByText("Laptop battery drains quickly")).closest("a")!;
    expect(first).toHaveAttribute("href", "/staff/tickets/1");
    expect(within(first).getByText("Michael Brown")).toBeInTheDocument();
    expect(within(first).getByText("In Progress")).toBeInTheDocument();
    expect(within(first).getByText("MEDIUM")).toBeInTheDocument(); // requested
    expect(within(first).getByText("HIGH")).toBeInTheDocument(); // IT
    expect(within(first).getByText("Open")).toBeInTheDocument();

    expect(within(screen.getByText("Second one").closest("a")!).getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getByText(/Robert Wilson \(inactive\)/)).toBeInTheDocument();
  });

  it("shows the 'Requester reports resolved' indicator next to the real status, not instead of it", async () => {
    server.use(
      http.get(`${API_URL}/api/staff/tickets`, () =>
        HttpResponse.json(page([row({ requesterResolvedAt: "2026-09-03T10:00:00.000Z", currentStatus: "WAITING_FOR_REQUESTER" })])),
      ),
    );
    renderQueue();
    const link = (await screen.findByText("Laptop battery drains quickly")).closest("a")!;
    expect(within(link).getByText(/requester reports resolved/i)).toBeInTheDocument();
    expect(within(link).getByText("Waiting for Requester")).toBeInTheDocument();
  });

  // UI-08, AC-23
  it("refetches with the new query params and resets to page 1 when a filter or the sort changes", async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get(`${API_URL}/api/staff/tickets`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        seen.push(params);
        const p = Number(params.get("page") ?? "1");
        return HttpResponse.json(page([row()], { page: p, totalItems: 25, totalPages: 3 }));
      }),
    );
    const user = userEvent.setup();
    renderQueue();
    await screen.findByText("Laptop battery drains quickly");

    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await waitFor(() => expect(seen.at(-1)?.get("page")).toBe("2"));

    await user.selectOptions(screen.getByLabelText(/^status$/i), "OPEN");
    await waitFor(() => expect(seen.at(-1)?.get("status")).toBe("OPEN"));
    expect(seen.at(-1)?.get("page")).toBe("1");

    await user.selectOptions(screen.getByLabelText(/^owner$/i), "unassigned");
    await waitFor(() => expect(seen.at(-1)?.get("owner")).toBe("unassigned"));

    await user.selectOptions(screen.getByLabelText(/^sort$/i), "itPriority:desc");
    await waitFor(() => expect(seen.at(-1)?.get("sort")).toBe("itPriority:desc"));

    await user.selectOptions(screen.getByLabelText(/page size/i), "20");
    await waitFor(() => expect(seen.at(-1)?.get("pageSize")).toBe("20"));
    expect(seen.at(-1)?.get("page")).toBe("1");
  });

  it("offers Me, Unassigned, and each active IT Staff member as Owner filters", async () => {
    renderQueue();
    const owner = await screen.findByLabelText(/^owner$/i);
    await waitFor(() => expect(within(owner).getByRole("option", { name: "Michael Brown" })).toBeInTheDocument());
    expect(within(owner).getByRole("option", { name: "Me" })).toBeInTheDocument();
    expect(within(owner).getByRole("option", { name: "Unassigned" })).toBeInTheDocument();
  });

  // UI-09
  it("shows distinct empty-queue and no-results copy", async () => {
    renderQueue();
    expect(await screen.findByText(/there are no tickets in the queue/i)).toBeInTheDocument();
    expect(screen.queryByText(/no tickets match your filters/i)).not.toBeInTheDocument();
  });

  it("shows the no-results state with a Clear filters action when a filter matches nothing", async () => {
    server.use(
      http.get(`${API_URL}/api/staff/tickets`, () =>
        HttpResponse.json(page([], { appliedFilters: filters({ search: "zzz" }) })),
      ),
    );
    renderQueue();
    expect(await screen.findByText(/no tickets match your filters/i)).toBeInTheDocument();
    expect(screen.queryByText(/there are no tickets in the queue/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /clear filters/i }).length).toBeGreaterThan(0);
  });

  it("shows a safe failure state with Retry when the request fails", async () => {
    let calls = 0;
    server.use(
      http.get(`${API_URL}/api/staff/tickets`, () => {
        calls += 1;
        return calls === 1 ? HttpResponse.json(null, { status: 500 }) : HttpResponse.json(page([row()]));
      }),
    );
    const user = userEvent.setup();
    renderQueue();
    expect(await screen.findByText(/unable to load the ticket queue/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText("Laptop battery drains quickly")).toBeInTheDocument();
  });

  it("shows a forbidden message if the API refuses the request", async () => {
    server.use(
      http.get(`${API_URL}/api/staff/tickets`, () =>
        HttpResponse.json({ error: "FORBIDDEN", message: "You do not have access to this resource." }, { status: 403 }),
      ),
    );
    renderQueue();
    expect(await screen.findByText(/you don't have access to the ticket queue/i)).toBeInTheDocument();
  });
});
