import { test, expect, Page } from "@playwright/test";

// Issue 32 — full-stack E2E against the real dev servers + PostgreSQL
// (specification.md Test Strategy). Covers E2E-01, E2E-02, E2E-03 as one
// continuous flow since each step depends on state the previous step
// created (the Ticket Number, its Detail URL).
//
// Issue 64 (REG-06) — logs in via the real Login screen instead of the
// removed Development Requester selector; "switching Requester" is now
// logout + log back in as a different account, since identity is fixed
// for a session (BR-39).
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "TokTick-Dev#2026";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: /aran suksawat|buppha ratanakorn/i }).click();
  await page.getByRole("menuitem", { name: "Log Out" }).click();
  await expect(page.getByRole("heading", { name: "TokTickIT" })).toBeVisible();
}

test("a Requester creates a ticket, manages its attachment, and cannot be seen by another Requester", async ({
  page,
}) => {
  let ticketNumber = "";
  let ticketDetailUrl = "";

  await test.step("E2E-01a: log in as Requester A", async () => {
    await login(page, "aran.suksawat@example.dev");
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

  await test.step("E2E-03: logging out and back in as Requester B hides Requester A's ticket", async () => {
    await logout(page);
    await login(page, "buppha.ratanakorn@example.dev");

    await page.getByLabel("Search").fill(ticketNumber);
    await expect(page.getByText(/no tickets match your search/i)).toBeVisible();

    // Direct navigation to A's ticket URL while logged in as B (BR-10/28).
    await page.goto(ticketDetailUrl);
    await expect(page.getByText("Ticket not found.")).toBeVisible();
  });
});
