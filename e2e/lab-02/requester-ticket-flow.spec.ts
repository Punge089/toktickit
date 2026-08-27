import { test, expect } from "@playwright/test";

// Issue 32 — full-stack E2E against the real dev servers + PostgreSQL
// (specification.md Test Strategy). Covers E2E-01, E2E-02, E2E-03 as one
// continuous flow since each step depends on state the previous step
// created (the Ticket Number, its Detail URL).
test("a Requester creates a ticket, manages its attachment, and cannot be seen by another Requester", async ({
  page,
}) => {
  let ticketNumber = "";
  let ticketDetailUrl = "";

  await test.step("E2E-01a: select Development Requester A", async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "TokTickIT" })).toBeVisible();

    const select = page.getByLabel("Development Requester");
    await select.selectOption({ label: "Aran Suksawat (aran.suksawat@example.dev)" });
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
  });

  await test.step("E2E-01b: create a ticket with one attachment", async () => {
    await page.getByRole("main").getByRole("link", { name: "Create Ticket" }).click();
    await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();

    await page.getByLabel("Ticket Summary").fill("E2E test: laptop battery drains quickly");
    await page
      .getByLabel("Description")
      .fill("The battery on my corporate laptop drains from full to empty within about two hours.");
    await page.getByLabel("Category").selectOption({ label: "Hardware" });
    await page.getByLabel("Related System").selectOption({ label: "Corporate Laptop" });
    await page.getByLabel("Requested Priority").selectOption({ label: "Medium" });

    await page.locator("#attachments-input").setInputFiles({
      name: "evidence.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x84, 0x00, 0x01]),
    });

    await page.getByRole("button", { name: "Submit Ticket" }).click();

    const numberEl = page.getByText(/^TKT-\d{4}-\d{6}$/);
    await expect(numberEl).toBeVisible({ timeout: 10_000 });
    ticketNumber = (await numberEl.textContent())!.trim();
  });

  await test.step("E2E-01c: find the ticket in My Tickets by its Ticket Number", async () => {
    await page.getByRole("link", { name: "View Ticket" }).click();
    await expect(page.getByRole("heading", { name: ticketNumber })).toBeVisible();
    ticketDetailUrl = page.url();

    await page.getByRole("link", { name: /Back to My Tickets/ }).click();
    await page.getByLabel("Search").fill(ticketNumber);
    await expect(page.getByRole("link", { name: new RegExp(ticketNumber) })).toBeVisible();

    await page.getByRole("link", { name: new RegExp(ticketNumber) }).click();
    await expect(page.getByRole("heading", { name: ticketNumber })).toBeVisible();
  });

  await test.step("E2E-02: remove the attachment with a reason", async () => {
    await expect(page.getByText("evidence.jpg")).toBeVisible();
    await page.getByRole("button", { name: "Remove" }).click();
    await page.getByLabel("Reason for removal").fill("Wrong screenshot, no longer needed.");
    await page.getByRole("button", { name: "Confirm removal" }).click();

    await expect(page.getByText("Removed", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download" })).toHaveCount(0);
  });

  await test.step("E2E-03: switching to Requester B hides Requester A's ticket", async () => {
    await page.getByRole("button", { name: "Change Requester" }).click();
    await expect(page.getByRole("heading", { name: "TokTickIT" })).toBeVisible();

    const select = page.getByLabel("Development Requester");
    await select.selectOption({ label: "Buppha Ratanakorn (buppha.ratanakorn@example.dev)" });
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel("Search").fill(ticketNumber);
    await expect(page.getByText(/no tickets match your search/i)).toBeVisible();

    // Direct navigation to A's ticket URL while logged in as B (BR-10/28).
    await page.goto(ticketDetailUrl);
    await expect(page.getByText("Ticket not found.")).toBeVisible();
  });
});
