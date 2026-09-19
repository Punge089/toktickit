import { test, expect, request } from "@playwright/test";
import {
  ACCOUNTS,
  API,
  apiSession,
  createFreshUser,
  loginAs,
  loginViaUi,
  logoutViaUi,
  stamp,
} from "./helpers";

// docs/lab-03/tests.md E2E-01 - specification.md AC-01, AC-02, AC-05..AC-11.
// Every step goes through the real Login screen against the real API.
test.describe("E2E-01 authentication", () => {
  // AC-05, BR-12: the same safe message whether the email or the password is wrong.
  test("a wrong password and an unknown email show the same safe message and clear the password", async ({ page }) => {
    const admin = await apiSession(ACCOUNTS.admin);
    const fresh = await createFreshUser(admin);

    await loginViaUi(page, fresh.email, "Definitely#Wrong1");
    const alert = page.getByRole("alert");
    await expect(alert).toHaveText(/Invalid email or password\./);
    await expect(page.getByLabel("Password")).toHaveValue(""); // a rejected password is never left in the field
    await expect(page).toHaveURL(/\/login$/);
    const wrongPasswordText = await alert.textContent();

    await loginViaUi(page, `nobody.${stamp()}@example.dev`, "Definitely#Wrong1");
    await expect(page.getByRole("alert")).toHaveText(/Invalid email or password\./);
    expect(await page.getByRole("alert").textContent()).toBe(wrongPasswordText);

    // Empty submit is caught by the same safe path, not a crash.
    await page.getByLabel("Email address").fill("");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  // AC-06, BR-12
  test("an inactive account with the correct password is told it is inactive", async ({ page }) => {
    await loginViaUi(page, ACCOUNTS.requesterInactive);
    await expect(page.getByRole("alert")).toHaveText(/This account is inactive\. Contact your administrator\./);
    await expect(page).toHaveURL(/\/login$/);
  });

  // UI-03: a slow response shows the busy state and blocks a second submit.
  test("Sign In shows a busy state while the request is in flight", async ({ page }) => {
    await page.route("**/api/auth/login", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.goto("/login");
    await page.getByLabel("Email address").fill(ACCOUNTS.requester);
    await page.getByLabel("Password").fill("TokTick-Dev#2026");
    await page.getByRole("button", { name: "Sign In" }).click();

    const busy = page.getByRole("button", { name: /Signing in/ });
    await expect(busy).toBeVisible();
    await expect(busy).toBeDisabled();
    await expect(page.getByLabel("Email address")).toBeDisabled();
    await expect(page.getByRole("heading", { name: "My Tickets", exact: true })).toBeVisible();
  });

  // AC-02, BR-02, BR-08, BR-09
  test("a first-login user is held on Change Password until a valid new password is saved", async ({ page }) => {
    const admin = await apiSession(ACCOUNTS.admin);
    const fresh = await createFreshUser(admin);

    await loginViaUi(page, fresh.email, fresh.password);
    await expect(page).toHaveURL(/\/change-password$/);
    await expect(page.getByRole("heading", { name: "Change Your Password" })).toBeVisible();

    // The normal application is unavailable: a direct URL bounces back.
    await page.goto("/tickets");
    await expect(page).toHaveURL(/\/change-password$/);
    await page.goto("/tickets/new");
    await expect(page).toHaveURL(/\/change-password$/);

    // The backend agrees, not just the router: every other endpoint is 403.
    const blocked = await page.request.get(`${API}/api/tickets`);
    expect(blocked.status()).toBe(403);
    expect((await blocked.json()).error).toBe("PASSWORD_CHANGE_REQUIRED");

    const submit = page.getByRole("button", { name: "Continue" });
    await page.getByLabel(/Current \(temporary\) password/).fill(fresh.password);
    await page.getByLabel(/^New password/).fill("weakpass");
    await page.getByLabel("Confirm new password").fill("weakpass");
    await expect(submit).toBeDisabled(); // policy not met

    await page.getByLabel(/^New password/).fill("Brand#New-Pass9");
    await page.getByLabel("Confirm new password").fill("Brand#New-Pass0");
    await expect(page.getByText("Passwords do not match.")).toBeVisible();
    await expect(submit).toBeDisabled();

    // A wrong current password is reported under its field and keeps the user here.
    await page.getByLabel("Confirm new password").fill("Brand#New-Pass9");
    await page.getByLabel(/Current \(temporary\) password/).fill("Not#My-Password1");
    await submit.click();
    await expect(page.getByText("Current password is incorrect.")).toBeVisible();
    await expect(page).toHaveURL(/\/change-password$/);

    await page.getByLabel(/Current \(temporary\) password/).fill(fresh.password);
    await page.getByLabel(/^New password/).fill("Brand#New-Pass9");
    await page.getByLabel("Confirm new password").fill("Brand#New-Pass9");
    await submit.click();
    await expect(page.getByRole("heading", { name: "My Tickets", exact: true })).toBeVisible();

    // The old password is dead and the new one works.
    const oldLogin = await request.newContext({ baseURL: API });
    expect((await oldLogin.post("/api/auth/login", { data: { email: fresh.email, password: fresh.password } })).status()).toBe(401);
    const newLogin = await apiSession(fresh.email, "Brand#New-Pass9");
    expect((await newLogin.get("/api/auth/me")).status()).toBe(200);
  });

  // AC-08, AC-09, BR-10
  test("the shell shows who is signed in, and after Log Out nothing protected can be reached", async ({ page }) => {
    await loginAs(page, ACCOUNTS.requester, "REQUESTER");

    const header = page.getByRole("banner");
    await expect(header.getByText("Aran Suksawat")).toBeVisible();
    await expect(header.getByText("Requester", { exact: true })).toBeVisible();

    // Visit a second protected screen so the browser history holds real protected entries.
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Create Ticket" }).click();
    await expect(page).toHaveURL(/\/tickets\/new$/);

    await logoutViaUi(page, "Aran Suksawat");
    await expect(page).toHaveURL(/\/login$/);

    // Browser Back does not bring the protected screen back: it lands on Login.
    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "My Tickets", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Email address")).toBeVisible();

    // Typing a protected URL lands on Login.
    await page.goto("/tickets");
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/tickets/new");
    await expect(page).toHaveURL(/\/login$/);

    // Direct API access with the cookie the browser now holds is refused (401).
    for (const url of ["/api/auth/me", "/api/tickets"]) {
      const res = await page.request.get(`${API}${url}`);
      expect(res.status(), url).toBe(401);
    }
  });

  // AC-10: navigation shows only what the role may use, and lands on the role's home.
  test("each role lands on its own home and sees only its own navigation", async ({ page }) => {
    const navLinks = async () => (await page.getByRole("navigation", { name: "Primary" }).getByRole("link").allTextContents()).map((t) => t.trim());

    await loginAs(page, ACCOUNTS.requester, "REQUESTER");
    expect(await navLinks()).toEqual(["My Tickets", "Create Ticket"]);
    await logoutViaUi(page, "Aran Suksawat");

    await loginAs(page, ACCOUNTS.staff, "IT_STAFF");
    await expect(page).toHaveURL(/\/staff\/queue$/);
    expect(await navLinks()).toEqual(["My Queue"]);
    await expect(page.getByRole("banner").getByText("IT Staff", { exact: true })).toBeVisible();
    await logoutViaUi(page, "Jennifer Anderson");

    await loginAs(page, ACCOUNTS.admin, "ADMINISTRATOR");
    await expect(page).toHaveURL(/\/admin\/users$/);
    expect(await navLinks()).toEqual(["Users"]);
    await expect(page.getByRole("banner").getByText("Administrator", { exact: true })).toBeVisible();
  });

  // AC-11: a role opening another role's URL sees Access denied, and the API says 403.
  test("a role that opens another role's URL directly sees Access denied", async ({ page }) => {
    await loginAs(page, ACCOUNTS.requester, "REQUESTER");
    for (const url of ["/staff/queue", "/staff/tickets/1", "/admin/users"]) {
      await page.goto(url);
      await expect(page.getByRole("heading", { name: /access denied/i })).toBeVisible();
    }
    for (const url of ["/api/staff/tickets", "/api/admin/users"]) {
      expect((await page.request.get(`${API}${url}`)).status(), url).toBe(403);
    }
    await logoutViaUi(page, "Aran Suksawat");

    await loginAs(page, ACCOUNTS.staff, "IT_STAFF");
    for (const url of ["/admin/users", "/tickets", "/tickets/new"]) {
      await page.goto(url);
      await expect(page.getByRole("heading", { name: /access denied/i })).toBeVisible();
    }
    expect((await page.request.get(`${API}/api/admin/users`)).status()).toBe(403);
    await logoutViaUi(page, "Jennifer Anderson");

    await loginAs(page, ACCOUNTS.admin, "ADMINISTRATOR");
    for (const url of ["/tickets", "/tickets/new"]) {
      await page.goto(url);
      await expect(page.getByRole("heading", { name: /access denied/i })).toBeVisible();
    }
  });

  // BR-39: the removed Lab 2 selector route is gone.
  test("the removed Development Requester selector route no longer exists", async ({ page }) => {
    await page.goto("/select-requester");
    await expect(page.getByText(/page not found/i)).toBeVisible();
    await expect(page.getByText(/select.*requester|development requester/i)).toHaveCount(0);
    const stored = await page.evaluate(() => Object.keys(sessionStorage).concat(Object.keys(localStorage)));
    expect(stored.filter((k) => /requester/i.test(k))).toEqual([]);
  });
});
