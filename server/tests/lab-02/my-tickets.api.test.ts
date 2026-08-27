import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { seedAll } from "../../prisma/seed.js";

// api-spec.md §5, specification.md BR-09, BR-11..BR-13, AC-10..AC-14.
describe("GET /api/tickets", () => {
  let requesterA: number;
  let requesterB: number;
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
        ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
      },
    });
  }

  beforeAll(async () => {
    await seedAll();
    const prisma = getPrisma();
    const requesters = await prisma.requesterUser.findMany({ where: { isActive: true }, take: 2 });
    requesterA = requesters[0].id;
    requesterB = requesters[1].id;
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
    categoryId = category.id;
    relatedSystemId = relatedSystem.id;
  });

  // API-07
  it("scopes results to the requesting Requester only (BR-09)", async () => {
    const uniqueSummary = `Requester A only ${Date.now()}`;
    await makeTicket(requesterA, { summary: uniqueSummary });

    const resA = await request(app)
      .get("/api/tickets?pageSize=50")
      .set("X-Dev-Requester-Id", String(requesterA));
    expect(resA.body.data.some((t: { summary: string }) => t.summary === uniqueSummary)).toBe(true);

    const resB = await request(app)
      .get("/api/tickets?pageSize=50")
      .set("X-Dev-Requester-Id", String(requesterB));
    expect(resB.body.data.some((t: { summary: string }) => t.summary === uniqueSummary)).toBe(false);
  });

  // API-08
  it("search matches both ticketNumber and summary (BR-11)", async () => {
    const marker = `Marker${Date.now()}`;
    const ticket = await makeTicket(requesterA, { summary: `Something with ${marker} inside` });

    const bySummary = await request(app)
      .get(`/api/tickets?search=${marker}`)
      .set("X-Dev-Requester-Id", String(requesterA));
    expect(bySummary.body.data.some((t: { id: number }) => t.id === ticket.id)).toBe(true);

    const byNumber = await request(app)
      .get(`/api/tickets?search=${ticket.ticketNumber}`)
      .set("X-Dev-Requester-Id", String(requesterA));
    expect(byNumber.body.data.some((t: { id: number }) => t.id === ticket.id)).toBe(true);

    const noMatch = await request(app)
      .get("/api/tickets?search=zzz-definitely-no-match-zzz")
      .set("X-Dev-Requester-Id", String(requesterA));
    expect(noMatch.body.data).toHaveLength(0);
  });

  // API-09
  it("keeps paginated order stable via the secondary id:desc sort when createdAt ties (BR-12)", async () => {
    const tieTime = new Date("2026-01-01T00:00:00.000Z");
    await makeTicket(requesterA, { createdAt: tieTime });
    await makeTicket(requesterA, { createdAt: tieTime });

    const res1 = await request(app)
      .get("/api/tickets?sort=createdAt:desc&pageSize=50")
      .set("X-Dev-Requester-Id", String(requesterA));
    const res2 = await request(app)
      .get("/api/tickets?sort=createdAt:desc&pageSize=50")
      .set("X-Dev-Requester-Id", String(requesterA));

    expect(res1.body.data.map((t: { id: number }) => t.id)).toEqual(
      res2.body.data.map((t: { id: number }) => t.id),
    );
  });

  // API-10
  it("rejects an invalid pageSize and an out-of-range page with 400, naming the field (BR-13)", async () => {
    const badPageSize = await request(app)
      .get("/api/tickets?pageSize=7")
      .set("X-Dev-Requester-Id", String(requesterA));
    expect(badPageSize.status).toBe(400);
    expect(badPageSize.body.fieldErrors).toHaveProperty("pageSize");

    const badPage = await request(app)
      .get("/api/tickets?page=999")
      .set("X-Dev-Requester-Id", String(requesterA));
    expect(badPage.status).toBe(400);
    expect(badPage.body.fieldErrors).toHaveProperty("page");
  });

  // API-11
  it("distinguishes the empty-account state from the no-results-for-filter state (AC-11/AC-12)", async () => {
    const zeroTicketRequester = await getPrisma().requesterUser.create({
      data: {
        fullName: `Zero Ticket Requester ${Date.now()}`,
        email: `zero-ticket-${Date.now()}@example.dev`,
        isActive: true,
      },
    });

    const empty = await request(app)
      .get("/api/tickets")
      .set("X-Dev-Requester-Id", String(zeroTicketRequester.id));
    expect(empty.body.data).toHaveLength(0);
    expect(empty.body.meta.appliedFilters.search).toBeNull();

    const noResults = await request(app)
      .get("/api/tickets?search=definitely-not-a-real-match-xyz")
      .set("X-Dev-Requester-Id", String(requesterA));
    expect(noResults.body.data).toHaveLength(0);
    expect(noResults.body.meta.appliedFilters.search).toBe("definitely-not-a-real-match-xyz");
  });

  it("rejects an inactive Requester with 403", async () => {
    const inactive = await getPrisma().requesterUser.findFirstOrThrow({ where: { isActive: false } });
    const res = await request(app).get("/api/tickets").set("X-Dev-Requester-Id", String(inactive.id));
    expect(res.status).toBe(403);
  });

  it("defaults to createdAt:desc sort and pageSize 10 when no query params are given", async () => {
    const res = await request(app).get("/api/tickets").set("X-Dev-Requester-Id", String(requesterA));
    expect(res.status).toBe(200);
    expect(res.body.meta.sort).toBe("createdAt:desc");
    expect(res.body.meta.pageSize).toBe(10);
  });
});
