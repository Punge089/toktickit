import { test, expect, Locator, Page } from "@playwright/test";
import { ACCOUNTS, VIEWPORTS, apiSession, createTicketViaApi, patchTicket, shot, stamp } from "./helpers";
import { loginViaUi } from "../lab-03/helpers";

// docs/lab-04/tests.md RESP-01 to RESP-05 - specification.md AC-37, FR-22; ui-spec.md §11 and §12.
// Every major Lab 4 screen state at 1280, 850 and 375 px, into artifacts/lab-04/screenshots/<folder>/, after
// asserting there is no horizontal page scroll. Tickets are arranged through the API so each screen is captured in
// a known state, then viewed through the real UI. A few failure and conflict states are produced by answering one
// request with the error the server would send (marked "(mocked answer)" in ui-spec §13), because they cannot be
// made to happen on demand with real data.

const fx = { work: 0, resolved: 0, tag: "" };

const ZERO_STAFF = {
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

async function login(page: Page, email: string) {
  await loginViaUi(page, email);
  await expect(page.getByRole("heading", { name: /^Welcome back,/ })).toBeVisible();
}

test.beforeAll(async () => {
  fx.tag = stamp();
  const requester = await apiSession(ACCOUNTS.requester);
  const staff = await apiSession(ACCOUNTS.staff);
  const staff2 = await apiSession(ACCOUNTS.staff2);
  const me = (await (await staff.get("/api/auth/me")).json()).id as number;
  const other = (await (await staff2.get("/api/auth/me")).json()).id as number;

  const action = async (ticketId: number, data: Record<string, unknown>) => {
    const res = await staff.post(`/api/staff/tickets/${ticketId}/actions`, { data: { clientRequestId: `e2e-${stamp()}`, assigneeId: me, ...data } });
    expect(res.status(), "create action").toBe(201);
    return res.json();
  };

  // A: a Ticket in progress with one Action in each of the four statuses.
  fx.work = await createTicketViaApi(requester, `Shot actions ${fx.tag}`);
  expect((await patchTicket(staff, fx.work, "owner", { ownerId: me })).status()).toBe(200);
  expect((await patchTicket(staff, fx.work, "status", { status: "IN_PROGRESS" })).status()).toBe(200);
  await action(fx.work, { description: "Order a replacement charger and confirm the delivery date", assigneeId: other });
  await action(fx.work, {
    description: "Replace the laptop battery under warranty",
    actionStatus: "IN_PROGRESS",
    followUpRequired: true,
    followUpNote: "Check the battery health again next week.",
    attachmentNotes: "Photo of the old battery is attached to the ticket.",
  });
  await action(fx.work, { description: "Check the battery health report", actionStatus: "COMPLETED", result: "Battery health is 61 percent; replacement approved." });
  const toCancel = await action(fx.work, { description: "Try the spare charger from the loan pool" });
  const cancelled = await staff.patch(`/api/staff/tickets/${fx.work}/actions/${toCancel.id}`, {
    data: { expectedVersion: toCancel.version, actionStatus: "CANCELLED", result: "Not needed: the charger was not the cause." },
  });
  expect(cancelled.status()).toBe(200);

  // B: a Resolved Ticket with a Completed Action (Actions are locked on it).
  fx.resolved = await createTicketViaApi(requester, `Shot resolved ${fx.tag}`);
  expect((await patchTicket(staff, fx.resolved, "owner", { ownerId: me })).status()).toBe(200);
  expect((await patchTicket(staff, fx.resolved, "status", { status: "IN_PROGRESS" })).status()).toBe(200);
  await action(fx.resolved, { description: "Reseat the docking station cable", actionStatus: "COMPLETED", result: "Monitors are detected again." });
  expect((await patchTicket(staff, fx.resolved, "status", { status: "RESOLVED", resolutionSummary: "Reseated the cable; both monitors work." })).status()).toBe(200);
});

// Computed outline or box-shadow on the focused control: visible when the keyboard drives focus (RESP-05).
async function expectFocusIndicator(page: Page, locator: Locator, label: string) {
  await page.keyboard.press("Shift");
  await locator.focus();
  const style = await locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { outlineStyle: cs.outlineStyle, outlineWidth: parseFloat(cs.outlineWidth), boxShadow: cs.boxShadow };
  });
  const visible = (style.outlineStyle !== "none" && style.outlineWidth > 0) || style.boxShadow !== "none";
  expect(visible, `${label}: ${JSON.stringify(style)}`).toBe(true);
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    // ------------------------------------------------------------ RESP-01 IT Staff Dashboard
    test("IT Staff Dashboard: loaded", async ({ page }) => {
      await login(page, ACCOUNTS.staff);
      await expect(page.getByRole("link", { name: /^New: \d+, view tickets$/ })).toBeVisible();
      await expect(page.getByRole("region", { name: "My Open Actions" })).toBeVisible();
      await shot(page, "staff-dashboard", vp, "loaded");
    });

    test("IT Staff Dashboard: zero data (mocked answer)", async ({ page }) => {
      await page.route("**/api/dashboard/staff", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ZERO_STAFF) }));
      await login(page, ACCOUNTS.staff);
      await expect(page.getByText("No urgent tickets.")).toBeVisible();
      await expect(page.getByText("You have no open actions.")).toBeVisible();
      await shot(page, "staff-dashboard", vp, "zero");
    });

    test("IT Staff Dashboard: loading", async ({ page }) => {
      await login(page, ACCOUNTS.staff);
      await page.route("**/api/dashboard/staff", async (route) => {
        await new Promise((r) => setTimeout(r, 4000));
        await route.continue();
      });
      await page.reload();
      await expect(page.getByText("Loading dashboard…")).toBeVisible();
      await shot(page, "staff-dashboard", vp, "loading");
    });

    test("IT Staff Dashboard: failure with Retry (mocked answer)", async ({ page }) => {
      await page.route("**/api/dashboard/staff", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "INTERNAL_ERROR" }) }));
      await loginViaUi(page, ACCOUNTS.staff);
      await expect(page.getByText("We could not load the dashboard.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
      await shot(page, "staff-dashboard", vp, "failure");
    });

    test("IT Staff Dashboard: the Administrator's read-only view", async ({ page }) => {
      await login(page, ACCOUNTS.admin);
      await expect(page.getByText("Read-only view of the IT Staff dashboard.")).toBeVisible();
      await expect(page.getByRole("link", { name: /^Accounts/ })).toBeVisible();
      await shot(page, "staff-dashboard", vp, "admin");
    });

    // ------------------------------------------------------------ RESP-02 Requester Dashboard
    test("Requester Dashboard: loaded", async ({ page }) => {
      await login(page, ACCOUNTS.requester);
      await expect(page.getByRole("link", { name: /^Open Tickets: \d+, view tickets$/ })).toBeVisible();
      await shot(page, "requester-dashboard", vp, "loaded");
    });

    test("Requester Dashboard: zero data (an account with no Tickets)", async ({ page }) => {
      await login(page, "buppha.ratanakorn@example.dev");
      await expect(page.getByText("Nothing needs your attention right now.")).toBeVisible();
      await expect(page.getByText("You have no tickets yet. Create one to get started.")).toBeVisible();
      await shot(page, "requester-dashboard", vp, "zero");
    });

    test("Requester Dashboard: failure with Retry (mocked answer)", async ({ page }) => {
      await page.route("**/api/dashboard/requester", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "INTERNAL_ERROR" }) }));
      await loginViaUi(page, ACCOUNTS.requester);
      await expect(page.getByText("We could not load the dashboard.")).toBeVisible();
      await shot(page, "requester-dashboard", vp, "failure");
    });

    // ------------------------------------------------------------ RESP-03 Actions Taken
    test("Actions Taken: the list, with one Action in each status", async ({ page }) => {
      await login(page, ACCOUNTS.staff);
      await page.goto(`/staff/tickets/${fx.work}?tab=actions`);
      await expect(page.getByRole("list", { name: "Actions taken" })).toBeVisible();
      await expect(page.locator(".zen-action-row")).toHaveCount(4);
      await shot(page, "actions-taken", vp, "list");
    });

    test("Actions Taken: the create form and its validation", async ({ page }) => {
      await login(page, ACCOUNTS.staff);
      await page.goto(`/staff/tickets/${fx.work}?tab=actions`);
      await page.getByRole("button", { name: "Add Action" }).click();
      await expect(page.getByRole("form", { name: "Add action" })).toBeVisible();
      await shot(page, "actions-taken", vp, "create");
      await page.getByRole("button", { name: "Save action" }).click();
      await expect(page.getByText("Action Description is required.")).toBeVisible();
      await shot(page, "actions-taken", vp, "validation");
    });

    test("Actions Taken: the edit form of an open Action", async ({ page }) => {
      await login(page, ACCOUNTS.staff);
      await page.goto(`/staff/tickets/${fx.work}?tab=actions`);
      await page.getByRole("button", { name: /view action: Order a replacement charger/i }).click();
      await page.getByRole("button", { name: "Edit" }).click();
      await expect(page.getByRole("form", { name: "Edit action" })).toBeVisible();
      await shot(page, "actions-taken", vp, "edit");
    });

    test("Actions Taken: a Completed Action is final, plain text", async ({ page }) => {
      await login(page, ACCOUNTS.staff);
      await page.goto(`/staff/tickets/${fx.work}?tab=actions`);
      await page.getByRole("button", { name: /view action: Check the battery health report/i }).click();
      await expect(page.getByText("This action is final.")).toBeVisible();
      await shot(page, "actions-taken", vp, "final");
    });

    test("Actions Taken: a stale edit keeps what was typed (mocked answer)", async ({ page }) => {
      await page.route("**/api/staff/tickets/*/actions/*", (route) =>
        route.request().method() === "PATCH"
          ? route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "STALE_VERSION", message: "This action was changed by someone else.", currentVersion: 2 }) })
          : route.continue(),
      );
      await login(page, ACCOUNTS.staff);
      await page.goto(`/staff/tickets/${fx.work}?tab=actions`);
      await page.getByRole("button", { name: /view action: Order a replacement charger/i }).click();
      await page.getByRole("button", { name: "Edit" }).click();
      await page.getByLabel(/Action Description/).fill("Order a replacement charger and a spare cable");
      await page.getByRole("button", { name: "Save action" }).click();
      await expect(page.getByText(/Someone else changed this action/)).toBeVisible();
      await shot(page, "actions-taken", vp, "stale");
    });

    test("Actions Taken: an assignee who is no longer active (mocked answer)", async ({ page }) => {
      await page.route("**/api/staff/tickets/*/actions", (route) =>
        route.request().method() === "POST"
          ? route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "INVALID_ASSIGNEE", message: "The assignee must be an active IT Staff user." }) })
          : route.continue(),
      );
      await login(page, ACCOUNTS.staff);
      await page.goto(`/staff/tickets/${fx.work}?tab=actions`);
      await page.getByRole("button", { name: "Add Action" }).click();
      await page.getByLabel(/Action Description/).fill("Hand the follow-up over to a colleague");
      await page.getByRole("button", { name: "Save action" }).click();
      await expect(page.getByText("Choose an active IT Staff member.")).toBeVisible();
      await shot(page, "actions-taken", vp, "inactive-assignee");
    });

    test("Actions Taken: the Requester's read-only view", async ({ page }) => {
      await login(page, ACCOUNTS.requester);
      await page.goto(`/tickets/${fx.work}`);
      await expect(page.getByRole("list", { name: "Actions taken" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Actions Taken" }).locator("xpath=ancestor::section").getByRole("button")).toHaveCount(0);
      await shot(page, "actions-taken", vp, "requester-view");
    });

    test("Actions Taken: locked on a Resolved Ticket", async ({ page }) => {
      await login(page, ACCOUNTS.staff);
      await page.goto(`/staff/tickets/${fx.resolved}?tab=actions`);
      await expect(page.getByText("Actions cannot be changed while the ticket is Resolved. Reopen it first.")).toBeVisible();
      await shot(page, "actions-taken", vp, "locked");
    });

    // ------------------------------------------------------------ RESP-04 Ticket workflow controls
    test("Ticket workflow: the allowed transitions and the Update status button", async ({ page }) => {
      await login(page, ACCOUNTS.staff);
      await page.goto(`/staff/tickets/${fx.work}`);
      await page.getByLabel("Current Status").selectOption({ label: "Waiting for Requester" });
      await expect(page.getByRole("button", { name: "Update status" })).toBeEnabled();
      await shot(page, "ticket-workflow", vp, "allowed-transitions");
    });

    test("Ticket workflow: Resolved is explained and blocked while Actions are open", async ({ page }) => {
      await login(page, ACCOUNTS.staff);
      await page.goto(`/staff/tickets/${fx.work}`);
      await page.getByLabel("Current Status").selectOption({ label: "Resolved" });
      await expect(page.getByText("Resolved is not available yet.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Update status" })).toBeDisabled();
      await shot(page, "ticket-workflow", vp, "resolution-blocked");
    });

    test("Ticket workflow: a Resolved Ticket", async ({ page }) => {
      await login(page, ACCOUNTS.staff);
      await page.goto(`/staff/tickets/${fx.resolved}`);
      await expect(page.getByLabel("Current Status")).toContainText("Resolved (current)");
      await shot(page, "ticket-workflow", vp, "resolved");
    });

    test("Ticket workflow: a stale priority change keeps the choice (mocked answer)", async ({ page }) => {
      await page.route("**/api/staff/tickets/*/it-priority", (route) =>
        route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "STALE_VERSION", message: "This ticket was changed by someone else.", currentVersion: 9 }) }),
      );
      await login(page, ACCOUNTS.staff);
      await page.goto(`/staff/tickets/${fx.work}`);
      await page.getByLabel("IT Priority").selectOption({ label: "Urgent" });
      await expect(page.getByText(/changed by someone else/)).toBeVisible();
      await expect(page.getByLabel("IT Priority")).toHaveValue("URGENT");
      await shot(page, "ticket-workflow", vp, "stale");
    });
  });
}

