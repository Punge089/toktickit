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
const REQUESTER = { id: 1, fullName: "Aran Suksawat", email: "a@example.dev", role: "REQUESTER" as const, mustChangePassword: false };

const TRANSITIONS: Record<string, string[]> = {
  NEW: ["OPEN", "IN_PROGRESS", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: [],
  CANCELLED: [],
};

type Json = Record<string, unknown>;

function ticket(over: Json = {}) {
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
    version: 4,
    actionCounts: { open: 1, completed: 0, cancelled: 0 },
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

const person = (id: number, fullName: string, isActive = true) => ({ id, fullName, isActive });

function action(over: Json = {}) {
  return {
    id: 1,
    ticketId: 5,
    actionAt: "2026-10-28T09:30:00.000Z",
    description: "Replaced the laptop battery.",
    result: null,
    performedBy: person(8, "Jennifer Anderson"),
    assignee: person(9, "Michael Brown"),
    followUpRequired: false,
    followUpNote: null,
    attachmentNotes: null,
    actionStatus: "PLANNED",
    version: 1,
    createdAt: "2026-10-28T09:31:00.000Z",
    updatedAt: "2026-10-28T09:31:00.000Z",
    ...over,
  };
}

// An in-memory stand-in for the Actions endpoints: tests read what was sent and decide what comes back.
function actionsServer(initial: Json[] = [], opts: { ticket?: Json; user?: typeof STAFF | typeof ADMIN } = {}) {
  const state = {
    items: initial,
    posts: [] as Json[],
    patches: [] as Json[],
    onPost: null as null | ((body: Json) => Response | Promise<Response>),
    onPatch: null as null | ((body: Json) => Response | Promise<Response>),
  };
  server.use(
    http.get(`${API_URL}/api/auth/me`, () => HttpResponse.json(opts.user ?? STAFF)),
    http.get(`${API_URL}/api/staff/tickets/:id`, () => HttpResponse.json(ticket(opts.ticket))),
    http.get(`${API_URL}/api/tickets/:id/comments`, () => HttpResponse.json([])),
    http.get(`${API_URL}/api/staff/tickets/:id/notes`, () => HttpResponse.json([])),
    http.get(`${API_URL}/api/staff/assignable-users`, () =>
      HttpResponse.json([
        { id: 8, fullName: "Jennifer Anderson" },
        { id: 9, fullName: "Michael Brown" },
      ]),
    ),
    http.get(`${API_URL}/api/tickets/:id/actions`, () =>
      HttpResponse.json({ items: state.items, counts: { open: 0, completed: 0, cancelled: 0 } }),
    ),
    http.post(`${API_URL}/api/staff/tickets/:id/actions`, async ({ request }) => {
      const body = (await request.json()) as Json;
      state.posts.push(body);
      if (state.onPost) return state.onPost(body);
      const created = action({
        id: 100 + state.posts.length,
        description: body.description,
        assignee: person(Number(body.assigneeId), body.assigneeId === 8 ? "Jennifer Anderson" : "Michael Brown"),
        actionStatus: body.actionStatus ?? "PLANNED",
      });
      state.items = [...state.items, created];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(`${API_URL}/api/staff/tickets/:id/actions/:actionId`, async ({ request, params }) => {
      const body = (await request.json()) as Json;
      state.patches.push(body);
      if (state.onPatch) return state.onPatch(body);
      const current = state.items.find((a) => String(a.id) === params.actionId)!;
      const updated = { ...current, ...body, version: (current.version as number) + 1 };
      state.items = state.items.map((a) => (a === current ? updated : a));
      return HttpResponse.json(updated);
    }),
  );
  return state;
}

function renderStaff(path = "/staff/tickets/5?tab=actions") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const jsonError = (status: number, error: string, message: string, extra: Json = {}) =>
  HttpResponse.json({ error, message, ...extra }, { status });

async function openCreate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Add Action" }));
  return screen.getByRole("form", { name: "Add action" });
}

// docs/lab-04/tests.md UI-09 to UI-18 - specification.md FR-01 to FR-05, BR-04 to BR-13, BR-16, BR-38;
// ui-spec.md section 4.1 and 5.
describe("Actions Taken on the IT Staff Ticket Detail", () => {
  it("UI-09: creates an Action with one POST carrying a clientRequestId, closes the form and refreshes the list", async () => {
    const api = actionsServer([]);
    const user = userEvent.setup();
    renderStaff();
    expect(await screen.findByText("No actions recorded yet.")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Actions Taken (0)" })).toBeInTheDocument();

    const form = await openCreate(user);
    expect(within(form).getByLabelText(/^assignee/i)).toHaveValue("8"); // the signed-in IT Staff member
    await user.type(within(form).getByLabelText(/action description/i), "Replaced the laptop battery.");
    await user.click(within(form).getByRole("button", { name: "Save action" }));

    await waitFor(() => expect(api.posts).toHaveLength(1));
    expect(api.posts[0]).toMatchObject({ description: "Replaced the laptop battery.", assigneeId: 8, actionStatus: "PLANNED" });
    expect(typeof api.posts[0].clientRequestId).toBe("string");
    expect((api.posts[0].clientRequestId as string).length).toBeGreaterThan(8);
    expect(api.posts[0]).not.toHaveProperty("performedById");

    await waitFor(() => expect(screen.queryByRole("form", { name: "Add action" })).not.toBeInTheDocument());
    expect(await screen.findByRole("tab", { name: "Actions Taken (1)" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Actions taken" });
    expect(within(list).getByText("Replaced the laptop battery.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Action saved.");
    expect(screen.getByRole("button", { name: "Add Action" })).toHaveFocus(); // focus returns to the opener
  });

  it("UI-10: shows each validation message under its field, keeps the values and focuses the first invalid field", async () => {
    const api = actionsServer([]);
    const user = userEvent.setup();
    renderStaff();
    const form = await openCreate(user);

    await user.click(within(form).getByRole("button", { name: "Save action" }));
    const description = within(form).getByLabelText(/action description/i);
    expect(await within(form).findByText("Action Description is required.")).toBeInTheDocument();
    expect(description).toHaveAttribute("aria-invalid", "true");
    expect(description).toHaveFocus();
    expect(api.posts).toHaveLength(0);

    await user.type(description, "Check the battery.");
    await user.selectOptions(within(form).getByLabelText("Status"), "COMPLETED");
    await user.click(within(form).getByLabelText("Follow-up required?"));
    await user.click(within(form).getByRole("button", { name: "Save action" }));
    expect(await within(form).findByText("Result is required to complete an action.")).toBeInTheDocument();
    expect(within(form).getByText("Follow-up Note is required when a follow-up is needed.")).toBeInTheDocument();
    expect(within(form).getByLabelText(/^result/i)).toHaveFocus(); // first invalid, in form order
    expect(description).toHaveValue("Check the battery."); // nothing typed is lost
    expect(api.posts).toHaveLength(0);

    // The Follow-up Note field exists, and is required, only while the box is ticked.
    await user.click(within(form).getByLabelText("Follow-up required?"));
    expect(within(form).queryByLabelText(/follow-up note/i)).not.toBeInTheDocument();

    // A server-side 400 lands under the named field and keeps the values too.
    api.onPost = () => jsonError(400, "VALIDATION_FAILED", "Fix the highlighted fields.", { fieldErrors: { description: "Action Description must be at most 2000 characters." } });
    await user.type(within(form).getByLabelText(/^result/i), "Done.");
    await user.click(within(form).getByRole("button", { name: "Save action" }));
    expect(await within(form).findByText("Action Description must be at most 2000 characters.")).toBeInTheDocument();
    expect(description).toHaveValue("Check the battery.");
    expect(screen.getByRole("form", { name: "Add action" })).toBeInTheDocument();
  });

  it("UI-11: sends one request however often Save is clicked or Enter is pressed, and a retry reuses the same clientRequestId", async () => {
    const api = actionsServer([]);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    api.onPost = async () => {
      await gate;
      return jsonError(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
    };
    const user = userEvent.setup();
    renderStaff();
    const form = await openCreate(user);
    await user.type(within(form).getByLabelText(/action description/i), "Replace the battery.");
    const save = within(form).getByRole("button", { name: /saving|save action/i });
    await user.click(save);
    await user.click(save);
    await user.type(within(form).getByLabelText(/attachment notes/i), "{Enter}{Enter}");
    await waitFor(() => expect(api.posts).toHaveLength(1));
    expect(within(form).getByRole("button", { name: /saving/i })).toBeDisabled();

    release();
    expect(await screen.findByText(/unable to save this action/i)).toBeInTheDocument();
    expect(api.posts).toHaveLength(1);
    expect(within(form).getByLabelText(/action description/i)).toHaveValue("Replace the battery.");

    api.onPost = null;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(api.posts).toHaveLength(2));
    expect(api.posts[1].clientRequestId).toBe(api.posts[0].clientRequestId);
  });

  it("UI-12: an INVALID_ASSIGNEE answer shows a message under Assignee and keeps the entered data", async () => {
    const api = actionsServer([]);
    api.onPost = () => jsonError(409, "INVALID_ASSIGNEE", "The assignee must be an active IT Staff user.");
    const user = userEvent.setup();
    renderStaff();
    const form = await openCreate(user);
    await user.type(within(form).getByLabelText(/action description/i), "Replace the battery.");
    await user.selectOptions(within(form).getByLabelText(/^assignee/i), "9");
    await user.click(within(form).getByRole("button", { name: "Save action" }));

    expect(await within(form).findByText("Choose an active IT Staff member.")).toBeInTheDocument();
    expect(within(form).getByLabelText(/^assignee/i)).toHaveAttribute("aria-invalid", "true");
    expect(within(form).getByLabelText(/action description/i)).toHaveValue("Replace the battery.");
    expect(within(form).getByLabelText(/^assignee/i)).toHaveValue("9");
  });

  it("UI-13: a STALE_VERSION answer keeps the typed text until Reload latest, which then shows the new version", async () => {
    const api = actionsServer([action()]);
    api.onPatch = () => jsonError(409, "STALE_VERSION", "This action was changed by someone else.", { currentVersion: 2 });
    const user = userEvent.setup();
    renderStaff();
    await user.click(await screen.findByRole("button", { name: /view action: replaced the laptop battery/i }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const form = screen.getByRole("form", { name: "Edit action" });
    const description = within(form).getByLabelText(/action description/i);
    await user.clear(description);
    await user.type(description, "My edit of the description");
    await user.click(within(form).getByRole("button", { name: "Save action" }));

    expect(await screen.findByText(/someone else changed this action/i)).toBeInTheDocument();
    expect(api.patches[0]).toMatchObject({ expectedVersion: 1, description: "My edit of the description" });
    expect(description).toHaveValue("My edit of the description");

    api.items = [action({ description: "Someone else's wording", version: 2 })];
    await user.click(screen.getByRole("button", { name: "Reload latest" }));
    await waitFor(() => expect(screen.queryByText(/someone else changed this action/i)).not.toBeInTheDocument());
    expect(screen.getByLabelText(/action description/i)).toHaveValue("Someone else's wording");
  });

  it("UI-14: Start sends one transition request, and the panel then shows the new status", async () => {
    const api = actionsServer([action({ id: 1, description: "Planned one" })]);
    const user = userEvent.setup();
    renderStaff();
    await user.click(await screen.findByRole("button", { name: /view action: planned one/i }));
    await user.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(api.patches).toHaveLength(1));
    expect(api.patches[0]).toEqual({ expectedVersion: 1, actionStatus: "IN_PROGRESS" });
    expect(await screen.findByRole("button", { name: "Complete" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument(); // only a Planned Action can start
  });

  it("UI-14: Complete without a Result opens the form on the Result field; with a Result it sends one request", async () => {
    const api = actionsServer([
      action({ id: 1, description: "No result yet", actionStatus: "IN_PROGRESS" }),
      action({ id: 2, description: "Has a result", result: "Almost done.", actionStatus: "IN_PROGRESS" }),
    ]);
    const user = userEvent.setup();
    renderStaff();

    await user.click(await screen.findByRole("button", { name: /view action: no result yet/i }));
    await user.click(screen.getByRole("button", { name: "Complete" }));
    const form = await screen.findByRole("form", { name: "Edit action" });
    expect(within(form).getByLabelText("Status")).toHaveValue("COMPLETED");
    expect(within(form).getByLabelText(/^result/i)).toHaveFocus();
    expect(api.patches).toHaveLength(0);
    await user.click(within(form).getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: /view action: has a result/i }));
    await user.click(screen.getByRole("button", { name: "Complete" }));
    await waitFor(() => expect(api.patches).toHaveLength(1));
    expect(api.patches[0]).toEqual({ expectedVersion: 1, actionStatus: "COMPLETED" });
  });

  it("UI-14: Cancel asks for confirmation; Keep sends nothing and Confirm sends one request", async () => {
    const api = actionsServer([action({ id: 1, description: "To cancel", result: "Not needed any more.", actionStatus: "IN_PROGRESS" })]);
    const user = userEvent.setup();
    renderStaff();
    await user.click(await screen.findByRole("button", { name: /view action: to cancel/i }));
    await user.click(screen.getByRole("button", { name: "Cancel action" }));
    const dialog = await screen.findByRole("alertdialog", { name: /confirm cancel action/i });
    expect(dialog).toHaveTextContent("Cancel this action? This cannot be undone.");

    await user.click(within(dialog).getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.patches).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Cancel action" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api.patches).toHaveLength(1));
    expect(api.patches[0]).toEqual({ expectedVersion: 1, actionStatus: "CANCELLED" });
  });

  it("UI-14: a Completed Action is read-only plain text with no Edit button and the line 'This action is final.'", async () => {
    actionsServer([action({ id: 1, description: "Finished one", result: "Fixed.", actionStatus: "COMPLETED" })]);
    const user = userEvent.setup();
    renderStaff();
    await user.click(await screen.findByRole("button", { name: /view action: finished one/i }));
    const panel = await screen.findByRole("region", { name: "Action details" });
    expect(within(panel).getByText("This action is final.")).toBeInTheDocument();
    expect(within(panel).getByText("Fixed.")).toBeInTheDocument();
    for (const name of ["Edit", "Start", "Complete", "Cancel action"]) {
      expect(within(panel).queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(within(panel).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("UI-15: on a Resolved, Closed or Cancelled Ticket the write controls are hidden, with the reason, and the list stays readable", async () => {
    const reasons: Record<string, string> = {
      RESOLVED: "Actions cannot be changed while the ticket is Resolved. Reopen it first.",
      CLOSED: "Actions cannot be changed while the ticket is Closed.",
      CANCELLED: "Actions cannot be changed while the ticket is Cancelled.",
    };
    for (const status of Object.keys(reasons)) {
      actionsServer([action({ description: `Visible on ${status}`, actionStatus: "COMPLETED", result: "Done." })], { ticket: { currentStatus: status } });
      const user = userEvent.setup();
      const view = renderStaff();
      expect(await screen.findByText(`Visible on ${status}`)).toBeInTheDocument();
      expect(screen.getByText(reasons[status])).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add Action" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: new RegExp(`view action: visible on ${status}`, "i") }));
      expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it("UI-16: an Administrator can add and edit Actions, with no default assignee, while owner, priority and status stay read-only", async () => {
    const api = actionsServer([action({ description: "Admin can edit this" })], { user: ADMIN });
    const user = userEvent.setup();
    renderStaff();
    await screen.findByText("Admin can edit this");
    expect(screen.queryByLabelText("Ticket Owner")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("IT Priority")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Current Status")).not.toBeInTheDocument();

    const form = await openCreate(user);
    expect(within(form).getByLabelText(/^assignee/i)).toHaveValue(""); // an Administrator cannot be assignee
    await user.type(within(form).getByLabelText(/action description/i), "Admin note of work");
    await user.click(within(form).getByRole("button", { name: "Save action" }));
    expect(await within(form).findByText("Choose an assignee.")).toBeInTheDocument();
    expect(api.posts).toHaveLength(0);
    await user.selectOptions(within(form).getByLabelText(/^assignee/i), "9");
    await user.click(within(form).getByRole("button", { name: "Save action" }));
    await waitFor(() => expect(api.posts).toHaveLength(1));

    await user.click(await screen.findByRole("button", { name: /view action: admin can edit this/i }));
    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("UI-17: the Requester sees every Action of their own Ticket read-only, and an empty message when there are none", async () => {
    const withActions = [
      action({
        id: 1,
        description: "Replaced the laptop battery.",
        result: "Battery now holds charge.",
        actionStatus: "COMPLETED",
        followUpRequired: true,
        followUpNote: "Check battery health next week.",
        attachmentNotes: "Photo of the old battery is attached.",
      }),
    ];
    for (const items of [withActions, []]) {
      server.use(
        http.get(`${API_URL}/api/auth/me`, () => HttpResponse.json(REQUESTER)),
        http.get(`${API_URL}/api/tickets/:id/actions`, () =>
          HttpResponse.json({ items, counts: { open: 0, completed: items.length, cancelled: 0 } }),
        ),
      );
      const view = render(
        <MemoryRouter initialEntries={["/tickets/1"]}>
          <AuthProvider>
            <AppRouter />
          </AuthProvider>
        </MemoryRouter>,
      );
      const heading = await screen.findByRole("heading", { name: "Actions Taken" });
      const section = heading.closest("section") as HTMLElement;
      if (items.length === 0) {
        expect(await within(section).findByText("No actions recorded yet.")).toBeInTheDocument();
      } else {
        const list = await within(section).findByRole("list", { name: "Actions taken" });
        for (const text of [
          "Replaced the laptop battery.",
          "Battery now holds charge.",
          "Check battery health next week.",
          "Photo of the old battery is attached.",
          "Michael Brown",
          "Jennifer Anderson",
        ]) {
          expect(within(list).getByText(text)).toBeInTheDocument();
        }
        expect(within(list).getByText("Follow-up needed")).toBeInTheDocument();
      }
      expect(within(section).queryByRole("button")).not.toBeInTheDocument(); // no write controls at all
      view.unmount();
    }
  });

  it("UI-18: lists several Actions in the order the API gives, each with its status badge and follow-up marker", async () => {
    actionsServer([
      action({ id: 11, description: "First planned", actionStatus: "PLANNED" }),
      action({ id: 12, description: "Second in progress", actionStatus: "IN_PROGRESS", followUpRequired: true, followUpNote: "Ask again." }),
      action({ id: 13, description: "Third completed", actionStatus: "COMPLETED", result: "ok" }),
      action({ id: 14, description: "Fourth cancelled", actionStatus: "CANCELLED", result: "no" }),
    ]);
    renderStaff();
    const list = await screen.findByRole("list", { name: "Actions taken" });
    const rows = within(list).getAllByRole("listitem").filter((li) => !li.classList.contains("zen-action-header"));
    expect(rows.map((r) => r.querySelector(".zen-action-cell-desc")?.textContent)).toEqual([
      "First planned",
      "Second in progress",
      "Third completed",
      "Fourth cancelled",
    ]);
    expect(within(rows[0]).getByText("Planned")).toBeInTheDocument();
    expect(within(rows[1]).getByText("In Progress")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Follow-up needed")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Completed")).toBeInTheDocument();
    expect(within(rows[3]).getByText("Cancelled")).toBeInTheDocument();
    expect(within(rows[0]).queryByText("Follow-up needed")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Actions Taken (4)" })).toBeInTheDocument();
  });
});
