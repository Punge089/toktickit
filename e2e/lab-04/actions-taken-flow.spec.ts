import { test, expect, Browser, Page } from "@playwright/test";
import { ACCOUNTS, VIEWPORTS, apiSession, assertNoHorizontalScroll, createFreshUser, createTicketViaApi, loginAs, stamp } from "./helpers";

async function signedIn(browser: Browser, email: string, role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR", viewport?: { width: number; height: number }) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  const page = await context.newPage();
  await loginAs(page, email, role);
  return page;
}

const addAction = (page: Page) => page.getByRole("button", { name: "Add Action" });
const view = (page: Page, text: string) => page.getByRole("button", { name: new RegExp(`view action: ${text}`, "i") });
const rowFor = (page: Page, text: string) => page.getByRole("listitem").filter({ hasText: text });

// docs/lab-04/tests.md E2E-01 - specification.md AC-01, AC-03, AC-06, AC-08, AC-10 to AC-12.
// One Ticket, followed through the real screens of an IT Staff member, a Requester and an Administrator.
test.describe("E2E-01 Actions Taken flow", () => {
  test("IT Staff create, assign, edit, start, complete and cancel Actions; the Requester reads them; an Administrator adds one", async ({ browser }) => {
    const tag = stamp();
    const requesterApi = await apiSession(ACCOUNTS.requester);
    const adminApi = await apiSession(ACCOUNTS.admin);
    const ticketId = await createTicketViaApi(requesterApi, `E2E actions ${tag}`);
    // A staff account that is active now and will be deactivated while the form is open.
    const leaver = await createFreshUser(adminApi, { role: "IT_STAFF", fullName: `E2E Leaver ${tag}` });

    const staff = await signedIn(browser, ACCOUNTS.staff, "IT_STAFF");
    await staff.goto(`/staff/tickets/${ticketId}?tab=actions`);
    await expect(staff.getByText("No actions recorded yet.")).toBeVisible();
    await expect(staff.getByText("Everything in an Action is visible to the Requester.").first()).toBeVisible();

    // --- Create one (AC-01): the Assignee defaults to the signed-in IT Staff member.
    await addAction(staff).click();
    const form = staff.getByRole("form", { name: "Add action" });
    await expect(form.getByLabel(/^Assignee/)).toHaveValue(/\d+/);
    await form.getByRole("button", { name: "Save action" }).click(); // empty form: the message sits under the field
    await expect(form.getByText("Action Description is required.")).toBeVisible();
    await expect(form.getByLabel(/Action Description/)).toBeFocused();
    await form.getByLabel(/Action Description/).fill(`Check the battery health ${tag}`);
    await form.getByRole("button", { name: "Save action" }).click();
    await expect(staff.getByRole("status")).toContainText("Action saved.");
    await expect(staff.getByRole("tab", { name: "Actions Taken (1)" })).toBeVisible();
    await expect(rowFor(staff, `Check the battery health ${tag}`).getByText("Planned")).toBeVisible();

    // --- Assign another staff member and log work already finished in one step (AC-03).
    await addAction(staff).click();
    await form.getByLabel(/Action Description/).fill(`Order a replacement battery ${tag}`);
    await form.getByLabel(/^Assignee/).selectOption({ label: "Michael Brown" });
    await form.getByLabel("Status").selectOption({ label: "In Progress" });
    await form.getByRole("button", { name: "Save action" }).click();
    await expect(staff.getByRole("tab", { name: "Actions Taken (2)" })).toBeVisible();
    await expect(rowFor(staff, `Order a replacement battery ${tag}`).getByText("Michael Brown")).toBeVisible();

    // --- Edit the first one (view mode, then edit mode).
    await view(staff, `Check the battery health ${tag}`).click();
    await expect(staff.getByRole("region", { name: "Action details" })).toContainText(`Check the battery health ${tag}`);
    await staff.getByRole("button", { name: "Edit" }).click();
    const edit = staff.getByRole("form", { name: "Edit action" });
    await edit.getByLabel(/Action Description/).fill(`Check the battery health and the charger ${tag}`);
    await edit.getByLabel("Attachment Notes").fill("Photo of the battery label");
    await edit.getByRole("button", { name: "Save action" }).click();
    await expect(staff.getByRole("region", { name: "Action details" })).toContainText(`and the charger ${tag}`);
    await expect(staff.getByRole("region", { name: "Action details" })).toContainText("Photo of the battery label");

    // --- Start it, then complete it: Complete without a Result opens the form on the Result field (AC-10, AC-11).
    await staff.getByRole("button", { name: "Start" }).click();
    await expect(rowFor(staff, `and the charger ${tag}`).getByText("In Progress")).toBeVisible();
    await staff.getByRole("button", { name: "Complete" }).click();
    const complete = staff.getByRole("form", { name: "Edit action" });
    await expect(complete.getByLabel("Status")).toHaveValue("COMPLETED");
    await expect(complete.getByLabel(/^Result/)).toBeFocused();
    await complete.getByRole("button", { name: "Save action" }).click();
    await expect(complete.getByText("Result is required to complete an action.")).toBeVisible();
    await complete.getByLabel(/^Result/).fill("Battery health is 61 percent.");
    await complete.getByRole("button", { name: "Save action" }).click();
    await expect(rowFor(staff, `and the charger ${tag}`).getByText("Completed")).toBeVisible();

    // --- A Completed Action is final (AC-12).
    const panel = staff.getByRole("region", { name: "Action details" });
    await expect(panel.getByText("This action is final.")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Complete" })).toHaveCount(0);

    // --- Cancel the second one: a reason is required, then the cancellation is confirmed.
    await view(staff, `Order a replacement battery ${tag}`).click();
    await staff.getByRole("button", { name: "Cancel action" }).click();
    const cancel = staff.getByRole("form", { name: "Edit action" });
    await expect(cancel.getByLabel("Status")).toHaveValue("CANCELLED");
    await cancel.getByLabel(/^Result/).fill("Not needed: the battery was replaced under warranty.");
    await cancel.getByRole("button", { name: "Save action" }).click();
    await expect(staff.getByRole("alertdialog", { name: "Confirm cancel action" })).toContainText("This cannot be undone.");
    await staff.getByRole("button", { name: "Confirm" }).click();
    await expect(rowFor(staff, `Order a replacement battery ${tag}`).getByText("Cancelled")).toBeVisible();

    // --- An assignee who became inactive while the form was open is refused (AC-03).
    await staff.reload();
    await staff.getByRole("tab", { name: /Actions Taken/ }).click();
    await addAction(staff).click();
    const late = staff.getByRole("form", { name: "Add action" });
    await late.getByLabel(/Action Description/).fill(`Hand over to the leaver ${tag}`);
    await late.getByLabel(/^Assignee/).selectOption({ label: leaver.fullName });
    const deactivate = await adminApi.patch(`/api/admin/users/${leaver.id}`, { data: { isActive: false } });
    expect(deactivate.status()).toBe(200);
    await late.getByRole("button", { name: "Save action" }).click();
    await expect(late.getByText("Choose an active IT Staff member.")).toBeVisible();
    await expect(late.getByLabel(/Action Description/)).toHaveValue(`Hand over to the leaver ${tag}`);
    await late.getByRole("button", { name: "Cancel" }).click();

    // --- The Requester sees every Action of their own Ticket, read-only (AC-08).
    const requester = await signedIn(browser, ACCOUNTS.requester, "REQUESTER");
    await requester.goto(`/tickets/${ticketId}`);
    const section = requester.getByRole("heading", { name: "Actions Taken" }).locator("xpath=ancestor::section");
    await expect(section.getByText(`and the charger ${tag}`)).toBeVisible();
    await expect(section.getByText("Battery health is 61 percent.")).toBeVisible();
    await expect(section.getByText("Not needed: the battery was replaced under warranty.")).toBeVisible();
    await expect(section.getByText("Michael Brown").first()).toBeVisible();
    await expect(section.getByRole("button")).toHaveCount(0);

    // --- An Administrator may add an Action but not change owner, priority or status (AC-06).
    const admin = await signedIn(browser, ACCOUNTS.admin, "ADMINISTRATOR");
    await admin.goto(`/staff/tickets/${ticketId}?tab=actions`);
    await expect(admin.getByLabel("Ticket Owner")).toHaveCount(0);
    await expect(admin.getByLabel("Current Status")).toHaveCount(0);
    await addAction(admin).click();
    const adminForm = admin.getByRole("form", { name: "Add action" });
    await expect(adminForm.getByLabel(/^Assignee/)).toHaveValue(""); // no default for an Administrator
    await adminForm.getByLabel(/Action Description/).fill(`Administrator follow-up ${tag}`);
    await adminForm.getByLabel(/^Assignee/).selectOption({ label: "Jennifer Anderson" });
    await adminForm.getByRole("button", { name: "Save action" }).click();
    await expect(rowFor(admin, `Administrator follow-up ${tag}`).getByText("Planned")).toBeVisible();

    await Promise.all([staff, requester, admin].map((p) => p.context().close()));
  });

  // AC-37, FR-22: the Actions Taken screens never scroll sideways, at the three widths of Labs 2 and 3.
  for (const vp of VIEWPORTS) {
    test(`no horizontal scroll on the Actions Taken screens at ${vp.name} (${vp.width}px)`, async ({ browser }) => {
      const tag = stamp();
      const requesterApi = await apiSession(ACCOUNTS.requester);
      const staffApi = await apiSession(ACCOUNTS.staff);
      const ticketId = await createTicketViaApi(requesterApi, `E2E actions width ${vp.name} ${tag}`);
      const staffId = (await (await staffApi.get("/api/auth/me")).json()).id as number;
      const long = `${"A very long action description that has to wrap instead of pushing the page sideways. ".repeat(3)}${"x".repeat(60)}`;
      for (const description of [long, `Second action ${tag}`]) {
        const res = await staffApi.post(`/api/staff/tickets/${ticketId}/actions`, {
          data: {
            clientRequestId: `e2e-${stamp()}`,
            description,
            assigneeId: staffId,
            followUpRequired: true,
            followUpNote: "Check again next week; this note is long enough to need wrapping on a phone screen.",
            attachmentNotes: "Photo of the label, see the attachments list for the file",
          },
        });
        expect(res.status()).toBe(201);
      }

      const staff = await signedIn(browser, ACCOUNTS.staff, "IT_STAFF", { width: vp.width, height: vp.height });
      await staff.goto(`/staff/tickets/${ticketId}?tab=actions`);
      await expect(staff.getByRole("list", { name: "Actions taken" })).toBeVisible();
      await assertNoHorizontalScroll(staff);
      await addAction(staff).click();
      await expect(staff.getByRole("form", { name: "Add action" })).toBeVisible();
      await assertNoHorizontalScroll(staff);
      await staff.getByRole("button", { name: "Cancel" }).click();
      await view(staff, "A very long action description").click();
      await expect(staff.getByRole("region", { name: "Action details" })).toBeVisible();
      await assertNoHorizontalScroll(staff);

      const requester = await signedIn(browser, ACCOUNTS.requester, "REQUESTER", { width: vp.width, height: vp.height });
      await requester.goto(`/tickets/${ticketId}`);
      await expect(requester.getByRole("list", { name: "Actions taken" })).toBeVisible();
      await assertNoHorizontalScroll(requester);

      // Below 992px the rows are cards (no header row shown); from 992px they line up as a table.
      const headerVisible = await staff.getByRole("list", { name: "Actions taken" }).locator(".zen-action-header").first().isVisible();
      await staff.getByRole("button", { name: /^Close$/ }).click();
      expect(headerVisible).toBe(vp.width >= 992);
      await Promise.all([staff, requester].map((p) => p.context().close()));
    });
  }
});
