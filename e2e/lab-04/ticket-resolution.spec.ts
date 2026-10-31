import { test, expect, Browser } from "@playwright/test";
import { ACCOUNTS, API, apiSession, createTicketViaApi, loginAs, patchTicket, stamp } from "./helpers";

async function staffPage(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, email, "IT_STAFF");
  return page;
}

// A Ticket the Jennifer account owns and has started, with one Planned Action on it.
async function workedTicket(tag: string) {
  const requesterApi = await apiSession(ACCOUNTS.requester);
  const staffApi = await apiSession(ACCOUNTS.staff);
  const me = (await (await staffApi.get("/api/auth/me")).json()).id as number;
  const id = await createTicketViaApi(requesterApi, `E2E resolution ${tag}`);
  expect((await patchTicket(staffApi, id, "owner", { ownerId: me })).status()).toBe(200);
  expect((await patchTicket(staffApi, id, "status", { status: "IN_PROGRESS" })).status()).toBe(200);
  const made = await staffApi.post(`/api/staff/tickets/${id}/actions`, {
    data: { clientRequestId: `e2e-${stamp()}`, description: `Replace the battery ${tag}`, assigneeId: me },
  });
  expect(made.status()).toBe(201);
  return { id, staffApi, me, requesterApi };
}

// docs/lab-04/tests.md E2E-02 - specification.md AC-16 to AC-20, AC-22, AC-24. The resolution gate, the stale-update
// conflict, the cancel cascade and Reopen, through the real screens.
test.describe("E2E-02 ticket resolution", () => {
  test("Resolve is blocked while an Action is open, then goes through once the Action is Completed", async ({ browser }) => {
    const tag = stamp();
    const { id, staffApi } = await workedTicket(tag);
    const page = await staffPage(browser, ACCOUNTS.staff);
    await page.goto(`/staff/tickets/${id}`);

    // The screen explains it and keeps Update status off ...
    await page.getByLabel("Current Status").selectOption({ label: "Resolved" });
    await expect(page.getByText("Resolved is not available yet.")).toBeVisible();
    await expect(page.getByText(/Finish or cancel 1 open action/)).toBeVisible();
    await expect(page.getByText("Complete at least one action.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Update status" })).toBeDisabled();

    // ... and the server refuses it too, whatever the screen does (AC-17).
    const direct = await patchTicket(staffApi, id, "status", { status: "RESOLVED", resolutionSummary: "Bypassing the screen" });
    expect(direct.status()).toBe(409);
    expect((await direct.json()).error).toBe("RESOLUTION_BLOCKED");

    // Complete the Action from the link in the message.
    await page.getByRole("button", { name: "Open Actions Taken" }).click();
    await page.getByRole("button", { name: new RegExp(`view action: Replace the battery ${tag}`, "i") }).click();
    await page.getByRole("button", { name: "Complete" }).click();
    const form = page.getByRole("form", { name: "Edit action" });
    await form.getByLabel(/^Result/).fill("Battery replaced under warranty.");
    await form.getByRole("button", { name: "Save action" }).click();
    await expect(page.getByRole("region", { name: "Action details" }).getByText("This action is final.")).toBeVisible();

    // Now Resolved is allowed, and the header status changes without a reload (AC-22).
    await page.getByLabel("Current Status").selectOption({ label: "Resolved" });
    await expect(page.getByText("Resolved is not available yet.")).toHaveCount(0);
    await page.getByLabel(/Resolution Summary/).fill("Replaced the battery; the runtime is back to normal.");
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(page.getByRole("heading", { name: /^TKT-/ }).locator("xpath=..").getByText("Resolved")).toBeVisible();
    await expect(page.getByLabel("Current Status")).toContainText("Resolved (current)");

    // Resolved locks Actions; Reopen unlocks them, and the gate applies again (AC-24).
    await expect(page.getByRole("button", { name: "Add Action" })).toHaveCount(0);
    await page.getByLabel("Current Status").selectOption({ label: "Reopened" });
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(page.getByLabel("Current Status")).toContainText("Reopened (current)");
    await page.getByRole("tab", { name: /^Actions Taken/ }).click();
    await expect(page.getByRole("button", { name: "Add Action" })).toBeVisible();
    await page.context().close();
  });

  test("Two sessions change the same Ticket: the second gets a conflict, keeps its choice, and succeeds after Reload latest", async ({ browser }) => {
    const { id } = await workedTicket(stamp());
    const first = await staffPage(browser, ACCOUNTS.staff);
    const second = await staffPage(browser, ACCOUNTS.staff2);
    await first.goto(`/staff/tickets/${id}`);
    await second.goto(`/staff/tickets/${id}`);
    await expect(first.getByLabel("IT Priority")).toHaveValue("MEDIUM");
    await expect(second.getByLabel("IT Priority")).toHaveValue("MEDIUM");

    await first.getByLabel("IT Priority").selectOption({ label: "High" });
    await expect.poll(async () => first.getByLabel("IT Priority").inputValue()).toBe("HIGH");
    await expect(first.getByText(/changed by someone else/)).toHaveCount(0);

    // The second session still holds the old version.
    await second.getByLabel("IT Priority").selectOption({ label: "Urgent" });
    await expect(second.getByText(/changed by someone else/)).toBeVisible();
    await expect(second.getByLabel("IT Priority")).toHaveValue("URGENT"); // the choice stays visible
    await second.getByRole("button", { name: "Reload latest" }).click();
    await expect(second.getByText(/changed by someone else/)).toHaveCount(0);
    await expect(second.getByLabel("IT Priority")).toHaveValue("HIGH"); // now it shows what the first session saved

    await second.getByLabel("IT Priority").selectOption({ label: "Urgent" });
    await expect.poll(async () => second.getByLabel("IT Priority").inputValue()).toBe("URGENT");
    await expect(second.getByText(/changed by someone else/)).toHaveCount(0);
    await Promise.all([first, second].map((p) => p.context().close()));
  });

  test("Cancelling a Ticket asks first, and cancels its open Actions with a reason", async ({ browser }) => {
    const tag = stamp();
    const { id } = await workedTicket(tag);
    const page = await staffPage(browser, ACCOUNTS.staff);
    await page.goto(`/staff/tickets/${id}`);

    await page.getByLabel("Current Status").selectOption({ label: "Cancelled" });
    await page.getByRole("button", { name: "Update status" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Confirm status change" });
    await expect(confirm).toContainText("Open actions on this ticket will be cancelled.");
    await confirm.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("This ticket is closed and can no longer be changed.")).toBeVisible();

    await page.getByRole("tab", { name: /^Actions Taken/ }).click();
    await page.getByRole("button", { name: new RegExp(`view action: Replace the battery ${tag}`, "i") }).click();
    const panel = page.getByRole("region", { name: "Action details" });
    await expect(panel.getByText("Cancelled", { exact: true })).toBeVisible();
    await expect(panel).toContainText("Cancelled automatically because the Ticket was cancelled.");
    await expect(panel.getByText("This action is final.")).toBeVisible();
    await page.context().close();
  });

  test("a Requester cannot reach the resolution endpoints, and the API refuses an out-of-date version", async () => {
    const { id, staffApi, requesterApi } = await workedTicket(stamp());
    const stale = await staffApi.patch(`/api/staff/tickets/${id}/status`, { data: { status: "WAITING_FOR_REQUESTER", expectedVersion: 1 } });
    expect(stale.status()).toBe(409);
    expect((await stale.json()).error).toBe("STALE_VERSION");
    const missing = await staffApi.patch(`/api/staff/tickets/${id}/status`, { data: { status: "WAITING_FOR_REQUESTER" } });
    expect(missing.status()).toBe(400);
    expect((await requesterApi.patch(`${API}/api/staff/tickets/${id}/status`, { data: { status: "RESOLVED", expectedVersion: 1 } })).status()).toBe(403);
  });
});
