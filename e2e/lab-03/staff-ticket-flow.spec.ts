import { test, expect, request, Browser, Page } from "@playwright/test";
import { ACCOUNTS, API, apiSession, createTicketViaApi, loginAs, selectedLabel, stamp } from "./helpers";

async function signedInPage(browser: Browser, email: string, role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR") {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, email, role);
  return page;
}

async function createTicketViaUi(page: Page, summary: string): Promise<number> {
  await page.getByRole("main").getByRole("link", { name: "Create Ticket" }).click();
  await page.getByLabel("Ticket Summary").fill(summary);
  await page.getByLabel("Description").fill("Created by the Lab 3 staff ticket flow E2E to follow one ticket through IT Staff work.");
  await page.getByLabel("Category").selectOption({ label: "Software" });
  await page.getByLabel("Related System").selectOption({ label: "Email" });
  await page.getByLabel("Requested Priority").selectOption({ label: "Low" });
  await page.getByRole("button", { name: "Submit Ticket" }).click();
  await expect(page.getByText(/^TKT-\d{4}-\d{6}$/)).toBeVisible({ timeout: 10_000 });

  await page.getByRole("banner").getByRole("link", { name: "My Tickets" }).click();
  await page.getByRole("link", { name: new RegExp(summary) }).click();
  await expect(page).toHaveURL(/\/tickets\/\d+$/);
  return Number(page.url().split("/").pop());
}

async function openStaffTicketFromQueue(page: Page, summary: string) {
  await page.getByRole("banner").getByRole("link", { name: "My Queue" }).click();
  await page.getByLabel("Search").fill(summary);
  await page.getByRole("link", { name: new RegExp(summary) }).click();
  await expect(page).toHaveURL(/\/staff\/tickets\/\d+$/);
}

