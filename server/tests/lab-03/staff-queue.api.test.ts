import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { seedAll } from "../../prisma/seed.js";
import { createAndLoginUser } from "../helpers/auth.js";
import { parseQueueQuery } from "../../src/lib/staffQueueQuery.js";

// docs/lab-03/tests.md UNIT-04, QUE-01..QUE-06 — api-spec.md §8/§10,
// labsheet §6.3, specification.md AC-12, AC-23, AC-24.
describe("parseQueueQuery (UNIT-04)", () => {
  it("applies defaults when nothing is supplied", () => {
    const r = parseQueueQuery({});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.sortField).toBe("createdAt");
      expect(r.value.sortDir).toBe("desc");
      expect(r.value.page).toBe(1);
      expect(r.value.pageSize).toBe(10);
    }
  });

  it("parses every valid filter", () => {
    const r = parseQueueQuery({
      search: "  vpn ",
      status: "OPEN",
      itPriority: "HIGH",
      categoryId: "2",
      owner: "me",
      sort: "itPriority:asc",
      page: "3",
      pageSize: "20",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toMatchObject({
        search: "vpn",
        status: "OPEN",
        itPriority: "HIGH",
        categoryId: 2,
        owner: { kind: "me" },
        sortField: "itPriority",
        sortDir: "asc",
        page: 3,
        pageSize: 20,
      });
    }
  });

  it("accepts owner=unassigned and owner=<id>", () => {
    const a = parseQueueQuery({ owner: "unassigned" });
    const b = parseQueueQuery({ owner: "7" });
    expect(a.ok && a.value.owner).toEqual({ kind: "unassigned" });
    expect(b.ok && b.value.owner).toEqual({ kind: "user", id: 7 });
  });

  it.each([
    ["status", { status: "DONE" }],
    ["itPriority", { itPriority: "SEVERE" }],
    ["categoryId", { categoryId: "abc" }],
    ["owner", { owner: "nobody" }],
    ["sort", { sort: "summary:asc" }],
    ["sort", { sort: "createdAt:sideways" }],
    ["page", { page: "0" }],
    ["page", { page: "1.5" }],
    ["pageSize", { pageSize: "7" }],
    ["search", { search: "x".repeat(101) }],
  ])("rejects an invalid %s by name", (field, query) => {
    const r = parseQueueQuery(query);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors).toHaveProperty(field);
  });

  it("rejects a repeated (array) parameter", () => {
    const r = parseQueueQuery({ status: ["OPEN", "NEW"] });
    expect(r.ok).toBe(false);
  });
});

