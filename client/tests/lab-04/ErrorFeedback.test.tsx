import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { AppRouter } from "../../src/AppRouter.js";

const API_URL = "http://localhost:3000";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </MemoryRouter>,
  );
}

// docs/lab-04/tests.md UI-25 - specification.md FR-18: a failure to load a screen is shown the same way everywhere,
// a safe message and a Retry button, never a blank screen. The Lab 4 screens and the staff screens already did;
// My Tickets and the Requester Ticket Detail showed the message only.
describe("Failure feedback on the Requester screens", () => {
  it("UI-25: My Tickets shows a safe message with Retry, and Retry loads the list", async () => {
    let calls = 0;
    server.use(
      http.get(`${API_URL}/api/tickets`, () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
        return HttpResponse.json({
          data: [],
          meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1, sort: "createdAt:desc", appliedFilters: { search: null, categoryId: null, relatedSystemId: null, requestedPriority: null, status: null, active: null } },
        });
      }),
    );
    renderAt("/tickets");
    expect(await screen.findByText("Unable to load your tickets. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText(/INTERNAL_ERROR/)).not.toBeInTheDocument(); // nothing internal is shown

    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText("Unable to load your tickets. Please try again.")).not.toBeInTheDocument());
    expect(calls).toBe(2);
  });

  it("UI-25: Requester Ticket Detail shows a safe message with Retry, and Retry loads the ticket", async () => {
    let calls = 0;
    server.use(
      http.get(`${API_URL}/api/tickets/:id`, ({ params }) => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
        return HttpResponse.json({
          id: Number(params.id),
          ticketNumber: "TKT-2026-000001",
          requesterId: 1,
          requesterName: "Aran Suksawat",
          summary: "Laptop battery drains quickly",
          description: "The battery drains within two hours.",
          categoryId: 1,
          categoryName: "Hardware",
          relatedSystemId: 1,
          relatedSystemName: "Corporate Laptop",
          requestedPriority: "MEDIUM",
          itPriority: "MEDIUM",
          currentStatus: "NEW",
          resolutionSummary: null,
          requesterResolvedAt: null,
          createdAt: "2026-08-24T10:00:00.000Z",
          updatedAt: "2026-08-24T10:00:00.000Z",
          attachments: [],
        });
      }),
    );
    renderAt("/tickets/1");
    expect(await screen.findByText("Unable to load this ticket. Please try again.")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "TKT-2026-000001" })).toBeInTheDocument();
    expect(screen.queryByText("Unable to load this ticket. Please try again.")).not.toBeInTheDocument();
  });
});
