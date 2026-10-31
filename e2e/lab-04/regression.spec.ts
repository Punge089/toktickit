import { test, expect, Browser, Page } from "@playwright/test";
import { ACCOUNTS, API, apiSession, createTicketViaApi, stamp } from "./helpers";
import { loginViaUi } from "../lab-03/helpers";

async function signedIn(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginViaUi(page, email);
  await expect(page.getByRole("heading", { name: /^Welcome back,/ })).toBeVisible();
  return page;
}

// Problems the user would see or that the browser logs: console errors, uncaught exceptions and 5xx answers.
// Listening starts after the login, because the login page itself legitimately asks /me while signed out.
function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console error: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`uncaught exception: ${e.message}`));
  page.on("response", (r) => {
    if (r.url().startsWith(API) && r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return problems;
}

// What FR-21 forbids on a main screen: placeholder or broken text, a control nobody can name, and a Not Found page.
async function inspect(page: Page, where: string) {
  await page.waitForLoadState("networkidle");
  const text = await page.locator("body").innerText();
  expect(text, `${where}: placeholder or broken text`).not.toMatch(/lorem ipsum|\bTODO\b|\bFIXME\b|coming soon|\bundefined\b|\bNaN\b|\[object Object\]|Page not found/i);

  const unnamed = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button, a[href], input, select, textarea"))
      .filter((el) => {
        const e = el as HTMLInputElement;
        if (e.type === "hidden") return false;
        const label = (e.getAttribute("aria-label") ?? "") + (e.innerText ?? "") + (e.getAttribute("title") ?? "");
        const labelled = (e.labels && e.labels.length > 0) || e.getAttribute("aria-labelledby");
        return !label.trim() && !labelled;
      })
      .map((el) => el.outerHTML.slice(0, 120)),
  );
  expect(unnamed, `${where}: controls with no accessible name`).toEqual([]);
}

// Opens every distinct in-app link currently on the page and checks each lands on a real screen.
async function followEveryLink(page: Page, problems: string[], from: string) {
  const hrefs = await page.evaluate(() =>
    Array.from(new Set(Array.from(document.querySelectorAll('a[href^="/"]')).map((a) => a.getAttribute("href") as string))).filter((h) => !h.startsWith("/api/")),
  );
  expect(hrefs.length, `${from}: has links to follow`).toBeGreaterThan(0);
  for (const href of hrefs) {
    await page.goto(href);
    await inspect(page, `${from} -> ${href}`);
    expect(problems, `${from} -> ${href}`).toEqual([]);
  }
}

// docs/lab-04/tests.md REG-04 - specification.md AC-35, FR-20, FR-21.
test.describe("REG-04 representative flows after Lab 4", () => {
  test("Requester: sign in, find a ticket in My Tickets, open it, add an attachment and a public comment", async ({ browser }) => {
    const tag = stamp();
    const requesterApi = await apiSession(ACCOUNTS.requester);
    const id = await createTicketViaApi(requesterApi, `Regression ${tag}`);
    const page = await signedIn(browser, ACCOUNTS.requester);

    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "My Tickets" }).click();
    await page.getByLabel("Search").fill(`Regression ${tag}`);
    await page.getByRole("link", { name: new RegExp(`Regression ${tag}`) }).click();
    await expect(page).toHaveURL(new RegExp(`/tickets/${id}$`));

    await page.locator('input[type="file"]').first().setInputFiles({ name: "evidence.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x84]) });
    await expect(page.getByText("evidence.jpg")).toBeVisible();
    await expect(page.getByRole("button", { name: "Download" })).toBeVisible();

    await page.getByLabel("Add Public Comment").fill(`Still happening ${tag}`);
    await page.getByRole("button", { name: "Post Comment" }).click();
    await expect(page.getByText(`Still happening ${tag}`)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Actions Taken" })).toBeVisible();
    await page.context().close();
  });

  test("IT Staff: find the ticket in the Queue, claim it, and write an Internal Note the Requester never sees", async ({ browser }) => {
    const tag = stamp();
    const requesterApi = await apiSession(ACCOUNTS.requester);
    const id = await createTicketViaApi(requesterApi, `Regression staff ${tag}`);
    const page = await signedIn(browser, ACCOUNTS.staff);

    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "My Queue" }).click();
    await page.getByLabel("Search").fill(`Regression staff ${tag}`);
    await page.getByRole("link", { name: new RegExp(`Regression staff ${tag}`) }).click();
    await expect(page).toHaveURL(new RegExp(`/staff/tickets/${id}$`));

    await page.getByRole("button", { name: "Assign to me" }).click();
    await expect(page.getByLabel("Ticket Owner")).toHaveValue(/\d+/);
    await page.getByRole("tab", { name: /Internal Notes/ }).click();
    await page.getByLabel("Add Internal Note").fill(`Private regression note ${tag}`);
    await page.getByRole("button", { name: "Save Internal Note" }).click();
    await expect(page.getByText(`Private regression note ${tag}`)).toBeVisible();

    const asRequester = await requesterApi.get(`/api/tickets/${id}`);
    expect(await asRequester.text()).not.toContain("Private regression note");
    await page.context().close();
  });

  test("Administrator: find a user in User Management, and read a ticket without being able to change it", async ({ browser }) => {
    const requesterApi = await apiSession(ACCOUNTS.requester);
    const id = await createTicketViaApi(requesterApi, `Regression admin ${stamp()}`);
    const page = await signedIn(browser, ACCOUNTS.admin);

    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Users" }).click();
    await page.getByLabel("Search").fill("jennifer");
    await expect(page.getByRole("table", { name: "Users" }).getByRole("row", { name: /Jennifer Anderson/ })).toBeVisible();

    await page.goto(`/staff/tickets/${id}`);
    await expect(page.getByText("You have read-only access to this ticket.")).toBeVisible();
    await expect(page.getByLabel("Ticket Owner")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Update status" })).toHaveCount(0);
    await page.context().close();
  });
});

// docs/lab-04/tests.md REG-04 and the FR-21 sweep: every main screen of every role loads without console errors,
// uncaught exceptions or server errors, with no placeholder text or unnamed control, and every link on the
// dashboards and lists leads to a real screen.
test.describe("FR-21 screen sweep", () => {
  test("Requester screens", async ({ browser }) => {
    const requesterApi = await apiSession(ACCOUNTS.requester);
    const id = await createTicketViaApi(requesterApi, `Sweep requester ${stamp()}`);
    const page = await signedIn(browser, ACCOUNTS.requester);
    const problems = watch(page);

    for (const path of ["/dashboard", "/tickets", "/tickets/new", `/tickets/${id}`, "/change-password"]) {
      await page.goto(path);
      await inspect(page, path);
    }
    await page.goto("/dashboard");
    await followEveryLink(page, problems, "/dashboard");
    await page.goto("/tickets");
    await followEveryLink(page, problems, "/tickets");
    expect(problems).toEqual([]);
    await page.context().close();
  });

  test("IT Staff screens, including every tab of a ticket", async ({ browser }) => {
    const requesterApi = await apiSession(ACCOUNTS.requester);
    const id = await createTicketViaApi(requesterApi, `Sweep staff ${stamp()}`);
    const page = await signedIn(browser, ACCOUNTS.staff);
    const problems = watch(page);

    for (const path of ["/dashboard", "/staff/queue", `/staff/tickets/${id}`]) {
      await page.goto(path);
      await inspect(page, path);
    }
    await page.goto(`/staff/tickets/${id}`);
    for (const tab of [/Public Comments/, /Internal Notes/, /Actions Taken/, /Attachments/]) {
      await page.getByRole("tab", { name: tab }).click();
      await inspect(page, `ticket tab ${tab}`);
    }
    await page.goto("/dashboard");
    await followEveryLink(page, problems, "/dashboard");
    await page.goto("/staff/queue");
    await followEveryLink(page, problems, "/staff/queue");
    expect(problems).toEqual([]);
    await page.context().close();
  });

  test("Administrator screens", async ({ browser }) => {
    const requesterApi = await apiSession(ACCOUNTS.requester);
    const id = await createTicketViaApi(requesterApi, `Sweep admin ${stamp()}`);
    const page = await signedIn(browser, ACCOUNTS.admin);
    const problems = watch(page);

    for (const path of ["/dashboard", "/admin/users", "/staff/queue", `/staff/tickets/${id}`]) {
      await page.goto(path);
      await inspect(page, path);
    }
    await page.goto("/dashboard");
    await followEveryLink(page, problems, "/dashboard");
    expect(problems).toEqual([]);
    await page.context().close();
  });
});