// ------------------------------------------------------------ RESP-05 keyboard focus (desktop width only)
test.describe("keyboard focus is visible on the new controls", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("Dashboard cards, the Action form and the status control", async ({ page }) => {
    const vp = VIEWPORTS[0];
    await login(page, ACCOUNTS.staff);
    const firstCard = page.getByRole("link", { name: /^New: \d+, view tickets$/ });
    await expectFocusIndicator(page, firstCard, "dashboard card");
    await expectFocusIndicator(page, page.getByRole("link", { name: /^Urgent: \d+, view tickets$/ }), "priority link");
    await expectFocusIndicator(page, page.getByRole("button", { name: "Refresh" }), "Refresh button");
    await expectFocusIndicator(page, page.getByRole("link", { name: "Dashboard" }), "navigation link");
    await firstCard.focus();
    await shot(page, "focus", vp, "dashboard-card");

    await page.goto(`/staff/tickets/${fx.work}?tab=actions`);
    await page.getByRole("button", { name: "Add Action" }).click();
    const form = page.getByRole("form", { name: "Add action" });
    for (const [label, locator] of [
      ["date", form.getByLabel("Date")],
      ["time", form.getByLabel("Time")],
      ["assignee", form.getByLabel(/^Assignee/)],
      ["description", form.getByLabel(/Action Description/)],
      ["status", form.getByLabel("Status")],
      ["result", form.getByLabel(/^Result/)],
      ["follow-up checkbox", form.getByLabel("Follow-up required?")],
      ["attachment notes", form.getByLabel("Attachment Notes")],
      ["Save action", form.getByRole("button", { name: "Save action" })],
      ["Cancel", form.getByRole("button", { name: "Cancel" })],
    ] as Array<[string, Locator]>) {
      await expectFocusIndicator(page, locator, `Action form ${label}`);
    }
    await form.getByLabel(/Action Description/).focus();
    await shot(page, "focus", vp, "action-form");

    await page.goto(`/staff/tickets/${fx.work}`);
    await expectFocusIndicator(page, page.getByLabel("Current Status"), "status control");
    await expectFocusIndicator(page, page.getByRole("tab", { name: /^Actions Taken/ }), "Actions Taken tab");
    await page.getByLabel("Current Status").focus();
    await shot(page, "focus", vp, "status-control");
  });
});
