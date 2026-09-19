import { APIRequestContext, expect, Page, request } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Shared helpers for the Lab 3 E2E specs (docs/lab-03/tests.md, E2E-01..03 and
// RESP-01..05). Screens are driven through the real UI; the API is used only
// to arrange fixtures (a fresh user, a ticket in a given state) and to prove
// authorization directly, the way a curl call with a real cookie would.

export const API = "http://localhost:3000";
export const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "TokTick-Dev#2026";

export const ACCOUNTS = {
  requester: "aran.suksawat@example.dev",
  requesterInactive: "somsak.jantawong@example.dev",
  staff: "jennifer.anderson@example.dev",
  staff2: "michael.brown@example.dev",
  admin: "john.smith@example.dev",
} as const;

export const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "tablet", width: 850, height: 1100 },
  { name: "mobile", width: 375, height: 812 },
] as const;

export type Viewport = (typeof VIEWPORTS)[number];

export function stamp(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export async function assertNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // +1 for subpixel rounding
}

// Full-page screenshot into artifacts/lab-03/screenshots/<dir>/<viewport>-<name>.png
// (docs/lab-03/ui-spec.md section 14) after asserting there is no horizontal scroll.
export async function shot(page: Page, dir: string, vp: Viewport, name: string) {
  await assertNoHorizontalScroll(page);
  await page.mouse.move(1, 1); // keep a stray hover highlight out of the picture
  const folder = path.join(process.cwd(), "artifacts", "lab-03", "screenshots", dir);
  fs.mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: path.join(folder, `${vp.name}-${name}.png`), fullPage: true });
}

export async function loginViaUi(page: Page, email: string, password = SEED_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
}

// The heading each role lands on after a normal login.
export const HOME_HEADING = {
  REQUESTER: "My Tickets",
  IT_STAFF: "Ticket Queue",
  ADMINISTRATOR: "Users",
} as const;

export async function loginAs(page: Page, email: string, role: keyof typeof HOME_HEADING) {
  await loginViaUi(page, email);
  await expect(page.getByRole("heading", { name: HOME_HEADING[role], exact: true })).toBeVisible();
}

export async function logoutViaUi(page: Page, fullName: string) {
  await page.getByRole("button", { name: new RegExp(fullName) }).click();
  await page.getByRole("menuitem", { name: /log out/i }).click();
  await expect(page.getByText("Not signed in")).toBeVisible();
}

// An API client that is logged in as `email`, with its own cookie jar.
export async function apiSession(email: string, password = SEED_PASSWORD): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: API });
  const res = await ctx.post("/api/auth/login", { data: { email, password } });
  expect(res.status(), `API login for ${email}`).toBe(200);
  return ctx;
}

export interface FreshUser {
  id: number;
  email: string;
  fullName: string;
  password: string;
}

export const FRESH_PASSWORD = "Fresh#Start-Pass1";

// A brand-new account created through the Administrator API, so a test never
// depends on (or spoils) the state of a seeded account. It has the initial
// password FRESH_PASSWORD and must change it at first login.
export async function createFreshUser(
  admin: APIRequestContext,
  over: { role?: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR"; isActive?: boolean; fullName?: string } = {},
): Promise<FreshUser> {
  const s = stamp();
  const fullName = over.fullName ?? `E2E Person ${s}`;
  const email = `e2e.${s}@example.dev`;
  const res = await admin.post("/api/admin/users", {
    data: { fullName, email, role: over.role ?? "REQUESTER", isActive: over.isActive ?? true, initialPassword: FRESH_PASSWORD },
  });
  expect(res.status(), "create fresh user").toBe(201);
  const body = await res.json();
  return { id: body.id, email, fullName, password: FRESH_PASSWORD };
}

// Ticket fixtures, created through the Requester API.
export async function createTicketViaApi(requester: APIRequestContext, summary: string): Promise<number> {
  const categories = await (await requester.get("/api/categories")).json();
  const systems = await (await requester.get("/api/related-systems")).json();
  const res = await requester.post("/api/tickets", {
    multipart: {
      summary,
      description: "Fixture ticket created by the Lab 3 E2E suite so screens can be checked in a known state.",
      categoryId: String(categories[0].id),
      relatedSystemId: String(systems[0].id),
      requestedPriority: "MEDIUM",
    },
  });
  expect(res.status(), "create ticket").toBe(201);
  return (await res.json()).id;
}

export async function selectedLabel(page: Page, label: string): Promise<string> {
  return page.getByLabel(label).evaluate((el) => (el as HTMLSelectElement).selectedOptions[0].textContent ?? "");
}
