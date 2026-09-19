import { test, expect, Page } from "@playwright/test";
import { cleanupE2eUsers } from "../cleanup";
import {
  ACCOUNTS,
  FRESH_PASSWORD,
  VIEWPORTS,
  apiSession,
  createFreshUser,
  createTicketViaApi,
  loginAs,
  loginViaUi,
  shot,
  stamp,
} from "./helpers";

// docs/lab-03/tests.md RESP-01..RESP-05 - specification.md AC-30; ui-spec.md sections 10, 13, 14.
// Every major Lab 3 screen at desktop (1280), tablet (850) and mobile (375): no horizontal
// scroll (asserted inside `shot`), plus a full-page screenshot under
// artifacts/lab-03/screenshots/<screen>/<viewport>-<state>.png. Tickets are arranged through
// the API so every screen is captured in a known state, then viewed through the real UI.

const fx = { fresh: 0, withComments: 0, resolved: 0 };

test.beforeAll(async () => {
  const requester = await apiSession(ACCOUNTS.requester);
  const staff = await apiSession(ACCOUNTS.staff);
  const staffId = (await (await staff.get("/api/auth/me")).json()).id as number;
  const tag = stamp();

  // A: brand new, no owner, no comments
  fx.fresh = await createTicketViaApi(requester, `Shot A new ticket ${tag}`);

  // B: in progress, owned, with a public conversation and an internal note
  fx.withComments = await createTicketViaApi(requester, `Shot B in progress ${tag}`);
  await requester.post(`/api/tickets/${fx.withComments}/comments`, { data: { body: "The laptop battery drains within an hour, even when idle." } });
  expect((await staff.patch(`/api/staff/tickets/${fx.withComments}/owner`, { data: { ownerId: staffId } })).status()).toBe(200);
  expect((await staff.patch(`/api/staff/tickets/${fx.withComments}/it-priority`, { data: { itPriority: "HIGH" } })).status()).toBe(200);
  expect((await staff.patch(`/api/staff/tickets/${fx.withComments}/status`, { data: { status: "IN_PROGRESS" } })).status()).toBe(200);
  await staff.post(`/api/tickets/${fx.withComments}/comments`, { data: { body: "Thanks for the details. We are checking the battery health report now." } });
  await requester.post(`/api/tickets/${fx.withComments}/comments`, { data: { body: "It also happens with every application closed." } });
  await staff.post(`/api/staff/tickets/${fx.withComments}/notes`, { data: { body: "Battery cycle count is high. Order a replacement if the report confirms it." } });
  // The Requester attached the battery report before IT Staff picked it up (attachment continuity)
  expect(
    (
      await requester.post(`/api/tickets/${fx.withComments}/attachments`, {
        multipart: { file: { name: "battery-report.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x84]) } },
      })
    ).status(),
  ).toBe(201);

  // C: the Requester said it looks resolved, then IT Staff resolved it with a summary
  fx.resolved = await createTicketViaApi(requester, `Shot C resolved ticket ${tag}`);
  expect((await staff.patch(`/api/staff/tickets/${fx.resolved}/owner`, { data: { ownerId: staffId } })).status()).toBe(200);
  expect((await staff.patch(`/api/staff/tickets/${fx.resolved}/status`, { data: { status: "IN_PROGRESS" } })).status()).toBe(200);
  expect((await requester.post(`/api/tickets/${fx.resolved}/problem-resolved`)).status()).toBe(200);
  expect(
    (await staff.patch(`/api/staff/tickets/${fx.resolved}/status`, { data: { status: "RESOLVED", resolutionSummary: "Replaced the battery under warranty. Runtime is back to normal." } })).status(),
  ).toBe(200);
});

// At 375px the navigation sits behind the menu button; opening it must list exactly the
// current role's destinations (ui-spec.md section 2, 13).
async function expectMobileMenuLinks(page: Page, links: string[]) {
  await page.getByRole("button", { name: /navigation menu/i }).click();
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link")).toHaveText(links);
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    // ---------------------------------------------------------------- RESP-01 authentication
    test("Login: initial state", async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
      await shot(page, "authentication", vp, "login");
    });

    test("Login: invalid credentials show a safe message", async ({ page }) => {
      await loginViaUi(page, `nobody.${stamp()}@example.dev`, "Definitely#Wrong1");
      await expect(page.getByRole("alert")).toHaveText(/Invalid email or password\./);
      await shot(page, "authentication", vp, "invalid");
    });

    test("Login: inactive account", async ({ page }) => {
      await loginViaUi(page, ACCOUNTS.requesterInactive);
      await expect(page.getByRole("alert")).toHaveText(/inactive/);
      await shot(page, "authentication", vp, "inactive");
    });

    test("Login: busy state while signing in", async ({ page }) => {
      await page.route("**/api/auth/login", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        await route.continue();
      });
      await page.goto("/login");
      await page.getByLabel("Email address").fill(ACCOUNTS.requester);
      await page.getByLabel("Password").fill("TokTick-Dev#2026");
      await page.getByRole("button", { name: "Sign In" }).click();
      await expect(page.getByRole("button", { name: /Signing in/ })).toBeVisible();
      await shot(page, "authentication", vp, "busy");
    });

    test("Change Password: first login with the checklist part-way met", async ({ page }) => {
      const fresh = await createFreshUser(await apiSession(ACCOUNTS.admin));
      await loginViaUi(page, fresh.email, fresh.password);
      await expect(page.getByRole("heading", { name: "Change Your Password" })).toBeVisible();
      await page.getByLabel(/Current \(temporary\) password/).fill(FRESH_PASSWORD);
      await page.getByLabel(/^New password/).fill("Abcdefgh1");
      await page.getByLabel("Confirm new password").fill("Abcdefgh1");
      await expect(page.locator(".zen-password-checklist-item-met")).toHaveCount(4); // all but the special character
      await shot(page, "authentication", vp, "change-password");
    });

    // ---------------------------------------------------------------- RESP-02 Requester
    test("Requester: My Tickets", async ({ page }) => {
      await loginAs(page, ACCOUNTS.requester, "REQUESTER");
      await expect(page.locator(".zen-ticket-row").first()).toBeVisible();
      if (vp.name === "mobile") {
        // The menu button must be visible on the green header, not green-on-green.
        const menu = page.getByRole("button", { name: /navigation menu/i });
        await expect(menu).toBeVisible();
        expect(await menu.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(255, 255, 255)");
      }
      await shot(page, "requester", vp, "tickets");
      if (vp.name === "mobile") await expectMobileMenuLinks(page, ["My Tickets", "Create Ticket"]);
    });

    test("Requester: Ticket Detail of a new ticket with the resolved action", async ({ page }) => {
      await loginAs(page, ACCOUNTS.requester, "REQUESTER");
      await page.goto(`/tickets/${fx.fresh}`);
      await expect(page.getByRole("button", { name: "Problem Appears Resolved" })).toBeVisible();
      await shot(page, "requester", vp, "detail");
    });

    test("Requester: Public Comments thread (Internal Notes never shown)", async ({ page }) => {
      await loginAs(page, ACCOUNTS.requester, "REQUESTER");
      await page.goto(`/tickets/${fx.withComments}`);
      await expect(page.getByText("Thanks for the details. We are checking the battery health report now.")).toBeVisible();
      await expect(page.getByText(/Battery cycle count/)).toHaveCount(0);
      await shot(page, "requester", vp, "comments");
    });

    test("Requester: resolved ticket with the Requester's own indicator", async ({ page }) => {
      await loginAs(page, ACCOUNTS.requester, "REQUESTER");
      await page.goto(`/tickets/${fx.resolved}`);
      await expect(page.getByText("✓ You told IT Staff this looks resolved")).toBeVisible();
      await expect(page.getByText("Replaced the battery under warranty. Runtime is back to normal.")).toBeVisible();
      await shot(page, "requester", vp, "resolved");
    });

    // ---------------------------------------------------------------- RESP-03 Ticket Queue
    test("Queue: loaded, with owned and unassigned tickets", async ({ page }) => {
      await loginAs(page, ACCOUNTS.staff, "IT_STAFF");
      await expect(page.locator(".zen-queue-row").first()).toBeVisible();
      await expect(page.getByText(/Showing 1-10 of \d+ tickets/)).toBeVisible();
      await expect(page.locator(".zen-queue-row", { hasText: "Unassigned" }).first()).toBeVisible();
      await shot(page, "staff-queue", vp, "loaded");
      if (vp.name === "mobile") await expectMobileMenuLinks(page, ["My Queue"]);
    });

    test("Queue: empty (the API returns no tickets at all)", async ({ page }) => {
      await page.route("**/api/staff/tickets?*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 1, sort: "createdAt:desc",
            appliedFilters: { search: null, status: null, itPriority: null, categoryId: null, owner: null },
          }),
        }),
      );
      await loginViaUi(page, ACCOUNTS.staff);
      await expect(page.getByText("No tickets yet")).toBeVisible();
      await shot(page, "staff-queue", vp, "empty");
    });

    test("Queue: no results for a search", async ({ page }) => {
      await loginAs(page, ACCOUNTS.staff, "IT_STAFF");
      await page.getByLabel("Search").fill(`zzz-no-such-ticket-${stamp()}`);
      await expect(page.getByText("No tickets match your filters")).toBeVisible();
      await shot(page, "staff-queue", vp, "no-results");
    });

    test("Queue: API failure with Retry", async ({ page }) => {
      await page.route("**/api/staff/tickets?*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "INTERNAL_ERROR" }) }));
      await loginViaUi(page, ACCOUNTS.staff);
      await expect(page.getByText("Unable to load the ticket queue. Please try again.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
      await shot(page, "staff-queue", vp, "failure");
    });

    test("Queue: a Requester opening it is denied", async ({ page }) => {
      await loginAs(page, ACCOUNTS.requester, "REQUESTER");
      await page.goto("/staff/queue");
      await expect(page.getByRole("heading", { name: /access denied/i })).toBeVisible();
      await shot(page, "staff-queue", vp, "forbidden");
    });

    // ---------------------------------------------------------------- RESP-04 Staff Ticket Detail
    test("Staff Detail: operations and Public Comments", async ({ page }) => {
      await loginAs(page, ACCOUNTS.staff, "IT_STAFF");
      await page.goto(`/staff/tickets/${fx.withComments}`);
      await expect(page.getByText("It also happens with every application closed.")).toBeVisible();
      await shot(page, "staff-ticket-detail", vp, "loaded");
    });

    test("Staff Detail: Internal Notes are visibly different from Public Comments", async ({ page }) => {
      await loginAs(page, ACCOUNTS.staff, "IT_STAFF");
      await page.goto(`/staff/tickets/${fx.withComments}`);
      await page.getByRole("tab", { name: /Internal Notes/ }).click();
      await expect(page.getByText("Internal - not visible to requester")).toBeVisible();
      await expect(page.getByText(/Battery cycle count/)).toBeVisible();
      await shot(page, "staff-ticket-detail", vp, "notes");
    });

    test("Staff Detail: the Requester's attachment is listed and downloadable, with no add or remove", async ({ page }) => {
      await loginAs(page, ACCOUNTS.staff, "IT_STAFF");
      await page.goto(`/staff/tickets/${fx.withComments}`);
      await page.getByRole("tab", { name: /Attachments/ }).click();
      await expect(page.getByText("battery-report.jpg")).toBeVisible();
      await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
      await shot(page, "staff-ticket-detail", vp, "attachments");
    });

    test("Staff Detail: validation when resolving without a summary", async ({ page }) => {
      await loginAs(page, ACCOUNTS.staff, "IT_STAFF");
      await page.goto(`/staff/tickets/${fx.withComments}`);
      await page.getByLabel("Current Status").selectOption({ label: "Resolved" });
      await page.getByRole("button", { name: "Update status" }).click();
      await expect(page.getByText("A Resolution Summary is required to resolve a ticket.")).toBeVisible();
      await shot(page, "staff-ticket-detail", vp, "validation");
    });

    test("Staff Detail: a resolved ticket the Requester marked resolved", async ({ page }) => {
      await loginAs(page, ACCOUNTS.staff, "IT_STAFF");
      await page.goto(`/staff/tickets/${fx.resolved}`);
      await expect(page.getByText(/Replaced the battery under warranty/)).toBeVisible();
      await shot(page, "staff-ticket-detail", vp, "resolved");
    });

    test("Staff Detail: an Administrator sees it read-only", async ({ page }) => {
      await loginAs(page, ACCOUNTS.admin, "ADMINISTRATOR");
      await page.goto(`/staff/tickets/${fx.withComments}`);
      await expect(page.getByText("You have read-only access to this ticket.")).toBeVisible();
      await expect(page.getByLabel("IT Priority")).toHaveCount(0);
      await shot(page, "staff-ticket-detail", vp, "admin-readonly");
    });

    // ---------------------------------------------------------------- RESP-05 User Management
    test("Users: list", async ({ page }) => {
      cleanupE2eUsers(); // earlier steps in this file create throwaway accounts; keep the list to the seeded users
      await loginAs(page, ACCOUNTS.admin, "ADMINISTRATOR");
      await expect(page.getByRole("table", { name: "Users" })).toBeVisible();
      await shot(page, "user-management", vp, "list");
      if (vp.name === "mobile") await expectMobileMenuLinks(page, ["Users"]);
    });

    test("Users: create panel", async ({ page }) => {
      await loginAs(page, ACCOUNTS.admin, "ADMINISTRATOR");
      await page.getByRole("button", { name: "+ Create User" }).click();
      await expect(page.getByRole("region", { name: "Create New User" })).toBeVisible();
      await shot(page, "user-management", vp, "create");
    });

    test("Users: validation messages under their fields", async ({ page }) => {
      await loginAs(page, ACCOUNTS.admin, "ADMINISTRATOR");
      await page.getByRole("button", { name: "+ Create User" }).click();
      const panel = page.getByRole("region", { name: "Create New User" });
      await panel.getByLabel(/Email address/).fill("not-an-email");
      await panel.getByLabel(/^Initial password/).fill("weakpass");
      await panel.getByRole("button", { name: "Save User" }).click();
      await expect(panel.getByText("Full name is required.")).toBeVisible();
      await expect(panel.getByText("Enter a valid email address.")).toBeVisible();
      await shot(page, "user-management", vp, "validation");
    });

    test("Users: duplicate email conflict", async ({ page }) => {
      await loginAs(page, ACCOUNTS.admin, "ADMINISTRATOR");
      await page.getByRole("button", { name: "+ Create User" }).click();
      const panel = page.getByRole("region", { name: "Create New User" });
      await panel.getByLabel(/Full name/).fill("Duplicate Person");
      await panel.getByLabel(/Email address/).fill("ARAN.SUKSAWAT@example.dev");
      await panel.getByLabel(/^Initial password/).fill("Temp#Passw0rd1");
      await panel.getByRole("button", { name: "Save User" }).click();
      await expect(panel.getByText("That email address is already in use.")).toBeVisible();
      await shot(page, "user-management", vp, "duplicate");
    });

    test("Users: edit panel with the set-new-initial-password section", async ({ page }) => {
      await loginAs(page, ACCOUNTS.admin, "ADMINISTRATOR");
      await page.getByLabel("Search").fill("jennifer.anderson");
      await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(1); // the debounced search has been applied
      await page.getByRole("button", { name: "Edit Jennifer Anderson" }).click();
      const panel = page.getByRole("region", { name: "Edit User" });
      await panel.getByRole("button", { name: "Set new initial password" }).click();
      await panel.getByLabel("New initial password").fill("Reset#By-Admin7");
      await expect(panel.getByRole("button", { name: "Set password", exact: true })).toBeEnabled();
      await shot(page, "user-management", vp, "edit");
    });

    test("Users: editing your own account shows why Role and Active are locked", async ({ page }) => {
      await loginAs(page, ACCOUNTS.admin, "ADMINISTRATOR");
      await page.getByLabel("Search").fill("john.smith");
      await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(1); // the debounced search has been applied
      await page.getByRole("button", { name: "Edit John Smith" }).click();
      await expect(page.getByText("You cannot change your own role or active state.")).toBeVisible();
      await shot(page, "user-management", vp, "self");
    });

    test("Users: an IT Staff member opening it is denied", async ({ page }) => {
      await loginAs(page, ACCOUNTS.staff, "IT_STAFF");
      await page.goto("/admin/users");
      await expect(page.getByRole("heading", { name: /access denied/i })).toBeVisible();
      await shot(page, "user-management", vp, "forbidden");
    });
  });
}

