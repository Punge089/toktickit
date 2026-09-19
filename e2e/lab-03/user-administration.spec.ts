import { test, expect, request } from "@playwright/test";
import { ACCOUNTS, API, FRESH_PASSWORD, apiSession, createFreshUser, loginAs, loginViaUi, logoutViaUi, stamp } from "./helpers";

// docs/lab-03/tests.md E2E-03 - specification.md AC-25..AC-29. The Administrator
// works the User Management screen; a second, real login proves the outcome.
test.describe("E2E-03 user administration", () => {
  test("list, search and role filter", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin, "ADMINISTRATOR");
    const table = page.getByRole("table", { name: "Users" });

    // Name, Email, Role, Status and an Edit action (FR-17)
    await expect(table.getByRole("columnheader")).toHaveText(["Name", "Email", "Role", "Status", "Action"]);
    const jennifer = table.getByRole("row", { name: /Jennifer Anderson/ });
    await expect(jennifer).toContainText("jennifer.anderson@example.dev");
    await expect(jennifer).toContainText("IT Staff");
    await expect(jennifer).toContainText("Active");
    await expect(jennifer.getByRole("button", { name: "Edit Jennifer Anderson" })).toBeVisible();
    await expect(table.getByRole("row", { name: /Somsak Jantawong/ })).toContainText("Inactive");
    await expect(page.getByRole("button", { name: /^(Next|Prev)$/ })).toHaveCount(0); // no pagination (labsheet 8.5)

    // Search by name, then by email, case-insensitively
    await page.getByLabel("Search").fill("jennifer");
    await expect(table.getByRole("row", { name: /Jennifer Anderson/ })).toBeVisible();
    await expect(table.getByRole("row", { name: /Aran Suksawat/ })).toHaveCount(0);
    await page.getByLabel("Search").fill("ARAN.SUKSAWAT@");
    await expect(table.getByRole("row", { name: /Aran Suksawat/ })).toBeVisible();
    await expect(table.getByRole("row", { name: /Jennifer Anderson/ })).toHaveCount(0);

    // Role filter on its own and combined with a search
    await page.getByRole("button", { name: "Clear filters" }).first().click();
    await page.getByLabel("Role", { exact: true }).selectOption("ADMINISTRATOR");
    await expect(table.getByRole("row", { name: /John Smith/ })).toBeVisible();
    await expect(table.getByRole("row", { name: /Jennifer Anderson/ })).toHaveCount(0);
    await page.getByLabel("Role", { exact: true }).selectOption("IT_STAFF");
    await page.getByLabel("Search").fill("robert");
    await expect(table.getByRole("row", { name: /Robert Wilson/ })).toContainText("Inactive");

    // Nothing matches: a no-results message with a way out
    await page.getByLabel("Search").fill(`nobody-${stamp()}`);
    await expect(page.getByText("No users match your search")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).last().click();
    await expect(table.getByRole("row", { name: /Aran Suksawat/ })).toBeVisible();
  });

  // AC-25, BR-28, BR-33: create, duplicate email, invalid input
  test("create a user, hit validation and a duplicate email, then sign in as the new user", async ({ page, browser }) => {
    await loginAs(page, ACCOUNTS.admin, "ADMINISTRATOR");
    const s = stamp();
    const email = `e2e.created.${s}@example.dev`;

    await page.getByRole("button", { name: "+ Create User" }).click();
    const panel = page.getByRole("region", { name: "Create New User" });

    // Empty and weak input is refused on the screen, field by field
    await panel.getByRole("button", { name: "Save User" }).click();
    await expect(panel.getByText("Full name is required.")).toBeVisible();
    await expect(panel.getByText("Email is required.")).toBeVisible();
    await expect(panel.getByText("Initial password must meet every rule below.")).toBeVisible();

    // A duplicate email, typed in different letter case, is a conflict from the server (BR-33)
    await panel.getByLabel(/Full name/).fill(`E2E Created ${s}`);
    await panel.getByLabel(/Email address/).fill("ARAN.SUKSAWAT@EXAMPLE.DEV");
    await panel.getByLabel(/^Initial password/).fill("Temp#Passw0rd1");
    await panel.getByRole("button", { name: "Save User" }).click();
    await expect(panel.getByText("That email address is already in use.")).toBeVisible();
    await expect(panel).toBeVisible();

    // Valid: one role, an initial password
    await panel.getByLabel(/Email address/).fill(email);
    await panel.getByLabel(/^Role/).selectOption("IT_STAFF");
    await panel.getByRole("button", { name: "Save User" }).click();
    await expect(page.getByText("User saved.")).toBeVisible();
    await page.getByLabel("Search").fill(email);
    const row = page.getByRole("table", { name: "Users" }).getByRole("row", { name: new RegExp(`E2E Created ${s}`) });
    await expect(row).toContainText("IT Staff");
    await expect(row).toContainText("Active");

    // The new user signs in with the initial password and is held on Change Password (AC-02)
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await loginViaUi(otherPage, email, "Temp#Passw0rd1");
    await expect(otherPage).toHaveURL(/\/change-password$/);
    await other.close();
  });

  // FR-19, BR-29, BR-35: edit name, email, role and active state
  test("edit a user's name, email, role and active state; deactivating ends their session", async ({ page }) => {
    const admin = await apiSession(ACCOUNTS.admin);
    const fresh = await createFreshUser(admin, { role: "REQUESTER" });
    // Give the user a working password and a live session, as a real person in the middle of a shift.
    const victim = await request.newContext({ baseURL: API });
    const login = await victim.post("/api/auth/login", { data: { email: fresh.email, password: fresh.password } });
    expect(login.status()).toBe(200);
    expect((await victim.get("/api/auth/me")).status()).toBe(200);

    await loginAs(page, ACCOUNTS.admin, "ADMINISTRATOR");
    await page.getByLabel("Search").fill(fresh.email);
    await page.getByRole("button", { name: `Edit ${fresh.fullName}` }).click();
    const panel = page.getByRole("region", { name: "Edit User" });

    const renamed = `${fresh.fullName} Renamed`;
    await panel.getByLabel(/Full name/).fill(renamed);
    await panel.getByLabel(/^Role/).selectOption("IT_STAFF");
    await panel.getByRole("switch", { name: "Active" }).click(); // Yes -> No
    await panel.getByRole("button", { name: "Save User" }).click();
    await expect(page.getByText("User saved.")).toBeVisible();

    const row = page.getByRole("table", { name: "Users" }).getByRole("row", { name: new RegExp(renamed) });
    await expect(row).toContainText("IT Staff");
    await expect(row).toContainText("Inactive");

    // Deactivation ends the open session at once (BR-35) and blocks the next sign-in
    expect((await victim.get("/api/auth/me")).status()).toBe(401);
    const blocked = await victim.post("/api/auth/login", { data: { email: fresh.email, password: fresh.password } });
    expect(blocked.status()).toBe(403);
    expect((await blocked.json()).error).toBe("ACCOUNT_INACTIVE");

    // Reactivate
    await page.getByRole("button", { name: `Edit ${renamed}` }).click();
    await page.getByRole("region", { name: "Edit User" }).getByRole("switch", { name: "Active" }).click();
    await page.getByRole("region", { name: "Edit User" }).getByRole("button", { name: "Save User" }).click();
    await expect(page.getByRole("table", { name: "Users" }).getByRole("row", { name: new RegExp(renamed) })).toContainText("Active");
    expect((await victim.post("/api/auth/login", { data: { email: fresh.email, password: fresh.password } })).status()).toBe(200);
  });

  // AC-26, BR-30: set a new initial password, the user must change it at the next login
  test("set a new initial password: the old session ends and the next login forces a password change", async ({ page, browser }) => {
    const admin = await apiSession(ACCOUNTS.admin);
    const fresh = await createFreshUser(admin);
    // The user has already chosen their own password once.
    const own = await request.newContext({ baseURL: API });
    await own.post("/api/auth/login", { data: { email: fresh.email, password: fresh.password } });
    const changed = await own.post("/api/auth/change-password", {
      data: { currentPassword: fresh.password, newPassword: "Chosen#By-User9", confirmPassword: "Chosen#By-User9" },
    });
    expect(changed.status()).toBe(200);
    expect((await own.get("/api/tickets")).status()).toBe(200); // fully in the application

    await loginAs(page, ACCOUNTS.admin, "ADMINISTRATOR");
    await page.getByLabel("Search").fill(fresh.email);
    await page.getByRole("button", { name: `Edit ${fresh.fullName}` }).click();
    const panel = page.getByRole("region", { name: "Edit User" });
    await panel.getByRole("button", { name: "Set new initial password" }).click();
    const setButton = panel.getByRole("button", { name: "Set password", exact: true });
    await expect(setButton).toBeDisabled();
    await panel.getByLabel("New initial password").fill("weak");
    await expect(setButton).toBeDisabled();
    await panel.getByLabel("New initial password").fill("Reset#By-Admin7");
    await setButton.click();
    await expect(panel.getByText(/must change it at the next login/)).toBeVisible();

    // The user's earlier session is gone
    expect((await own.get("/api/tickets")).status()).toBe(401);

    // Next login: the new initial password works and forces the change screen
    const context = await browser.newContext();
    const userPage = await context.newPage();
    await loginViaUi(userPage, fresh.email, "Chosen#By-User9");
    await expect(userPage.getByRole("alert")).toHaveText(/Invalid email or password\./); // the password they chose is no longer valid
    await loginViaUi(userPage, fresh.email, "Reset#By-Admin7");
    await expect(userPage).toHaveURL(/\/change-password$/);
    await expect(userPage.getByRole("heading", { name: "Change Your Password" })).toBeVisible();
    await userPage.goto("/tickets");
    await expect(userPage).toHaveURL(/\/change-password$/);
    await context.close();
  });

  // AC-27, AC-28, BR-31, BR-32
  test("an Administrator cannot deactivate or demote themselves, or leave the system with no active Administrator", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin, "ADMINISTRATOR");
    const me = await (await page.request.get(`${API}/api/auth/me`)).json();
    const list = await (await page.request.get(`${API}/api/admin/users`)).json();

    await page.getByLabel("Search").fill(ACCOUNTS.admin);
    await page.getByRole("button", { name: "Edit John Smith" }).click();
    const panel = page.getByRole("region", { name: "Edit User" });
    await expect(panel.getByLabel(/^Role/)).toBeDisabled();
    await expect(panel.getByRole("switch", { name: "Active" })).toBeDisabled();
    await expect(panel.getByText("You cannot change your own role or active state.")).toBeVisible();
    if (list.activeAdministratorCount === 1) {
      // The seeded database has exactly one active Administrator, so both rules apply.
      await expect(panel.getByText("At least one active Administrator must remain.")).toBeVisible();
    }

    // The screen is not the security control: the API refuses the same requests directly.
    const deactivate = await page.request.patch(`${API}/api/admin/users/${me.id}`, { data: { isActive: false } });
    expect(deactivate.status()).toBe(409);
    expect((await deactivate.json()).error).toBe("CANNOT_DEACTIVATE_SELF");
    const demote = await page.request.patch(`${API}/api/admin/users/${me.id}`, { data: { role: "IT_STAFF" } });
    expect(demote.status()).toBe(409);
    expect((await demote.json()).error).toBe("CANNOT_CHANGE_OWN_ROLE");
    expect((await page.request.get(`${API}/api/auth/me`)).status()).toBe(200); // still signed in, still an Administrator

    // A second Administrator does not change the self rule for either of them
    const admin = await apiSession(ACCOUNTS.admin);
    const second = await createFreshUser(admin, { role: "ADMINISTRATOR", fullName: `E2E Second Admin ${stamp()}` });
    const secondApi = await request.newContext({ baseURL: API });
    await secondApi.post("/api/auth/login", { data: { email: second.email, password: second.password } });
    await secondApi.post("/api/auth/change-password", {
      data: { currentPassword: second.password, newPassword: "Second#Admin-Pw1", confirmPassword: "Second#Admin-Pw1" },
    });
    const selfSecond = await secondApi.patch(`/api/admin/users/${second.id}`, { data: { isActive: false } });
    expect(selfSecond.status()).toBe(409);
    expect((await selfSecond.json()).error).toBe("CANNOT_DEACTIVATE_SELF");

    // Tidy up: the first Administrator retires the extra one, leaving exactly the seeded Administrator.
    const retire = await admin.patch(`/api/admin/users/${second.id}`, { data: { isActive: false } });
    expect(retire.status()).toBe(200);
  });

  // AC-29: non-Administrators, on the screen and directly against the API
  test("Requester and IT Staff cannot open User Management or call its API", async ({ page }) => {
    for (const [email, role, name] of [
      [ACCOUNTS.requester, "REQUESTER", "Aran Suksawat"],
      [ACCOUNTS.staff, "IT_STAFF", "Jennifer Anderson"],
    ] as const) {
      await loginAs(page, email, role);
      await page.goto("/admin/users");
      await expect(page.getByRole("heading", { name: /access denied/i })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Users" })).toHaveCount(0);

      for (const res of [
        await page.request.get(`${API}/api/admin/users`),
        await page.request.post(`${API}/api/admin/users`, { data: { fullName: "X Person", email: `x.${stamp()}@example.dev`, role: "REQUESTER", initialPassword: FRESH_PASSWORD } }),
        await page.request.patch(`${API}/api/admin/users/1`, { data: { fullName: "Hacked" } }),
        await page.request.post(`${API}/api/admin/users/1/initial-password`, { data: { initialPassword: FRESH_PASSWORD } }),
      ]) {
        expect(res.status()).toBe(403);
        expect(await res.text()).not.toContain("@example.dev");
      }
      await logoutViaUi(page, name);
    }
  });
});
