import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { TicketDetailPage } from "../../src/pages/TicketDetailPage.js";

const API_URL = "http://localhost:3000";

const detail = (over: Record<string, unknown> = {}) => ({
  id: 1,
  ticketNumber: "TKT-2026-000001",
  requesterId: 1,
  requesterName: "Aran Suksawat",
  summary: "Laptop battery drains quickly",
  description: "The battery on my corporate laptop drains quickly.",
  categoryId: 1,
  categoryName: "Hardware",
  relatedSystemId: 1,
  relatedSystemName: "Corporate Laptop",
  requestedPriority: "MEDIUM",
  itPriority: "MEDIUM",
  currentStatus: "OPEN",
  resolutionSummary: null,
  requesterResolvedAt: null,
  createdAt: "2026-08-24T10:00:00.000Z",
  updatedAt: "2026-08-24T10:00:00.000Z",
  attachments: [],
  ...over,
});

function entry(id: number, authorName: string, authorRole: string, body: string) {
  return { id, authorId: id, authorName, authorRole, body, createdAt: "2026-09-02T09:00:00.000Z" };
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/tickets/1"]}>
      <AuthProvider>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

// docs/lab-03/tests.md UI-15, UI-16, STY-04 - specification.md AC-19, AC-21,
// BR-05, BR-22, BR-26.
describe("Requester Ticket Detail: Public Comments and Problem Appears Resolved", () => {
  // UI-16, AC-19
  it("posts a Public Comment and shows it with the author's name at the end of the list", async () => {
    let comments = [entry(1, "Michael Brown", "IT_STAFF", "We are looking into it.")];
    server.use(
      http.get(`${API_URL}/api/tickets/:id`, () => HttpResponse.json(detail())),
      http.get(`${API_URL}/api/tickets/:id/comments`, () => HttpResponse.json(comments)),
      http.post(`${API_URL}/api/tickets/:id/comments`, async ({ request }) => {
        const { body } = (await request.json()) as { body: string };
        comments = [...comments, entry(2, "Aran Suksawat", "REQUESTER", body)];
        return HttpResponse.json(comments[1], { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderDetail();

    expect(await screen.findByText("We are looking into it.")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/add public comment/i), "Still broken after a restart.");
    await user.click(screen.getByRole("button", { name: /post comment/i }));

    expect(await screen.findByText("Still broken after a restart.")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items[items.length - 1]).toHaveTextContent("Aran Suksawat");
  });

  it("keeps the typed text and shows an error when posting fails", async () => {
    server.use(
      http.get(`${API_URL}/api/tickets/:id`, () => HttpResponse.json(detail())),
      http.post(`${API_URL}/api/tickets/:id/comments`, () => HttpResponse.error()),
    );
    const user = userEvent.setup();
    renderDetail();
    await user.type(await screen.findByLabelText(/add public comment/i), "Do not lose me");
    await user.click(screen.getByRole("button", { name: /post comment/i }));
    expect(await screen.findByText(/unable to connect to toktickit api/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/add public comment/i)).toHaveValue("Do not lose me");
  });

  // STY-04, BR-26
  it("renders comment markup as literal text, never as elements", async () => {
    const body = '<img src=x onerror="alert(1)"> <b>bold</b>';
    server.use(
      http.get(`${API_URL}/api/tickets/:id`, () => HttpResponse.json(detail())),
      http.get(`${API_URL}/api/tickets/:id/comments`, () => HttpResponse.json([entry(1, "Michael Brown", "IT_STAFF", body)])),
    );
    renderDetail();
    const node = await screen.findByText(body);
    expect(node.textContent).toBe(body);
    expect(node.querySelector("img, b, script")).toBeNull();
    expect(document.querySelector("img[src='x']")).toBeNull();
  });

  // UI-15, AC-21
  it("asks for confirmation, then replaces the button with the resolved indicator", async () => {
    let resolved = false;
    let posts = 0;
    server.use(
      http.get(`${API_URL}/api/tickets/:id`, () =>
        HttpResponse.json(detail({ requesterResolvedAt: resolved ? "2026-09-03T10:00:00.000Z" : null })),
      ),
      http.post(`${API_URL}/api/tickets/:id/problem-resolved`, () => {
        posts += 1;
        resolved = true;
        return HttpResponse.json({ requesterResolvedAt: "2026-09-03T10:00:00.000Z" });
      }),
    );
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole("button", { name: /problem appears resolved/i }));
    expect(screen.getByRole("alertdialog", { name: /confirm problem appears resolved/i })).toBeInTheDocument();
    expect(posts).toBe(0);

    await user.click(screen.getByRole("button", { name: /yes, it looks resolved/i }));
    expect(await screen.findByText(/you told it staff this looks resolved/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /problem appears resolved/i })).not.toBeInTheDocument();
    expect(posts).toBe(1);
    // BR-05: the formal status badge is untouched
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("can be cancelled without sending anything", async () => {
    let posts = 0;
    server.use(
      http.get(`${API_URL}/api/tickets/:id`, () => HttpResponse.json(detail())),
      http.post(`${API_URL}/api/tickets/:id/problem-resolved`, () => {
        posts += 1;
        return HttpResponse.json({});
      }),
    );
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole("button", { name: /problem appears resolved/i }));
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(screen.getByRole("button", { name: /problem appears resolved/i })).toBeInTheDocument();
    expect(posts).toBe(0);
  });

  it("hides the resolved action and the comment composer once the Ticket is Closed", async () => {
    server.use(
      http.get(`${API_URL}/api/tickets/:id`, () => HttpResponse.json(detail({ currentStatus: "CLOSED", resolutionSummary: "Fixed it." }))),
    );
    renderDetail();
    expect(await screen.findByText("Fixed it.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /problem appears resolved/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /post comment/i })).not.toBeInTheDocument();
    expect(screen.getByText(/comments can no longer be added/i)).toBeInTheDocument();
  });

  it("does not offer the resolved action while the Ticket is Resolved (IT Staff already resolved it)", async () => {
    server.use(http.get(`${API_URL}/api/tickets/:id`, () => HttpResponse.json(detail({ currentStatus: "RESOLVED", resolutionSummary: "Done." }))));
    renderDetail();
    await waitFor(() => expect(screen.getByText("Done.")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /problem appears resolved/i })).not.toBeInTheDocument();
  });
});
