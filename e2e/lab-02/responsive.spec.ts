import { test, expect, Page } from "@playwright/test";

// Issue 32 — responsive + visual evidence (ui-spec.md §9, §12). Desktop/
// tablet/mobile screenshots of Create Ticket, My Tickets, and Ticket
// Detail, plus a horizontal-scroll assertion at every viewport (AC-17).
//
// Issue 64 (REG-06) — logs in via the real Login screen instead of the
// removed Development Requester selector.
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "tablet", width: 850, height: 1100 },
  { name: "mobile", width: 375, height: 812 },
] as const;

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "TokTick-Dev#2026";

async function assertNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // +1 tolerance for subpixel rounding
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
}

const loginRequesterA = (page: Page) => login(page, "aran.suksawat@example.dev");
// Requester B never creates a ticket anywhere in the Lab 2 test suite, so
// her My Tickets is a genuine empty-account state, not a search result.
const loginRequesterB = (page: Page) => login(page, "buppha.ratanakorn@example.dev");

async function createTicket(page: Page, summary: string, withAttachment = false) {
  await page.getByRole("main").getByRole("link", { name: "Create Ticket" }).click();
  await page.getByLabel("Ticket Summary").fill(summary);
  await page
    .getByLabel("Description")
    .fill("Responsive/visual evidence fixture ticket — see docs/lab-02/ui-spec.md §12.");
  await page.getByLabel("Category").selectOption({ label: "Software" });
  await page.getByLabel("Related System").selectOption({ label: "Email" });
  await page.getByLabel("Requested Priority").selectOption({ label: "Low" });
  if (withAttachment) {
    await page.locator("#attachments-input").setInputFiles({
      name: "proof.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x84]),
    });
  }
  await page.getByRole("button", { name: "Submit Ticket" }).click();
  await expect(page.getByText(/^TKT-\d{4}-\d{6}$/)).toBeVisible({ timeout: 10_000 });
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("Create Ticket — initial state", async ({ page }) => {
      await loginRequesterA(page);
      await page.getByRole("main").getByRole("link", { name: "Create Ticket" }).click();
      await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();
      await assertNoHorizontalScroll(page);
      await page.screenshot({
        path: `artifacts/lab-02/screenshots/create-ticket/${vp.name}-initial.png`,
        fullPage: true,
      });
    });

    test("Create Ticket — validation failure state", async ({ page }) => {
      await loginRequesterA(page);
      await page.getByRole("main").getByRole("link", { name: "Create Ticket" }).click();
      await page.getByRole("button", { name: "Submit Ticket" }).click();
      await expect(page.getByText(/summary must be 5-120 characters/i)).toBeVisible();
      await assertNoHorizontalScroll(page);
      await page.screenshot({
        path: `artifacts/lab-02/screenshots/create-ticket/${vp.name}-validation.png`,
        fullPage: true,
      });
    });

    test("Create Ticket — success state", async ({ page }) => {
      await loginRequesterA(page);
      await createTicket(page, `Responsive success check (${vp.name}) ${Date.now()}`);
      await assertNoHorizontalScroll(page);
      await page.screenshot({
        path: `artifacts/lab-02/screenshots/create-ticket/${vp.name}-success.png`,
        fullPage: true,
      });
    });

    test("Create Ticket — API failure state", async ({ page }) => {
      await loginRequesterA(page);
      await page.getByRole("main").getByRole("link", { name: "Create Ticket" }).click();
      // Blocks only this test's submit request — the rest of the suite
      // still runs against the real backend.
      await page.route("**/api/tickets", (route) => route.abort("failed"));

      await page.getByLabel("Ticket Summary").fill(`Responsive failure check (${vp.name})`);
      await page
        .getByLabel("Description")
        .fill("Checking the responsive layout of the API-failure state at this viewport.");
      await page.getByLabel("Category").selectOption({ label: "Software" });
      await page.getByLabel("Related System").selectOption({ label: "Email" });
      await page.getByLabel("Requested Priority").selectOption({ label: "Low" });
      await page.getByRole("button", { name: "Submit Ticket" }).click();

      await expect(page.getByText(/unable to connect to toktickit api/i)).toBeVisible();
      // BR-18 — entered values are still there after the failure.
      await expect(page.getByLabel("Ticket Summary")).toHaveValue(`Responsive failure check (${vp.name})`);
      await assertNoHorizontalScroll(page);
      await page.screenshot({
        path: `artifacts/lab-02/screenshots/create-ticket/${vp.name}-failure.png`,
        fullPage: true,
      });
    });

    test("My Tickets — loaded state", async ({ page }) => {
      await loginRequesterA(page);
      await createTicket(page, `Responsive loaded-list check (${vp.name}) ${Date.now()}`);
      // Navigate directly rather than through the nav link — on mobile the
      // nav is collapsed behind the hamburger, which isn't what this test
      // is checking.
      await page.goto("/tickets");
      await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
      await assertNoHorizontalScroll(page);
      await page.screenshot({
        path: `artifacts/lab-02/screenshots/my-tickets/${vp.name}-loaded.png`,
        fullPage: true,
      });
    });

    test("My Tickets — empty state", async ({ page }) => {
      await loginRequesterB(page);
      await expect(page.getByText(/no tickets yet/i)).toBeVisible();
      await assertNoHorizontalScroll(page);
      await page.screenshot({
        path: `artifacts/lab-02/screenshots/my-tickets/${vp.name}-empty.png`,
        fullPage: true,
      });
    });

    test("My Tickets — no-results state", async ({ page }) => {
      await loginRequesterA(page);
      await page.getByLabel("Search").fill("zzz-definitely-not-a-real-match-zzz");
      await expect(page.getByText(/no tickets match your search/i)).toBeVisible();
      await assertNoHorizontalScroll(page);
      await page.screenshot({
        path: `artifacts/lab-02/screenshots/my-tickets/${vp.name}-no-results.png`,
        fullPage: true,
      });
    });

    test("Ticket Detail — loaded state", async ({ page }) => {
      await loginRequesterA(page);
      await createTicket(page, `Responsive detail check (${vp.name}) ${Date.now()}`);
      await page.getByRole("link", { name: "View Ticket" }).click();
      await expect(page.locator(".zen-detail-header")).toBeVisible();
      await assertNoHorizontalScroll(page);
      await page.screenshot({
        path: `artifacts/lab-02/screenshots/ticket-detail/${vp.name}-loaded.png`,
        fullPage: true,
      });
    });

    test("Ticket Detail — attachment removed state", async ({ page }) => {
      await loginRequesterA(page);
      await createTicket(page, `Responsive removed-attachment check (${vp.name}) ${Date.now()}`, true);
      await page.getByRole("link", { name: "View Ticket" }).click();
      await page.getByRole("button", { name: "Remove" }).click();
      await page.getByLabel("Reason for removal").fill("Testing the removed-attachment responsive layout.");
      await page.getByRole("button", { name: "Confirm removal" }).click();
      await expect(page.getByText("Removed", { exact: true })).toBeVisible();
      await assertNoHorizontalScroll(page);
      await page.screenshot({
        path: `artifacts/lab-02/screenshots/ticket-detail/${vp.name}-attachment-removed.png`,
        fullPage: true,
      });
    });
  });
}
