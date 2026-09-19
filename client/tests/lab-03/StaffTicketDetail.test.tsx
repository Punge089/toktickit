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

const TRANSITIONS: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: [],
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
    allowedTransitions: TRANSITIONS[status] ?? [],
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

function entry(id: number, authorName: string, authorRole: string, body: string) {
  return { id, authorId: id, authorName, authorRole, body, createdAt: "2026-09-02T09:00:00.000Z" };
}

function renderDetail(
  opts: { user?: typeof STAFF | typeof ADMIN; detail?: Record<string, unknown>; comments?: () => unknown[] } = {},
) {
  server.use(
    http.get(`${API_URL}/api/auth/me`, () => HttpResponse.json(opts.user ?? STAFF)),
    http.get(`${API_URL}/api/staff/tickets/:id`, () => HttpResponse.json(ticket(opts.detail))),
    http.get(`${API_URL}/api/tickets/:id/comments`, () =>
      HttpResponse.json(opts.comments ? opts.comments() : [entry(1, "Aran Suksawat", "REQUESTER", "Still broken.")]),
    ),
    http.get(`${API_URL}/api/staff/tickets/:id/notes`, () => HttpResponse.json([entry(2, "Jennifer Anderson", "IT_STAFF", "Checked the firewall.")])),
  );
  return render(
    <MemoryRouter initialEntries={["/staff/tickets/5"]}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </MemoryRouter>,
  );
}

