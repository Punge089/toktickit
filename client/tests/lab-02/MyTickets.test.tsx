import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { MyTicketsPage } from "../../src/pages/MyTicketsPage.js";

const API_URL = "http://localhost:3000";

const emptyMeta = (appliedFilters: Partial<Record<string, string | null>> = {}) => ({
  page: 1,
  pageSize: 10,
  totalItems: 0,
  totalPages: 1,
  sort: "createdAt:desc",
  appliedFilters: {
    search: null,
    categoryId: null,
    relatedSystemId: null,
    requestedPriority: null,
    status: null,
    ...appliedFilters,
  },
});

// Issue 64 (REG) — session-authenticated instead of a sessionStorage-based
// Requester selection; the mocked /api/auth/me handler in msw/handlers.ts
// supplies the identity.
function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <MyTicketsPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("My Tickets screen", () => {
  it("lists the authenticated user's own tickets", async () => {
    renderPage();
    expect(await screen.findByText("Requester A ticket one")).toBeInTheDocument();
    expect(screen.getByText("Requester A ticket two")).toBeInTheDocument();
  });

  // UI-09
  it("shows the empty-account state when the Requester has never created a ticket", async () => {
    server.use(http.get(`${API_URL}/api/tickets`, () => HttpResponse.json({ data: [], meta: emptyMeta() })));
    renderPage();
    expect(await screen.findByText(/no tickets yet/i)).toBeInTheDocument();
  });

  it("shows the no-results state (distinct copy) when a search matches nothing", async () => {
    server.use(
      http.get(`${API_URL}/api/tickets`, () =>
        HttpResponse.json({ data: [], meta: emptyMeta({ search: "zzz-no-match" }) }),
      ),
    );
    renderPage();
    expect(await screen.findByText(/no tickets match your search/i)).toBeInTheDocument();
    expect(screen.queryByText(/no tickets yet/i)).not.toBeInTheDocument();
  });

  // UI-10 (adapted) — Lab 2's mid-session Requester-switch capability is
  // removed entirely (BR-39): identity is now fixed for the session, so
  // there is no "switch requester" control anywhere on this screen, and
  // no client-side affordance can make it show another identity's data.
  it("has no Change Requester or Requester-switching control anywhere on the screen", async () => {
    renderPage();
    await screen.findByText("Requester A ticket one");
    expect(screen.queryByText(/change requester/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /development requester/i })).not.toBeInTheDocument();
  });

  // UI-11
  it("refetches with the new pageSize and resets to page 1 on a page-size change", async () => {
    const captured: { params: URLSearchParams | null } = { params: null };
    server.use(
      http.get(`${API_URL}/api/tickets`, ({ request }) => {
        const url = new URL(request.url);
        captured.params = url.searchParams;
        const page = Number(url.searchParams.get("page") ?? "1");
        return HttpResponse.json({
          data: [
            {
              id: 1,
              ticketNumber: "TKT-2026-000001",
              summary: "Paginated row",
              categoryId: 1,
              categoryName: "Hardware",
              requestedPriority: "MEDIUM",
              currentStatus: "NEW",
              createdAt: "2026-08-24T10:00:00.000Z",
              updatedAt: "2026-08-24T10:00:00.000Z",
            },
          ],
          meta: { ...emptyMeta(), page, totalItems: 25, totalPages: 3 },
        });
      }),
    );

    renderPage();
    await screen.findByText("TKT-2026-000001");

    await userEvent.click(screen.getByRole("button", { name: /^next$/i }));
    await waitFor(() => expect(captured.params?.get("page")).toBe("2"));

    await userEvent.selectOptions(screen.getByLabelText(/page size/i), "20");

    await waitFor(() => expect(captured.params?.get("pageSize")).toBe("20"));
    expect(captured.params?.get("page")).toBe("1");
  });

  it("shows a safe failure state when the request fails", async () => {
    server.use(http.get(`${API_URL}/api/tickets`, () => HttpResponse.json(null, { status: 500 })));
    renderPage();
    expect(await screen.findByText(/unable to load your tickets/i)).toBeInTheDocument();
  });
});
