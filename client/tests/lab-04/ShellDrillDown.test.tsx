import { describe, it, expect } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { AppRouter } from "../../src/AppRouter.js";

const API_URL = "http://localhost:3000";
const USERS = {
  REQUESTER: { id: 1, fullName: "Aran Suksawat", email: "a@example.dev", role: "REQUESTER" as const, mustChangePassword: false },
  IT_STAFF: { id: 8, fullName: "Jennifer Anderson", email: "j@example.dev", role: "IT_STAFF" as const, mustChangePassword: false },
  ADMINISTRATOR: { id: 12, fullName: "John Smith", email: "john@example.dev", role: "ADMINISTRATOR" as const, mustChangePassword: false },
};

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

function renderAt(path: string, role: keyof typeof USERS) {
  server.use(http.get(`${API_URL}/api/auth/me`, () => HttpResponse.json(USERS[role])));
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRouter />
        <Where />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const nav = () => screen.getByRole("navigation", { name: "Primary" });
const where = () => screen.getByTestId("where").textContent;

const queuePage = (over: Json = {}) => ({
  items: [],
  page: 1,
  pageSize: 10,
  totalItems: 0,
  totalPages: 1,
  sort: "createdAt:desc",
  appliedFilters: { search: null, status: null, itPriority: null, categoryId: null, owner: null, active: null, ...over },
});
type Json = Record<string, unknown>;

// docs/lab-04/tests.md UI-07, UI-08 and the navigation part of STY-04 - specification.md BR-35, BR-36,
// FR-15, FR-17; ui-spec.md §2.
describe("Shell, landing page and drill-down filters", () => {
  it("UI-07: each role sees Dashboard plus its own entries only, with the current page marked", async () => {
    const expected: Record<keyof typeof USERS, string[]> = {
      REQUESTER: ["Dashboard", "My Tickets", "Create Ticket"],
      IT_STAFF: ["Dashboard", "My Queue"],
      ADMINISTRATOR: ["Dashboard", "Users"],
    };
    for (const role of Object.keys(USERS) as Array<keyof typeof USERS>) {
      const view = renderAt("/dashboard", role);
      await screen.findByRole("navigation", { name: "Primary" });
      expect(within(nav()).getAllByRole("link").map((l) => l.textContent), role).toEqual(expected[role]);
      const current = within(nav()).getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
      expect(current.map((l) => l.textContent), `${role} current page`).toEqual(["Dashboard"]);
      view.unmount();
    }
  });

  it("UI-07: lands on /dashboard from the root path, for every role", async () => {
    for (const role of Object.keys(USERS) as Array<keyof typeof USERS>) {
      const view = renderAt("/", role);
      await waitFor(() => expect(where()).toBe("/dashboard"));
      view.unmount();
    }
  });

  it("UI-07: marks My Tickets on a ticket page, and Create Ticket (not My Tickets) on /tickets/new", async () => {
    server.use(http.get(`${API_URL}/api/tickets/:id`, () => HttpResponse.json({}, { status: 404 })));
    const detail = renderAt("/tickets/1", "REQUESTER");
    await screen.findByRole("navigation", { name: "Primary" });
    expect(within(nav()).getByRole("link", { name: "My Tickets" })).toHaveAttribute("aria-current", "page");
    expect(within(nav()).getByRole("link", { name: "Create Ticket" })).not.toHaveAttribute("aria-current");
    detail.unmount();

    renderAt("/tickets/new", "REQUESTER");
    await screen.findByRole("navigation", { name: "Primary" });
    expect(within(nav()).getByRole("link", { name: "Create Ticket" })).toHaveAttribute("aria-current", "page");
    expect(within(nav()).getByRole("link", { name: "My Tickets" })).not.toHaveAttribute("aria-current");
    expect(within(nav()).getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page")).toHaveLength(1);
  });

  it("UI-08: My Tickets opens with the dashboard's status and active filters in the request, as chips, and clears them", async () => {
    const urls: string[] = [];
    server.use(
      http.get(`${API_URL}/api/tickets`, ({ request }) => {
        urls.push(new URL(request.url).search);
        const q = new URL(request.url).searchParams;
        return HttpResponse.json({
          data: [],
          meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1, sort: "createdAt:desc", appliedFilters: { search: null, categoryId: null, relatedSystemId: null, requestedPriority: null, status: q.get("status"), active: q.get("active") === "true" ? true : null } },
        });
      }),
    );
    const user = userEvent.setup();
    renderAt("/tickets?status=WAITING_FOR_REQUESTER&active=true", "REQUESTER");

    const chips = await screen.findByRole("list", { name: "Applied filters" });
    expect(within(chips).getByText("Status: Waiting for Requester")).toBeInTheDocument();
    expect(within(chips).getByText("Active tickets")).toBeInTheDocument();
    await waitFor(() => expect(urls.some((u) => u.includes("status=WAITING_FOR_REQUESTER") && u.includes("active=true"))).toBe(true));

    await user.click(within(chips).getByRole("button", { name: "Remove filter: Active tickets" }));
    await waitFor(() => expect(where()).toBe("/tickets?status=WAITING_FOR_REQUESTER"));
    expect(urls[urls.length - 1]).not.toContain("active=true");

    // The no-results message offers a second Clear filters button; either one clears everything.
    await user.click((await screen.findAllByRole("button", { name: "Clear filters" }))[0]);
    await waitFor(() => expect(where()).toBe("/tickets"));
    expect(screen.queryByRole("list", { name: "Applied filters" })).not.toBeInTheDocument();
    expect(urls[urls.length - 1]).not.toContain("status=");
  });

  it("UI-08: the Ticket Queue opens with status, owner, itPriority and active from the URL and Clear filters empties it", async () => {
    const urls: string[] = [];
    server.use(
      http.get(`${API_URL}/api/staff/assignable-users`, () => HttpResponse.json([{ id: 8, fullName: "Jennifer Anderson" }])),
      http.get(`${API_URL}/api/staff/tickets`, ({ request }) => {
        urls.push(new URL(request.url).search);
        return HttpResponse.json(queuePage());
      }),
    );
    const user = userEvent.setup();
    renderAt("/staff/queue?owner=unassigned&itPriority=URGENT&status=OPEN&active=true", "IT_STAFF");

    await waitFor(() => expect(urls.length).toBeGreaterThan(0));
    const first = new URLSearchParams(urls[0]);
    expect(Object.fromEntries(first)).toMatchObject({ owner: "unassigned", itPriority: "URGENT", status: "OPEN", active: "true" });
    expect(screen.getByLabelText("Status")).toHaveValue("OPEN");
    expect(screen.getByLabelText("IT Priority")).toHaveValue("URGENT");
    expect(screen.getByLabelText("Owner")).toHaveValue("unassigned");
    expect(within(screen.getByRole("list", { name: "Applied filters" })).getByText("Active tickets")).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(where()).toBe("/staff/queue"));
    expect(screen.queryByRole("list", { name: "Applied filters" })).not.toBeInTheDocument();
    const last = new URLSearchParams(urls[urls.length - 1]);
    for (const key of ["owner", "itPriority", "status", "active"]) expect(last.has(key), key).toBe(false);
  });
});
