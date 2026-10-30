import { test, expect, Browser, Page } from "@playwright/test";
import { ACCOUNTS, VIEWPORTS, apiSession, assertNoHorizontalScroll, createTicketViaApi, stamp } from "./helpers";
import { loginViaUi } from "../lab-03/helpers";

const NOBODY = { requester: "buppha.ratanakorn@example.dev", idleStaff: "nattaya.chuenjit@example.dev" } as const;

async function signedIn(browser: Browser, email: string, viewport?: { width: number; height: number }) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  const page = await context.newPage();
  await loginViaUi(page, email);
  await expect(page.getByRole("heading", { name: /^Welcome back,/ })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
  return page;
}

const navLinks = (page: Page) => page.getByRole("navigation", { name: "Primary" }).getByRole("link").allTextContents();

// A card's figure comes from its accessible name: "<label>: <value>, view tickets".
async function figure(page: Page, label: string): Promise<number> {
  const name = await page.getByRole("link", { name: new RegExp(`^${label}: \\d+, view tickets$`) }).getAttribute("aria-label");
  return Number(name!.match(/: (\d+),/)![1]);
}

// docs/lab-04/tests.md E2E-03 - specification.md AC-02, AC-25 to AC-29, AC-31. Every role logs in, lands on its
// Dashboard, follows each card, and the figure on the card equals the total of the list it opens.
test.describe("E2E-03 dashboards", () => {
  test("Requester: lands on the Dashboard, and every card opens the matching My Tickets view with the same total", async ({ browser }) => {
    const requesterApi = await apiSession(ACCOUNTS.requester);
    await createTicketViaApi(requesterApi, `E2E dashboard ${stamp()}`); // at least one active Ticket exists
    const page = await signedIn(browser, ACCOUNTS.requester);

    expect(await navLinks(page)).toEqual(["Dashboard", "My Tickets", "Create Ticket"]);
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: /^(Open Tickets|Waiting for You|Resolved|Closed): \d+/ })).toHaveCount(4);

    const cards: Array<[string, string, string]> = [
      ["Open Tickets", "active=true", "Active tickets"],
      ["Waiting for You", "status=WAITING_FOR_REQUESTER", "Status: Waiting for Requester"],
      ["Resolved", "status=RESOLVED", "Status: Resolved"],
      ["Closed", "status=CLOSED", "Status: Closed"],
    ];
    for (const [label, query, chip] of cards) {
      const value = await figure(page, label);
      const total = (await (await page.request.get(`http://localhost:3000/api/tickets?${query}`)).json()).meta.totalItems as number;
      expect(value, `${label} card against the list it opens`).toBe(total);

      await page.getByRole("link", { name: new RegExp(`^${label}: \\d+, view tickets$`) }).click();
      await expect(page).toHaveURL(new RegExp(`/tickets\\?${query}`));
      await expect(page.getByRole("heading", { name: "My Tickets", exact: true })).toBeVisible();
      await expect(page.getByRole("list", { name: "Applied filters" }).getByText(chip)).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "My Tickets" })).toHaveAttribute("aria-current", "page");
      await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Dashboard" }).click();
      await expect(page.getByRole("heading", { name: /^Welcome back,/ })).toBeVisible();
    }

    // A recent Ticket opens its detail; "View all" opens My Tickets.
    await page.getByRole("region", { name: "Recently Updated" }).getByRole("link", { name: /^TKT-/ }).first().click();
    await expect(page).toHaveURL(/\/tickets\/\d+$/);
    await page.goBack();
    await page.getByRole("link", { name: /View all: Recently Updated/ }).click();
    await expect(page).toHaveURL(/\/tickets$/);
    await page.context().close();
  });

  test("Requester with no Tickets: every card is 0 and each list says so", async ({ browser }) => {
    const page = await signedIn(browser, NOBODY.requester);
    for (const label of ["Open Tickets", "Waiting for You", "Resolved", "Closed"]) expect(await figure(page, label), label).toBe(0);
    await expect(page.getByText("Nothing needs your attention right now.")).toBeVisible();
    await expect(page.getByText("You have no tickets yet. Create one to get started.")).toBeVisible();
    await page.context().close();
  });

  test("IT Staff: every card opens the matching Queue view with the same total, and My Open Actions rows open the Actions tab", async ({ browser }) => {
    const requesterApi = await apiSession(ACCOUNTS.requester);
    const staffApi = await apiSession(ACCOUNTS.staff);
    const me = (await (await staffApi.get("/api/auth/me")).json()).id as number;
    const ticketId = await createTicketViaApi(requesterApi, `E2E dashboard action ${stamp()}`);
    const made = await staffApi.post(`/api/staff/tickets/${ticketId}/actions`, {
      data: { clientRequestId: `e2e-${stamp()}`, description: `Dashboard action ${stamp()}`, assigneeId: me },
    });
    expect(made.status()).toBe(201);

    const page = await signedIn(browser, ACCOUNTS.staff);
    expect(await navLinks(page)).toEqual(["Dashboard", "My Queue"]);
    await expect(page.getByRole("link", { name: /create ticket/i })).toHaveCount(0);

    const cards: Array<[string, string, (p: Page) => Promise<void>]> = [
      ["New", "status=NEW", async (p) => expect(p.getByLabel("Status")).toHaveValue("NEW")],
      ["Open", "status=OPEN", async (p) => expect(p.getByLabel("Status")).toHaveValue("OPEN")],
      ["In Progress", "status=IN_PROGRESS", async (p) => expect(p.getByLabel("Status")).toHaveValue("IN_PROGRESS")],
      ["Waiting for Requester", "status=WAITING_FOR_REQUESTER", async (p) => expect(p.getByLabel("Status")).toHaveValue("WAITING_FOR_REQUESTER")],
      ["Unassigned", "owner=unassigned&active=true", async (p) => expect(p.getByLabel("Owner")).toHaveValue("unassigned")],
      ["My Assigned", "owner=me&active=true", async (p) => expect(p.getByLabel("Owner")).toHaveValue("me")],
      ["Urgent", "itPriority=URGENT&active=true", async (p) => expect(p.getByLabel("IT Priority")).toHaveValue("URGENT")],
      ["High", "itPriority=HIGH&active=true", async (p) => expect(p.getByLabel("IT Priority")).toHaveValue("HIGH")],
      ["Medium", "itPriority=MEDIUM&active=true", async (p) => expect(p.getByLabel("IT Priority")).toHaveValue("MEDIUM")],
      ["Low", "itPriority=LOW&active=true", async (p) => expect(p.getByLabel("IT Priority")).toHaveValue("LOW")],
    ];
    for (const [label, query, check] of cards) {
      const value = await figure(page, label);
      const total = (await (await page.request.get(`http://localhost:3000/api/staff/tickets?${query}`)).json()).totalItems as number;
      expect(value, `${label} card against the list it opens`).toBe(total);

      await page.getByRole("link", { name: new RegExp(`^${label}: \\d+, view tickets$`) }).click();
      await expect(page).toHaveURL(new RegExp(`/staff/queue\\?${query}`));
      await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
      await check(page);
      await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Dashboard" }).click();
      await expect(page.getByRole("heading", { name: /^Welcome back,/ })).toBeVisible();
    }

    // My Open Actions is a figure, with the rows listed below it.
    await expect(page.getByRole("link", { name: /^My Open Actions/ })).toHaveCount(0); // it is not a link
    const actions = page.getByRole("region", { name: "My Open Actions" });
    await actions.getByRole("link", { name: /^TKT-/ }).first().click();
    await expect(page).toHaveURL(/\/staff\/tickets\/\d+\?tab=actions$/);
    await expect(page.getByRole("tab", { name: /^Actions Taken/ })).toHaveAttribute("aria-selected", "true");
    await page.context().close();
  });

  test("IT Staff with nothing assigned: personal figures are 0 and the lists say so", async ({ browser }) => {
    const page = await signedIn(browser, NOBODY.idleStaff);
    expect(await figure(page, "My Assigned")).toBe(0);
    await expect(page.getByRole("region", { name: "My Open Actions" }).getByText("You have no open actions.")).toBeVisible();
    await expect(page.getByText("0", { exact: true }).first()).toBeVisible();
    await page.context().close();
  });

  test("Administrator: the same view without personal figures, with account counts that link to Users", async ({ browser }) => {
    const page = await signedIn(browser, ACCOUNTS.admin);
    expect(await navLinks(page)).toEqual(["Dashboard", "Users"]);
    await expect(page.getByText("Read-only view of the IT Staff dashboard.")).toBeVisible();
    await expect(page.getByRole("link", { name: /^My Assigned/ })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "My Open Actions" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "My Queue" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /create ticket/i })).toHaveCount(0);
    const accounts = page.getByRole("link", { name: /^Accounts/ });
    await expect(accounts).toContainText("Active Administrators:");
    await accounts.click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await page.context().close();
  });

  test("a Requester opening the staff dashboard route data is refused, and the figures never reach the page", async ({ browser }) => {
    const page = await signedIn(browser, ACCOUNTS.requester);
    const forbidden = await page.request.get("http://localhost:3000/api/dashboard/staff");
    expect(forbidden.status()).toBe(403);
    expect(await forbidden.text()).not.toContain("statusCounts");
    await page.context().close();
  });

  // AC-37, FR-22: the dashboards never scroll sideways at the three widths of Labs 2 and 3.
  for (const vp of VIEWPORTS) {
    test(`no horizontal scroll on the dashboards at ${vp.name} (${vp.width}px)`, async ({ browser }) => {
      for (const email of [ACCOUNTS.requester, ACCOUNTS.staff, ACCOUNTS.admin]) {
        const page = await signedIn(browser, email, { width: vp.width, height: vp.height });
        await expect(page.getByRole("region", { name: "Quick Actions" })).toBeVisible();
        await assertNoHorizontalScroll(page);
        await page.context().close();
      }
    });
  }
});
