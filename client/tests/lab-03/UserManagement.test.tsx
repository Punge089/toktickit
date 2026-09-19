import { describe, it, expect } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { AppRouter } from "../../src/AppRouter.js";

const API_URL = "http://localhost:3000";

const ADMIN = {
  id: 12,
  fullName: "John Smith",
  email: "john.smith@example.dev",
  role: "ADMINISTRATOR" as const,
  mustChangePassword: false,
};

const USERS = [
  { id: 12, fullName: "John Smith", email: "john.smith@example.dev", role: "ADMINISTRATOR", isActive: true },
  { id: 2, fullName: "Aran Suksawat", email: "aran.suksawat@example.dev", role: "REQUESTER", isActive: true },
  { id: 8, fullName: "Jennifer Anderson", email: "jennifer.anderson@example.dev", role: "IT_STAFF", isActive: true },
  { id: 5, fullName: "Robert Wilson", email: "robert.wilson@example.dev", role: "IT_STAFF", isActive: false },
];

const VALID_PASSWORD = "Temp#Passw0rd1";

function list(items: unknown[] = USERS, activeAdministratorCount = 2) {
  return HttpResponse.json({ items, activeAdministratorCount });
}

function renderUsers() {
  server.use(http.get(`${API_URL}/api/auth/me`, () => HttpResponse.json(ADMIN)));
  return render(
    <MemoryRouter initialEntries={["/admin/users"]}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function openCreatePanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /create user/i }));
  return screen.findByRole("region", { name: /create new user/i });
}

async function openEditPanel(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("button", { name: `Edit ${name}` }));
  return screen.findByRole("region", { name: /edit user/i });
}

