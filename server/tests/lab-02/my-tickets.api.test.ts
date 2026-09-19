import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { seedAll } from "../../prisma/seed.js";
import { createAndLoginUser } from "../helpers/auth.js";

// api-spec.md §5, specification.md BR-09, BR-11..BR-13, AC-10..AC-14.
//
// Issue 64 (REG-02) — every request now authenticates via a real session
// cookie instead of X-Dev-Requester-Id, per docs/lab-03/BR-38.
describe("GET /api/tickets", () => {
  let agentA: Awaited<ReturnType<typeof createAndLoginUser>>["agent"];
  let agentB: Awaited<ReturnType<typeof createAndLoginUser>>["agent"];
  let requesterA: number;
  let categoryId: number;
  let relatedSystemId: number;

  async function makeTicket(
    requesterId: number,
    overrides: Partial<{ summary: string; ticketNumber: string; createdAt: Date }> = {},
  ) {
    return getPrisma().ticket.create({
      data: {
        ticketNumber: overrides.ticketNumber ?? `TKT-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        requesterId,
        categoryId,
        relatedSystemId,
        summary: overrides.summary ?? "Test ticket for My Tickets API",
        description: "A".repeat(30),
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
      },
    });
  }

  beforeAll(async () => {
    await seedAll();
    const a = await createAndLoginUser({ role: "REQUESTER", fullName: "My Tickets Fixture A" });
    const b = await createAndLoginUser({ role: "REQUESTER", fullName: "My Tickets Fixture B" });
    agentA = a.agent;
    agentB = b.agent;
    requesterA = a.user.id;

    const prisma = getPrisma();
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
    categoryId = category.id;
    relatedSystemId = relatedSystem.id;
  });

  // API-07
  it("scopes results to the requesting Requester only (BR-09)", async () => {
    const uniqueSummary = `Requester A only ${Date.now()}`;
    await makeTicket(requesterA, { summary: uniqueSummary });

    const resA = await agentA.get("/api/tickets?pageSize=50");
    expect(resA.body.data.some((t: { summary: string }) => t.summary === uniqueSummary)).toBe(true);

    const resB = await agentB.get("/api/tickets?pageSize=50");
    expect(resB.body.data.some((t: { summary: string }) => t.summary === uniqueSummary)).toBe(false);
  });

  // API-08
  it("search matches both ticketNumber and summary (BR-11)", async () => {
    const marker = `Marker${Date.now()}`;
    const ticket = await makeTicket(requesterA, { summary: `Something with ${marker} inside` });

    const bySummary = await agentA.get(`/api/tickets?search=${marker}`);
    expect(bySummary.body.data.some((t: { id: number }) => t.id === ticket.id)).toBe(true);

    const byNumber = await agentA.get(`/api/tickets?search=${ticket.ticketNumber}`);
    expect(byNumber.body.data.some((t: { id: number }) => t.id === ticket.id)).toBe(true);

    const noMatch = await agentA.get("/api/tickets?search=zzz-definitely-no-match-zzz");
    expect(noMatch.body.data).toHaveLength(0);
  });

  // API-09
  it("keeps paginated order stable via the secondary id:desc sort when createdAt ties (BR-12)", async () => {
    const tieTime = new Date("2026-01-01T00:00:00.000Z");
    await makeTicket(requesterA, { createdAt: tieTime });
    await makeTicket(requesterA, { createdAt: tieTime });

    const res1 = await agentA.get("/api/tickets?sort=createdAt:desc&pageSize=50");
    const res2 = await agentA.get("/api/tickets?sort=createdAt:desc&pageSize=50");

    expect(res1.body.data.map((t: { id: number }) => t.id)).toEqual(
      res2.body.data.map((t: { id: number }) => t.id),
    );
  });

  // API-10
  it("rejects an invalid pageSize and an out-of-range page with 400, naming the field (BR-13)", async () => {
    const badPageSize = await agentA.get("/api/tickets?pageSize=7");
    expect(badPageSize.status).toBe(400);
    expect(badPageSize.body.fieldErrors).toHaveProperty("pageSize");

    const badPage = await agentA.get("/api/tickets?page=999");
    expect(badPage.status).toBe(400);
    expect(badPage.body.fieldErrors).toHaveProperty("page");
  });

  // API-23 — AC-13's happy path: walking forward a page must return a
  // different, non-overlapping slice and matching pagination metadata. API-10
  // only covered the rejected values.
  it("returns a different, non-overlapping slice on page 2 with correct metadata (AC-13)", async () => {
    const { agent: pagerAgent, user: pager } = await createAndLoginUser({ role: "REQUESTER" });
    for (let i = 0; i < 15; i++) {
      await makeTicket(pager.id, { summary: `Pagination fixture ticket ${i}` });
    }

    const page1 = await pagerAgent.get("/api/tickets?page=1&pageSize=10");
    const page2 = await pagerAgent.get("/api/tickets?page=2&pageSize=10");

    expect(page1.status).toBe(200);
    expect(page2.status).toBe(200);
    expect(page1.body.data).toHaveLength(10);
    expect(page2.body.data).toHaveLength(5);

    expect(page1.body.meta.page).toBe(1);
    expect(page2.body.meta.page).toBe(2);
    expect(page2.body.meta.totalItems).toBe(15);
    expect(page2.body.meta.totalPages).toBe(2);

    const ids1 = page1.body.data.map((t: { id: number }) => t.id);
    const ids2 = page2.body.data.map((t: { id: number }) => t.id);
    expect(ids1.filter((id: number) => ids2.includes(id))).toHaveLength(0);
  });

  // API-24 — AC-14's other half: changing the sort actually reorders by the
  // selected field. API-09 only proved the tie-break was stable.
  it("orders by the field named in the sort parameter (AC-14)", async () => {
    const { agent: sorterAgent, user: sorter } = await createAndLoginUser({ role: "REQUESTER" });
    const oldest = new Date("2026-01-01T00:00:00.000Z");
    const newest = new Date("2026-06-01T00:00:00.000Z");
    await makeTicket(sorter.id, { summary: "Oldest sort fixture", createdAt: oldest });
    await makeTicket(sorter.id, { summary: "Newest sort fixture", createdAt: newest });

    const desc = await sorterAgent.get("/api/tickets?sort=createdAt:desc");
    const asc = await sorterAgent.get("/api/tickets?sort=createdAt:asc");

    expect(desc.status).toBe(200);
    expect(asc.status).toBe(200);
    expect(desc.body.data[0].summary).toBe("Newest sort fixture");
    expect(asc.body.data[0].summary).toBe("Oldest sort fixture");
    // and the two orders are genuinely reversed, not coincidentally equal
    expect(asc.body.data.map((t: { id: number }) => t.id)).toEqual(
      [...desc.body.data.map((t: { id: number }) => t.id)].reverse(),
    );
  });

  // API-11
  it("distinguishes the empty-account state from the no-results-for-filter state (AC-11/AC-12)", async () => {
    const { agent: zeroAgent } = await createAndLoginUser({ role: "REQUESTER" });

    const empty = await zeroAgent.get("/api/tickets");
    expect(empty.body.data).toHaveLength(0);
    expect(empty.body.meta.appliedFilters.search).toBeNull();

    const noResults = await agentA.get("/api/tickets?search=definitely-not-a-real-match-xyz");
    expect(noResults.body.data).toHaveLength(0);
    expect(noResults.body.meta.appliedFilters.search).toBe("definitely-not-a-real-match-xyz");
  });

  // Adapted from Lab 2's "inactive Requester -> 403" (see create-ticket
  // test's equivalent case for the full rationale).
  it("rejects a request whose session belongs to a since-deactivated user (401)", async () => {
    const { agent: staleAgent, user } = await createAndLoginUser({ role: "REQUESTER" });
    await getPrisma().user.update({ where: { id: user.id }, data: { isActive: false } });
    const res = await staleAgent.get("/api/tickets");
    expect(res.status).toBe(401);
  });

  it("rejects a request with no session cookie, even with a legacy X-Dev-Requester-Id header, with 401", async () => {
    const res = await request(app).get("/api/tickets").set("X-Dev-Requester-Id", String(requesterA));
    expect(res.status).toBe(401);
  });

  it("defaults to createdAt:desc sort and pageSize 10 when no query params are given", async () => {
    const res = await agentA.get("/api/tickets");
    expect(res.status).toBe(200);
    expect(res.body.meta.sort).toBe("createdAt:desc");
    expect(res.body.meta.pageSize).toBe(10);
  });

  it("rejects an IT Staff session with 403 FORBIDDEN", async () => {
    const { agent: staffAgent } = await createAndLoginUser({ role: "IT_STAFF" });
    const res = await staffAgent.get("/api/tickets");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("FORBIDDEN");
  });
});