// docs/lab-03/tests.md E2E-02 - specification.md AC-12..AC-22. One ticket, followed
// through the screens of three real accounts (a Requester and two IT Staff).
test.describe("E2E-02 staff ticket flow", () => {
  test("Requester files and comments, IT Staff work the ticket, a second IT Staff member takes over and closes it", async ({ browser }) => {
    const summary = `E2E flow ${stamp()}`;

    // --- Requester: create a ticket and comment on it (AC-19)
    const requester = await signedInPage(browser, ACCOUNTS.requester, "REQUESTER");
    const ticketId = await createTicketViaUi(requester, summary);
    await requester.getByLabel("Add Public Comment").fill("The printer on floor 2 shows offline since this morning.");
    await requester.getByRole("button", { name: "Post Comment" }).click();
    await expect(requester.getByText("The printer on floor 2 shows offline since this morning.")).toBeVisible();

    // --- IT Staff (Jennifer): find it in the shared queue and open it
    const staff = await signedInPage(browser, ACCOUNTS.staff, "IT_STAFF");
    await openStaffTicketFromQueue(staff, summary);
    await expect(staff.getByRole("heading", { name: /^TKT-/ })).toBeVisible();
    // The Queue row showed no owner and the Requested Priority was copied into IT Priority (AC-12).
    expect(await selectedLabel(staff, "IT Priority")).toBe("Low");
    expect(await selectedLabel(staff, "Ticket Owner")).toMatch(/Unassigned/);

    // Claim (AC-13), set IT Priority, move to In Progress (AC-15)
    await staff.getByRole("button", { name: "Assign to me" }).click();
    await expect.poll(() => selectedLabel(staff, "Ticket Owner")).toMatch(/Jennifer Anderson/);
    await staff.getByLabel("IT Priority").selectOption({ label: "High" });
    await expect.poll(() => selectedLabel(staff, "IT Priority")).toBe("High");
    await staff.getByLabel("Current Status").selectOption({ label: "In Progress" });
    await staff.getByRole("button", { name: "Update status" }).click();
    await expect.poll(() => selectedLabel(staff, "Current Status")).toMatch(/In Progress/);

    // Public Comment (visible to the Requester) and Internal Note (not)
    await staff.getByLabel("Add Public Comment").fill("Thanks, we are checking the print server now.");
    await staff.getByRole("button", { name: "Post Comment" }).click();
    await expect(staff.getByText("Thanks, we are checking the print server now.")).toBeVisible();
    await staff.getByRole("tab", { name: /Internal Notes/ }).click();
    await expect(staff.getByText("Internal - not visible to requester")).toBeVisible();
    await staff.getByLabel("Add Internal Note").fill("Print server queue is stuck, restart the spooler after lunch.");
    await staff.getByRole("button", { name: "Save Internal Note" }).click();
    await expect(staff.getByText("Print server queue is stuck, restart the spooler after lunch.")).toBeVisible();

    // --- Requester sees the comment, never the note (AC-19, AC-20)
    await requester.reload();
    await expect(requester.getByText("Thanks, we are checking the print server now.")).toBeVisible();
    await expect(requester.getByText(/spooler/)).toHaveCount(0);
    await expect(requester.getByText(/Internal/)).toHaveCount(0);
    const noteAttempt = await requester.request.get(`${API}/api/staff/tickets/${ticketId}/notes`);
    expect(noteAttempt.status()).toBe(403);
    expect(await noteAttempt.text()).not.toMatch(/spooler/);
    expect(await requester.locator("body").innerText()).toContain("In Progress");

    // --- Requester says it looks resolved; the status does not change (AC-21, BR-05)
    await requester.getByRole("button", { name: "Problem Appears Resolved" }).click();
    await requester.getByRole("button", { name: "Yes, it looks resolved" }).click();
    await expect(requester.getByText("✓ You told IT Staff this looks resolved")).toBeVisible();
    await expect(requester.getByRole("button", { name: "Problem Appears Resolved" })).toHaveCount(0);
    expect(await requester.locator("body").innerText()).toContain("In Progress");

    // --- IT Staff see the indicator, in the Queue and on the ticket (AC-21)
    await staff.getByRole("banner").getByRole("link", { name: "My Queue" }).click();
    await staff.getByLabel("Search").fill(summary);
    const row = staff.getByRole("link", { name: new RegExp(summary) });
    await expect(row.getByText("Requester reports resolved")).toBeVisible();
    await row.click();

    // Resolving needs a Resolution Summary (AC-17)
    await staff.getByLabel("Current Status").selectOption({ label: "Resolved" });
    await staff.getByRole("button", { name: "Update status" }).click();
    await expect(staff.getByText("A Resolution Summary is required to resolve a ticket.")).toBeVisible();
    await staff.getByLabel(/Resolution Summary/).fill("Restarted the print spooler and cleared the stuck queue.");
    await staff.getByRole("button", { name: "Update status" }).click();
    await expect.poll(() => selectedLabel(staff, "Current Status")).toMatch(/Resolved/);

    // --- A second IT Staff member (Michael) reassigns it to himself before it is closed (AC-14)
    const staff2 = await signedInPage(browser, ACCOUNTS.staff2, "IT_STAFF");
    await staff2.goto(`/staff/tickets/${ticketId}`);
    await staff2.getByRole("button", { name: "Assign to me" }).click();
    await expect.poll(() => selectedLabel(staff2, "Ticket Owner")).toMatch(/Michael Brown/);

    // Closing asks for confirmation naming the target status
    await staff2.getByLabel("Current Status").selectOption({ label: "Closed" });
    await staff2.getByRole("button", { name: "Update status" }).click();
    await expect(staff2.getByRole("alertdialog", { name: "Confirm status change" })).toContainText("Closed");
    await staff2.getByRole("button", { name: "Confirm" }).click();
    await expect(staff2.getByText("This ticket is closed and can no longer be changed.")).toBeVisible();
    await expect(staff2.getByLabel("Ticket Owner")).toHaveCount(0); // controls are read-only once closed (AC-18)

    // --- The Requester sees the outcome
    await requester.reload();
    await expect(requester.getByText("Restarted the print spooler and cleared the stuck queue.")).toBeVisible();
    await expect(requester.getByText("This ticket is closed. Comments can no longer be added.")).toBeVisible();

    await Promise.all([requester, staff, staff2].map((p) => p.context().close()));
  });

  // AC-16, BR-19: the status control only offers reachable statuses.
  test("the Status control offers only the transitions the matrix allows", async ({ browser }) => {
    const requesterApi = await apiSession(ACCOUNTS.requester);
    const id = await createTicketViaApi(requesterApi, `E2E transitions ${stamp()}`);

    const staff = await signedInPage(browser, ACCOUNTS.staff, "IT_STAFF");
    await staff.goto(`/staff/tickets/${id}`);
    const options = await staff.getByLabel("Current Status").locator("option").allTextContents();
    expect(options.map((o) => o.replace(" (current)", "").trim())).toEqual(["New", "Open", "In Progress", "Cancelled"]);

    // In Progress needs an owner first (AC-15, BR-20): the backend refuses and the screen says why.
    await staff.getByLabel("Current Status").selectOption({ label: "In Progress" });
    await staff.getByRole("button", { name: "Update status" }).click();
    await expect(staff.getByText("Assign an owner before starting work on this ticket.")).toBeVisible();
    await staff.context().close();
  });

  // labsheet 8.4 / rubric Part 7 "Attachment continuity": Lab 2 attachments stay usable in the new flow.
  test("IT Staff can list and download a Requester's attachment, but cannot add or remove one", async ({ browser }) => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x84]);
    const requesterApi = await apiSession(ACCOUNTS.requester);
    const id = await createTicketViaApi(requesterApi, `E2E attachment ${stamp()}`);
    const upload = await requesterApi.post(`/api/tickets/${id}/attachments`, { multipart: { file: { name: "screenshot.jpg", mimeType: "image/jpeg", buffer: jpeg } } });
    expect(upload.status()).toBe(201);
    const attachmentId = (await upload.json()).id as number;

    const staff = await signedInPage(browser, ACCOUNTS.staff, "IT_STAFF");
    await staff.goto(`/staff/tickets/${id}`);
    await staff.getByRole("tab", { name: /Attachments \(1\)/ }).click();
    await expect(staff.getByText("screenshot.jpg")).toBeVisible();
    const [download] = await Promise.all([staff.waitForEvent("download"), staff.getByRole("button", { name: "Download" }).click()]);
    expect(download.suggestedFilename()).toBe("screenshot.jpg");
    await expect(staff.getByRole("button", { name: /remove/i })).toHaveCount(0);
    await expect(staff.locator('input[type="file"]')).toHaveCount(0);

    // The backend agrees: IT Staff may read and download, not add or remove.
    const staffApi = await apiSession(ACCOUNTS.staff);
    expect((await staffApi.get(`/api/attachments/${attachmentId}/download`)).status()).toBe(200);
    expect((await staffApi.post(`/api/tickets/${id}/attachments`, { multipart: { file: { name: "extra.jpg", mimeType: "image/jpeg", buffer: jpeg } } })).status()).toBe(403);
    expect((await staffApi.delete(`/api/attachments/${attachmentId}`, { data: { removalReason: "Not theirs to remove" } })).status()).toBe(403);

    // The Requester still owns it: their own screen lists it with the Lab 2 remove control.
    const requester = await signedInPage(browser, ACCOUNTS.requester, "REQUESTER");
    await requester.goto(`/tickets/${id}`);
    await expect(requester.getByText("screenshot.jpg")).toBeVisible();
    await expect(requester.getByRole("button", { name: /remove/i })).toBeVisible();
    await Promise.all([staff, requester].map((p) => p.context().close()));
  });

  // AC-04, AC-11, AC-20, BR-36 - the same evidence a curl call with a real cookie would give.
  test("direct API calls: each role gets exactly the access the authorization matrix gives it", async () => {
    const requesterApi = await apiSession(ACCOUNTS.requester);
    const id = await createTicketViaApi(requesterApi, `E2E authorization ${stamp()}`);
    const staffApi = await apiSession(ACCOUNTS.staff);
    const adminApi = await apiSession(ACCOUNTS.admin);
    const anonymous = await request.newContext({ baseURL: API });

    const note = await staffApi.post(`/api/staff/tickets/${id}/notes`, { data: { body: "Private staff note for the authorization check." } });
    expect(note.status()).toBe(201);

    const notesUrl = `/api/staff/tickets/${id}/notes`;
    const requesterRead = await requesterApi.get(notesUrl);
    expect(requesterRead.status()).toBe(403);
    expect(await requesterRead.text()).not.toContain("Private staff note");
    expect((await requesterApi.post(notesUrl, { data: { body: "x" } })).status()).toBe(403);
    expect((await staffApi.get(notesUrl)).status()).toBe(200);
    expect((await adminApi.get(notesUrl)).status()).toBe(200); // Administrator may read (BR-04)
    expect((await adminApi.post(notesUrl, { data: { body: "Admin may not write." } })).status()).toBe(403);
    expect((await anonymous.get(notesUrl)).status()).toBe(401);

    for (const [name, res] of [
      ["Requester GET queue", await requesterApi.get("/api/staff/tickets")],
      ["Requester PATCH owner", await requesterApi.patch(`/api/staff/tickets/${id}/owner`, { data: { ownerId: null } })],
      ["Administrator PATCH status", await adminApi.patch(`/api/staff/tickets/${id}/status`, { data: { status: "OPEN" } })],
      ["Administrator PATCH priority", await adminApi.patch(`/api/staff/tickets/${id}/it-priority`, { data: { itPriority: "HIGH" } })],
    ] as const) {
      expect(res.status(), name).toBe(403);
    }
    expect((await adminApi.get("/api/staff/tickets")).status()).toBe(200);

    // A Requester cannot read another Requester's ticket, and gets the same 404 as a missing one (BR-15).
    const other = await apiSession("buppha.ratanakorn@example.dev");
    const foreign = await other.get(`/api/tickets/${id}`);
    const missing = await other.get("/api/tickets/99999999");
    expect(foreign.status()).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
  });
});