// ---------------------------------------------------------------------- keyboard focus
// ui-spec.md section 13 (focus): every new interactive control shows a focus indicator
// when reached by keyboard. Asserted on the computed style, and captured in screenshots
// under artifacts/lab-03/screenshots/focus/ so the colour and contrast can be judged by eye.
test.describe("keyboard focus is visible on the new controls", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  async function expectFocusIndicator(page: Page, locator: ReturnType<Page["locator"]>, label: string) {
    await page.keyboard.press("Shift"); // make the browser treat focus as keyboard-driven
    await locator.focus();
    const style = await locator.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { outlineStyle: cs.outlineStyle, outlineWidth: parseFloat(cs.outlineWidth), boxShadow: cs.boxShadow };
    });
    const visible = (style.outlineStyle !== "none" && style.outlineWidth > 0) || style.boxShadow !== "none";
    expect(visible, `${label}: ${JSON.stringify(style)}`).toBe(true);
  }

  test("Login, shell, Queue, Staff Detail and User Management controls", async ({ page, browser }) => {
    const vp = VIEWPORTS[0];
    await page.goto("/login");
    await expectFocusIndicator(page, page.getByLabel("Email address"), "Login email field");
    await expectFocusIndicator(page, page.getByRole("button", { name: "Sign In" }), "Login Sign In button");
    await shot(page, "focus", vp, "login-button");

    await loginAs(page, ACCOUNTS.staff, "IT_STAFF");
    await expectFocusIndicator(page, page.getByRole("link", { name: "My Queue" }), "shell nav link");
    await expectFocusIndicator(page, page.getByRole("button", { name: /Jennifer Anderson/ }), "shell identity button");
    await shot(page, "focus", vp, "shell-identity");
    await expect(page.locator(".zen-queue-row").first()).toBeVisible();
    await expectFocusIndicator(page, page.getByLabel("Search"), "Queue search");
    await expectFocusIndicator(page, page.getByLabel("Status", { exact: true }), "Queue status filter");
    await expectFocusIndicator(page, page.locator(".zen-queue-row").first(), "Queue row link");
    await shot(page, "focus", vp, "queue-row");
    await expectFocusIndicator(page, page.getByRole("button", { name: "Next" }), "Queue pager button");

    await page.goto(`/staff/tickets/${fx.withComments}`);
    await expect(page.getByRole("tab", { name: /Internal Notes/ })).toBeVisible();
    await expectFocusIndicator(page, page.getByRole("tab", { name: /Internal Notes/ }), "Staff Detail tab");
    await expectFocusIndicator(page, page.getByLabel("IT Priority"), "IT Priority select");
    await shot(page, "focus", vp, "detail-tab");

    const admin = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); // its own session
    await loginAs(admin, ACCOUNTS.admin, "ADMINISTRATOR");
    await expectFocusIndicator(admin, admin.getByRole("button", { name: "+ Create User" }), "Create User button");
    await admin.getByRole("button", { name: "+ Create User" }).click();
    const panel = admin.getByRole("region", { name: "Create New User" });
    await expectFocusIndicator(admin, panel.getByLabel(/Full name/), "panel Full name");
    await expectFocusIndicator(admin, panel.getByRole("switch", { name: "Active" }), "Active switch");
    await shot(admin, "focus", vp, "user-switch");
    await expectFocusIndicator(admin, panel.getByRole("button", { name: "Cancel" }), "panel Cancel button");
  });
});