// docs/lab-03/tests.md UI-10, UI-11, UI-12 - specification.md AC-16, AC-17, BR-04, BR-22; ui-spec.md section 8.
describe("IT Staff Ticket Detail screen", () => {
  it("shows the Ticket header, operational controls, and tab counts", async () => {
    renderDetail();
    expect(await screen.findByRole("heading", { name: "TKT-2026-000005" })).toBeInTheDocument();
    expect(screen.getByText("Laptop battery drains quickly")).toBeInTheDocument();
    expect(screen.getByLabelText("Ticket Owner")).toHaveValue("8");
    expect(screen.getByLabelText("IT Priority")).toHaveValue("MEDIUM");
    expect(await screen.findByRole("tab", { name: "Public Comments (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Internal Notes (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Attachments (0)" })).toBeInTheDocument();
  });

  // UI-10, AC-16
  it("offers only the current status and the transitions the server allows", async () => {
    renderDetail({ detail: { currentStatus: "RESOLVED" } });
    const status = await screen.findByLabelText("Current Status");
    const labels = within(status).getAllByRole("option").map((o) => o.textContent);
    expect(labels).toEqual(["Resolved (current)", "Closed", "Reopened"]);
  });

  // UI-11, AC-17
  it("blocks Resolved without a Resolution Summary and sends no request", async () => {
    let patched = false;
    server.use(http.patch(`${API_URL}/api/staff/tickets/:id/status`, () => {
      patched = true;
      return HttpResponse.json(ticket());
    }));
    const user = userEvent.setup();
    renderDetail();
    await user.selectOptions(await screen.findByLabelText("Current Status"), "RESOLVED");
    expect(screen.getByLabelText(/resolution summary/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /update status/i }));
    expect(await screen.findByText(/resolution summary is required/i)).toBeInTheDocument();
    expect(patched).toBe(false);
  });

  it("resolves with a summary and shows the updated status and summary", async () => {
    let sent: Record<string, unknown> = {};
    server.use(
      http.patch(`${API_URL}/api/staff/tickets/:id/status`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(ticket({ currentStatus: "RESOLVED", resolutionSummary: "Replaced the battery." }));
      }),
    );
    const user = userEvent.setup();
    renderDetail();
    await user.selectOptions(await screen.findByLabelText("Current Status"), "RESOLVED");
    await user.type(screen.getByLabelText(/resolution summary/i), "Replaced the battery.");
    await user.click(screen.getByRole("button", { name: /update status/i }));

    expect(await screen.findByText("Replaced the battery.")).toBeInTheDocument();
    expect(sent).toEqual({ status: "RESOLVED", resolutionSummary: "Replaced the battery." });
  });

  it("asks for confirmation before Closed and sends nothing until confirmed", async () => {
    let patched = 0;
    server.use(
      http.patch(`${API_URL}/api/staff/tickets/:id/status`, () => {
        patched += 1;
        return HttpResponse.json(ticket({ currentStatus: "CLOSED" }));
      }),
    );
    const user = userEvent.setup();
    renderDetail({ detail: { currentStatus: "RESOLVED" } });
    await user.selectOptions(await screen.findByLabelText("Current Status"), "CLOSED");
    await user.click(screen.getByRole("button", { name: /update status/i }));

    expect(await screen.findByRole("alertdialog", { name: /confirm status change/i })).toBeInTheDocument();
    expect(patched).toBe(0);

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(patched).toBe(0);

    await user.click(screen.getByRole("button", { name: /update status/i }));
    await user.click(await screen.findByRole("button", { name: /^confirm$/i }));
    await waitFor(() => expect(patched).toBe(1));
    expect(await screen.findByText(/this ticket is closed and can no longer be changed/i)).toBeInTheDocument();
  });

  it("shows the server's reason inline when the backend rejects a status change", async () => {
    server.use(
      http.patch(`${API_URL}/api/staff/tickets/:id/status`, () =>
        HttpResponse.json({ error: "OWNER_REQUIRED", message: "Assign an owner before starting work on this ticket." }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    renderDetail();
    await user.selectOptions(await screen.findByLabelText("Current Status"), "IN_PROGRESS");
    await user.click(screen.getByRole("button", { name: /update status/i }));
    expect(await screen.findByText(/assign an owner before starting work/i)).toBeInTheDocument();
  });

  it("claims a Ticket for the signed-in IT Staff member and saves an IT Priority change", async () => {
    const calls: string[] = [];
    server.use(
      http.patch(`${API_URL}/api/staff/tickets/:id/owner`, async ({ request }) => {
        calls.push(`owner:${JSON.stringify(await request.json())}`);
        return HttpResponse.json(ticket({ ownerId: 8, ownerName: "Jennifer Anderson" }));
      }),
      http.patch(`${API_URL}/api/staff/tickets/:id/it-priority`, async ({ request }) => {
        calls.push(`priority:${JSON.stringify(await request.json())}`);
        return HttpResponse.json(ticket({ itPriority: "URGENT" }));
      }),
    );
    const user = userEvent.setup();
    renderDetail({ detail: { ownerId: 9, ownerName: "Michael Brown" } });
    await user.click(await screen.findByRole("button", { name: /assign to me/i }));
    await waitFor(() => expect(calls).toContain('owner:{"ownerId":8}'));

    await user.selectOptions(screen.getByLabelText("IT Priority"), "URGENT");
    await waitFor(() => expect(calls).toContain('priority:{"itPriority":"URGENT"}'));
  });

  // UI-12, BR-04
  it("keeps Internal Notes in a visibly separate panel from Public Comments", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole("tab", { name: /Internal Notes/ }));

    const panel = screen.getByRole("tabpanel");
    expect(panel.firstElementChild).toHaveClass("zen-entry-internal");
    expect(within(panel).getByText("Checked the firewall.")).toBeInTheDocument();
    expect(within(panel).getByText(/not visible to requester/i)).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /save internal note/i })).toBeInTheDocument();
    expect(within(panel).queryByText("Still broken.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Public Comments/ }));
    const comments = screen.getByRole("tabpanel");
    expect(comments.firstElementChild).not.toHaveClass("zen-entry-internal");
    expect(within(comments).getByText("Still broken.")).toBeInTheDocument();
    expect(within(comments).getByRole("button", { name: /post comment/i })).toBeInTheDocument();
  });

  it("posts a Public Comment and shows it in the thread", async () => {
    let comments = [entry(1, "Aran Suksawat", "REQUESTER", "Still broken.")];
    server.use(
      http.post(`${API_URL}/api/tickets/:id/comments`, async ({ request }) => {
        const { body } = (await request.json()) as { body: string };
        comments = [...comments, entry(3, "Jennifer Anderson", "IT_STAFF", body)];
        return HttpResponse.json(comments[1], { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderDetail({ comments: () => comments });
    await user.type(await screen.findByLabelText(/add public comment/i), "We are on it.");
    await user.click(screen.getByRole("button", { name: /post comment/i }));
    expect(await screen.findByText("We are on it.")).toBeInTheDocument();
  });

  it("gives an Administrator a read-only view: no editable controls and no composers", async () => {
    const user = userEvent.setup();
    renderDetail({ user: ADMIN });
    await screen.findByRole("heading", { name: "TKT-2026-000005" });
    expect(screen.queryByLabelText("Ticket Owner")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("IT Priority")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /update status/i })).not.toBeInTheDocument();
    expect(screen.getByText(/read-only access/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /post comment/i })).not.toBeInTheDocument();
    expect(screen.getByText(/administrators can read this ticket but not post/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Internal Notes/ }));
    expect(screen.getByText("Checked the firewall.")).toBeInTheDocument(); // Administrator may read notes
    expect(screen.queryByRole("button", { name: /save internal note/i })).not.toBeInTheDocument();
  });

  it("makes a Closed Ticket read-only for IT Staff too", async () => {
    renderDetail({ detail: { currentStatus: "CLOSED" } });
    await screen.findByRole("heading", { name: "TKT-2026-000005" });
    expect(screen.queryByLabelText("Ticket Owner")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /post comment/i })).not.toBeInTheDocument();
    expect(screen.getByText(/this ticket is closed and can no longer be changed/i)).toBeInTheDocument();
  });

  it("lists attachments read-only with a Download action and no add/remove controls", async () => {
    renderDetail({
      detail: {
        attachments: [
          { id: 1, originalFilename: "log.pdf", mimeType: "application/pdf", sizeBytes: 2048, uploadedAt: "2026-09-01T10:00:00.000Z", uploadedByName: "Aran Suksawat", removedAt: null, removedByName: null, removalReason: null },
        ],
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: /Attachments/ }));
    expect(screen.getByText("log.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^remove$/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/add attachment/i)).not.toBeInTheDocument();
  });

  it("shows Ticket not found with a link back to the Queue", async () => {
    server.use(
      http.get(`${API_URL}/api/auth/me`, () => HttpResponse.json(STAFF)),
      http.get(`${API_URL}/api/staff/tickets/:id`, () =>
        HttpResponse.json({ error: "TICKET_NOT_FOUND", message: "Ticket not found." }, { status: 404 }),
      ),
    );
    render(
      <MemoryRouter initialEntries={["/staff/tickets/999"]}>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Ticket not found.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to queue/i })).toHaveAttribute("href", "/staff/queue");
  });
});