// docs/lab-03/tests.md UI-13, UI-14, UI-17..UI-22 - specification.md
// AC-25..AC-28; ui-spec.md section 9.
describe("Administrator User Management screen", () => {
  // UI-17, FR-17
  it("lists users with Name, Email, Role, Status and an Edit action, and has no pagination", async () => {
    server.use(http.get(`${API_URL}/api/admin/users`, () => list()));
    renderUsers();

    const table = await screen.findByRole("table", { name: /users/i });
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Name", "Email", "Role", "Status", "Action"]);

    const jennifer = within(table).getByText("Jennifer Anderson").closest('[role="row"]') as HTMLElement;
    expect(within(jennifer).getByText("jennifer.anderson@example.dev")).toBeInTheDocument();
    expect(within(jennifer).getByText("IT Staff")).toBeInTheDocument();
    expect(within(jennifer).getByText("Active")).toBeInTheDocument();
    expect(within(jennifer).getByRole("button", { name: "Edit Jennifer Anderson" })).toBeInTheDocument();

    const robert = within(table).getByText("Robert Wilson").closest('[role="row"]') as HTMLElement;
    expect(within(robert).getByText("Inactive")).toBeInTheDocument();

    // Not required by labsheet 8.5, so not built.
    expect(screen.queryByRole("button", { name: /^(prev|next)$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/page \d+ of/i)).not.toBeInTheDocument();
  });

  // UI-18
  it("refetches with the search term and the role filter, and offers Clear filters when nothing matches", async () => {
    const seen: string[] = [];
    server.use(
      http.get(`${API_URL}/api/admin/users`, ({ request }) => {
        const url = new URL(request.url);
        seen.push(`${url.searchParams.get("search") ?? ""}|${url.searchParams.get("role") ?? ""}`);
        if (url.searchParams.get("search") === "nobody") return list([]);
        return list();
      }),
    );
    const user = userEvent.setup();
    renderUsers();
    await screen.findByText("Jennifer Anderson");

    await user.selectOptions(screen.getByLabelText("Role"), "IT_STAFF");
    await waitFor(() => expect(seen).toContain("|IT_STAFF"));

    await user.type(screen.getByLabelText("Search"), "nobody");
    await waitFor(() => expect(seen).toContain("nobody|IT_STAFF"));

    expect(await screen.findByText(/no users match your search/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /clear filters/i })[0]);
    await waitFor(() => expect(seen[seen.length - 1]).toBe("|"));
    expect(await screen.findByText("Jennifer Anderson")).toBeInTheDocument();
    expect(screen.getByLabelText("Search")).toHaveValue("");
  });

  // UI-18 (empty / failure / forbidden feedback)
  it("shows an empty state, then a failure with Retry that recovers, and a forbidden message on 403", async () => {
    server.use(http.get(`${API_URL}/api/admin/users`, () => list([])));
    const { unmount } = renderUsers();
    expect(await screen.findByText(/no users yet/i)).toBeInTheDocument();
    unmount();

    let calls = 0;
    server.use(
      http.get(`${API_URL}/api/admin/users`, () => {
        calls += 1;
        return calls === 1 ? HttpResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 }) : list();
      }),
    );
    const user = userEvent.setup();
    const second = renderUsers();
    expect(await screen.findByText(/unable to load users/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText("Jennifer Anderson")).toBeInTheDocument();
    second.unmount();

    server.use(http.get(`${API_URL}/api/admin/users`, () => HttpResponse.json({ error: "FORBIDDEN" }, { status: 403 })));
    renderUsers();
    expect(await screen.findByText(/you don't have access to user management/i)).toBeInTheDocument();
  });

  // UI-19, AC-25 (success path), BR-28
  it("creates a user: sends the form, closes the panel, refreshes the list and confirms", async () => {
    let posted: Record<string, unknown> | null = null;
    let listCalls = 0;
    server.use(
      http.get(`${API_URL}/api/admin/users`, () => {
        listCalls += 1;
        return list();
      }),
      http.post(`${API_URL}/api/admin/users`, async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 30, ...posted, initialPassword: undefined }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderUsers();
    const panel = await openCreatePanel(user);

    await user.type(within(panel).getByLabelText(/full name/i), "  Alex Thompson ");
    await user.type(within(panel).getByLabelText(/email address/i), "alex.thompson@example.dev");
    await user.selectOptions(within(panel).getByLabelText(/^role/i), "IT_STAFF");
    await user.type(within(panel).getByLabelText(/^initial password/i), VALID_PASSWORD);
    await user.click(within(panel).getByRole("button", { name: /save user/i }));

    expect(await screen.findByText("User saved.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /create new user/i })).not.toBeInTheDocument();
    expect(posted).toEqual({
      fullName: "Alex Thompson",
      email: "alex.thompson@example.dev",
      role: "IT_STAFF",
      isActive: true,
      initialPassword: VALID_PASSWORD,
    });
    await waitFor(() => expect(listCalls).toBeGreaterThanOrEqual(2));
  });

  // UI-19 (client-side validation), AC-25
  it("blocks Save on an empty form and on a password that misses a rule, without calling the API", async () => {
    let posts = 0;
    server.use(
      http.get(`${API_URL}/api/admin/users`, () => list()),
      http.post(`${API_URL}/api/admin/users`, () => {
        posts += 1;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderUsers();
    const panel = await openCreatePanel(user);

    await user.click(within(panel).getByRole("button", { name: /save user/i }));
    expect(within(panel).getByText("Full name is required.")).toBeInTheDocument();
    expect(within(panel).getByText("Email is required.")).toBeInTheDocument();
    expect(within(panel).getByText(/initial password must meet every rule/i)).toBeInTheDocument();

    await user.type(within(panel).getByLabelText(/full name/i), "Alex");
    await user.type(within(panel).getByLabelText(/email address/i), "not-an-email");
    await user.type(within(panel).getByLabelText(/^initial password/i), "alllowercase1!");
    await user.click(within(panel).getByRole("button", { name: /save user/i }));
    expect(within(panel).getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(within(panel).getByText(/initial password must meet every rule/i)).toBeInTheDocument();
    expect(posts).toBe(0);
  });

  // UI-13, AC-25
  it("shows a duplicate email as a field-level message under Email and keeps the panel open", async () => {
    server.use(
      http.get(`${API_URL}/api/admin/users`, () => list()),
      http.post(`${API_URL}/api/admin/users`, () =>
        HttpResponse.json({ error: "EMAIL_TAKEN", message: "That email address is already in use." }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    renderUsers();
    const panel = await openCreatePanel(user);

    await user.type(within(panel).getByLabelText(/full name/i), "Alex Thompson");
    await user.type(within(panel).getByLabelText(/email address/i), "aran.suksawat@example.dev");
    await user.type(within(panel).getByLabelText(/^initial password/i), VALID_PASSWORD);
    await user.click(within(panel).getByRole("button", { name: /save user/i }));

    const emailField = within(panel).getByLabelText(/email address/i);
    await waitFor(() => expect(emailField).toHaveAttribute("aria-invalid", "true"));
    const message = await within(panel).findByText("That email address is already in use.");
    expect(message).toHaveAttribute("id", emailField.getAttribute("aria-describedby"));
    expect(screen.getByRole("region", { name: /create new user/i })).toBeInTheDocument();
    expect(screen.queryByText("User saved.")).not.toBeInTheDocument();
  });

  // UI-14, AC-27
  it("disables Role and Active with an explanation when the Administrator edits their own account", async () => {
    server.use(http.get(`${API_URL}/api/admin/users`, () => list(USERS, 2)));
    const user = userEvent.setup();
    renderUsers();
    const panel = await openEditPanel(user, "John Smith");

    expect(within(panel).getByLabelText(/^role/i)).toBeDisabled();
    expect(within(panel).getByRole("switch", { name: /active/i })).toBeDisabled();
    expect(within(panel).getByText("You cannot change your own role or active state.")).toBeInTheDocument();
    // Another active Administrator exists, so only the self rule applies.
    expect(within(panel).queryByText(/at least one active administrator/i)).not.toBeInTheDocument();

    // Name and email stay editable.
    expect(within(panel).getByLabelText(/full name/i)).toBeEnabled();
    expect(within(panel).getByLabelText(/email address/i)).toBeEnabled();
  });

  // UI-14, AC-27 + AC-28: the sole active Administrator editing their own account
  it("shows both explanations when the Administrator is also the only active Administrator", async () => {
    server.use(http.get(`${API_URL}/api/admin/users`, () => list(USERS, 1)));
    const user = userEvent.setup();
    renderUsers();
    const panel = await openEditPanel(user, "John Smith");

    expect(within(panel).getByLabelText(/^role/i)).toBeDisabled();
    expect(within(panel).getByRole("switch", { name: /active/i })).toBeDisabled();
    expect(within(panel).getByText("You cannot change your own role or active state.")).toBeInTheDocument();
    expect(within(panel).getByText("At least one active Administrator must remain.")).toBeInTheDocument();
  });

  // UI-14, AC-28 (another Administrator that the list reports as the only active one)
  it("disables Role and Active with a different explanation when the user edited is the only active Administrator", async () => {
    const users = [
      { id: 40, fullName: "Only Admin", email: "only.admin@example.dev", role: "ADMINISTRATOR", isActive: true },
      { id: 41, fullName: "Old Admin", email: "old.admin@example.dev", role: "ADMINISTRATOR", isActive: false },
      USERS[1],
    ];
    server.use(http.get(`${API_URL}/api/admin/users`, () => list(users, 1)));
    const user = userEvent.setup();
    renderUsers();

    let panel = await openEditPanel(user, "Only Admin");
    expect(within(panel).getByLabelText(/^role/i)).toBeDisabled();
    expect(within(panel).getByRole("switch", { name: /active/i })).toBeDisabled();
    expect(within(panel).getByText("At least one active Administrator must remain.")).toBeInTheDocument();

    // An inactive Administrator, or any other user, is not restricted.
    panel = await openEditPanel(user, "Old Admin");
    expect(within(panel).getByLabelText(/^role/i)).toBeEnabled();
    expect(within(panel).getByRole("switch", { name: /active/i })).toBeEnabled();
    expect(within(panel).queryByText(/at least one active administrator/i)).not.toBeInTheDocument();
  });

  // UI-20, BR-29
  it("edits a user and sends only the fields that changed", async () => {
    let patched: { id: string; body: Record<string, unknown> } | null = null;
    server.use(
      http.get(`${API_URL}/api/admin/users`, () => list()),
      http.patch(`${API_URL}/api/admin/users/:id`, async ({ request, params }) => {
        patched = { id: String(params.id), body: (await request.json()) as Record<string, unknown> };
        return HttpResponse.json({ ...USERS[2], ...patched.body });
      }),
    );
    const user = userEvent.setup();
    renderUsers();
    const panel = await openEditPanel(user, "Jennifer Anderson");

    expect(within(panel).getByLabelText(/full name/i)).toHaveValue("Jennifer Anderson");
    expect(within(panel).getByRole("switch", { name: /active/i })).toBeChecked();
    // Edit mode has no password field until the disclosure is opened.
    expect(within(panel).queryByLabelText(/initial password/i)).not.toBeInTheDocument();

    await user.selectOptions(within(panel).getByLabelText(/^role/i), "REQUESTER");
    await user.click(within(panel).getByRole("switch", { name: /active/i }));
    await user.click(within(panel).getByRole("button", { name: /save user/i }));

    expect(await screen.findByText("User saved.")).toBeInTheDocument();
    expect(patched).toEqual({ id: "8", body: { role: "REQUESTER", isActive: false } });
  });

  // UI-20
  it("says so, and sends nothing, when Save is pressed with no changes", async () => {
    let patches = 0;
    server.use(
      http.get(`${API_URL}/api/admin/users`, () => list()),
      http.patch(`${API_URL}/api/admin/users/:id`, () => {
        patches += 1;
        return HttpResponse.json(USERS[2]);
      }),
    );
    const user = userEvent.setup();
    renderUsers();
    const panel = await openEditPanel(user, "Jennifer Anderson");
    await user.click(within(panel).getByRole("button", { name: /save user/i }));

    expect(await within(panel).findByText("No changes to save.")).toBeInTheDocument();
    expect(patches).toBe(0);
  });

  // UI-21, AC-26, BR-30
  it("sets a new initial password from a collapsed section, only once every rule is met", async () => {
    let posted: { id: string; body: Record<string, unknown> } | null = null;
    server.use(
      http.get(`${API_URL}/api/admin/users`, () => list()),
      http.post(`${API_URL}/api/admin/users/:id/initial-password`, async ({ request, params }) => {
        posted = { id: String(params.id), body: (await request.json()) as Record<string, unknown> };
        return HttpResponse.json({ id: Number(params.id), mustChangePassword: true });
      }),
    );
    const user = userEvent.setup();
    renderUsers();
    const panel = await openEditPanel(user, "Jennifer Anderson");

    // Collapsed by default, so editing basic info never implies a reset.
    const toggle = within(panel).getByRole("button", { name: /set new initial password/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(panel).queryByLabelText(/new initial password/i)).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const field = within(panel).getByLabelText(/new initial password/i);
    const submit = within(panel).getByRole("button", { name: /^set password$/i });
    expect(submit).toBeDisabled();

    await user.type(field, "weak");
    expect(submit).toBeDisabled();
    await user.clear(field);
    await user.type(field, VALID_PASSWORD);
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(await within(panel).findByText(/must change it at the next login/i)).toBeInTheDocument();
    expect(posted).toEqual({ id: "8", body: { initialPassword: VALID_PASSWORD } });
    expect(field).toHaveValue("");
    // The panel stays open and the list is not asked to close it.
    expect(screen.getByRole("region", { name: /edit user/i })).toBeInTheDocument();
  });

  // UI-22, BR-31, BR-32
  it("shows a safety-rule refusal from the API as a message in the panel, not as a field error", async () => {
    server.use(
      http.get(`${API_URL}/api/admin/users`, () => list()),
      http.patch(`${API_URL}/api/admin/users/:id`, () =>
        HttpResponse.json({ error: "LAST_ACTIVE_ADMIN", message: "At least one active Administrator must remain." }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    renderUsers();
    const panel = await openEditPanel(user, "Jennifer Anderson");
    await user.click(within(panel).getByRole("switch", { name: /active/i }));
    await user.click(within(panel).getByRole("button", { name: /save user/i }));

    const alert = await within(panel).findByRole("alert");
    expect(alert).toHaveTextContent("At least one active Administrator must remain.");
    expect(within(panel).getByLabelText(/email address/i)).not.toHaveAttribute("aria-invalid");
  });

  // UI-22, safe API-failure feedback
  it("shows a safe failure message when saving fails unexpectedly and keeps what was typed", async () => {
    server.use(
      http.get(`${API_URL}/api/admin/users`, () => list()),
      http.post(`${API_URL}/api/admin/users`, () => HttpResponse.json({ error: "INTERNAL_ERROR", message: "boom" }, { status: 500 })),
    );
    const user = userEvent.setup();
    renderUsers();
    const panel = await openCreatePanel(user);
    await user.type(within(panel).getByLabelText(/full name/i), "Alex Thompson");
    await user.type(within(panel).getByLabelText(/email address/i), "alex@example.dev");
    await user.type(within(panel).getByLabelText(/^initial password/i), VALID_PASSWORD);
    await user.click(within(panel).getByRole("button", { name: /save user/i }));

    expect(await within(panel).findByText(/unable to create the user/i)).toBeInTheDocument();
    expect(within(panel).getByLabelText(/full name/i)).toHaveValue("Alex Thompson");
  });
});