describe("GET /api/staff/tickets", () => {
  let staff: Awaited<ReturnType<typeof createAndLoginUser>>;
  let otherStaff: Awaited<ReturnType<typeof createAndLoginUser>>;
  let requester: Awaited<ReturnType<typeof createAndLoginUser>>;
  let categoryId: number;
  let relatedSystemId: number;
  const marker = `QueueFixture${Date.now()}`;

  async function makeTicket(overrides: Record<string, unknown> = {}) {
    return getPrisma().ticket.create({
      data: {
        ticketNumber: `TKT-TEST-Q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        requesterId: requester.user.id,
        categoryId,
        relatedSystemId,
        summary: `${marker} default`,
        description: "A".repeat(30),
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        ...overrides,
      },
    });
  }

  beforeAll(async () => {
    await seedAll();
    staff = await createAndLoginUser({ role: "IT_STAFF", fullName: "Queue Fixture Staff" });
    otherStaff = await createAndLoginUser({ role: "IT_STAFF", fullName: "Queue Fixture Other Staff" });
    requester = await createAndLoginUser({ role: "REQUESTER", fullName: "Queue Fixture Requester" });
    const prisma = getPrisma();
    categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id;
    relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;

    await makeTicket({ summary: `${marker} A`, currentStatus: "OPEN", itPriority: "HIGH", ownerId: staff.user.id });
    await makeTicket({ summary: `${marker} B`, currentStatus: "OPEN", itPriority: "LOW", ownerId: staff.user.id });
    await makeTicket({ summary: `${marker} C`, currentStatus: "NEW", itPriority: "HIGH", ownerId: null });
    await makeTicket({ summary: `${marker} D`, currentStatus: "OPEN", itPriority: "HIGH", ownerId: otherStaff.user.id });
  });

  // QUE-01, AC-23
  it("returns only Tickets matching every applied condition, in the requested order", async () => {
    const res = await staff.agent.get(
      `/api/staff/tickets?search=${marker}&status=OPEN&itPriority=HIGH&owner=me&sort=itPriority:desc`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items.map((t: { summary: string }) => t.summary)).toEqual([`${marker} A`]);
    expect(res.body.totalItems).toBe(1);
    expect(res.body.appliedFilters).toMatchObject({ status: "OPEN", itPriority: "HIGH", owner: "me" });

    const sorted = await staff.agent.get(`/api/staff/tickets?search=${marker}&status=OPEN&owner=me&sort=itPriority:asc`);
    expect(sorted.body.items.map((t: { summary: string }) => t.summary)).toEqual([`${marker} B`, `${marker} A`]);
  });

  it("searches the requester's name as well as the ticket number and summary", async () => {
    const byName = await staff.agent.get(`/api/staff/tickets?search=Queue Fixture Requester&pageSize=50`);
    expect(byName.status).toBe(200);
    expect(byName.body.items.some((t: { summary: string }) => t.summary.startsWith(marker))).toBe(true);
  });

  // QUE-02, AC-24
  it("rejects invalid query parameters with 400 naming the parameter", async () => {
    for (const [param, query] of [
      ["sort", "sort=summary:asc"],
      ["status", "status=DONE"],
      ["pageSize", "pageSize=7"],
    ]) {
      const res = await staff.agent.get(`/api/staff/tickets?${query}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("INVALID_QUERY");
      expect(res.body.fieldErrors).toHaveProperty(param);
    }
  });

  // QUE-03
  it("filters by owner=unassigned and owner=<id>", async () => {
    const unassigned = await staff.agent.get(`/api/staff/tickets?search=${marker}&owner=unassigned`);
    expect(unassigned.body.items.map((t: { summary: string }) => t.summary)).toEqual([`${marker} C`]);
    expect(unassigned.body.items[0].owner).toBeNull();

    const byId = await staff.agent.get(`/api/staff/tickets?search=${marker}&owner=${otherStaff.user.id}`);
    expect(byId.body.items.map((t: { summary: string }) => t.summary)).toEqual([`${marker} D`]);
    expect(byId.body.items[0].owner).toMatchObject({ id: otherStaff.user.id, fullName: "Queue Fixture Other Staff" });
  });

  // QUE-04
  it("returns an empty page with correct metadata (not a 400) when page is beyond totalPages", async () => {
    const res = await staff.agent.get(`/api/staff/tickets?search=${marker}&page=99`);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.totalItems).toBe(4);
    expect(res.body.totalPages).toBe(1);
    expect(res.body.page).toBe(99);
  });

  it("paginates with a stable order and no overlap between pages", async () => {
    const p1 = await staff.agent.get(`/api/staff/tickets?search=${marker}&pageSize=10&sort=createdAt:desc`);
    expect(p1.body.pageSize).toBe(10);
    // 4 fixtures + none from other tests share this marker
    expect(p1.body.items).toHaveLength(4);
    const ids = p1.body.items.map((t: { id: number }) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // QUE-05, AC-12
  it("shows a Requester-created Ticket with itPriority equal to its requestedPriority", async () => {
    const created = await requester.agent.post("/api/tickets").field({
      summary: `${marker} via API`,
      description: "Created through the Requester API to prove IT Priority starts equal to Requested Priority.",
      categoryId: String(categoryId),
      relatedSystemId: String(relatedSystemId),
      requestedPriority: "URGENT",
    });
    expect(created.status).toBe(201);

    const res = await staff.agent.get(`/api/staff/tickets?search=${marker} via API`);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].requestedPriority).toBe("URGENT");
    expect(res.body.items[0].itPriority).toBe("URGENT");
  });

  // QUE-06 — role boundary for the list itself
  it("allows IT Staff and Administrator to read the Queue, and rejects Requester (403) and no session (401)", async () => {
    const admin = await createAndLoginUser({ role: "ADMINISTRATOR" });
    expect((await admin.agent.get("/api/staff/tickets")).status).toBe(200);
    expect((await staff.agent.get("/api/staff/tickets")).status).toBe(200);

    const forbidden = await requester.agent.get("/api/staff/tickets");
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error).toBe("FORBIDDEN");
    expect(JSON.stringify(forbidden.body)).not.toContain("ticketNumber");

    expect((await request(app).get("/api/staff/tickets")).status).toBe(401);
  });

  it("lists only active IT Staff as assignable users", async () => {
    const inactive = await createAndLoginUser({ role: "IT_STAFF", fullName: "Queue Fixture Inactive Staff" });
    await getPrisma().user.update({ where: { id: inactive.user.id }, data: { isActive: false } });

    const res = await staff.agent.get("/api/staff/assignable-users");
    expect(res.status).toBe(200);
    const ids = res.body.map((u: { id: number }) => u.id);
    expect(ids).toContain(staff.user.id);
    expect(ids).not.toContain(inactive.user.id);
    expect(ids).not.toContain(requester.user.id);

    expect((await requester.agent.get("/api/staff/assignable-users")).status).toBe(403);
  });
});
