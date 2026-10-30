import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { createAndLoginUser, loginAgent } from "../helpers/auth.js";
import { ACTIVE_SQL, Lab4Fixtures, makeTicket, removeTickets, setUpLab4Fixtures, setUpdatedAt } from "../helpers/lab4.js";

// docs/lab-04/tests.md RDASH-01..RDASH-05 and SEC-06 - api-spec.md §7; specification.md
// BR-27 to BR-29, BR-32, BR-33, AC-02, AC-25 to AC-28.
describe("Requester dashboard", () => {
  let f: Lab4Fixtures;
  const created: number[] = [];
  const track = async (overrides: Record<string, unknown>, who: "own" | "other" = "own") => {
    const t = await makeTicket(f, who === "other" ? { requesterId: f.otherRequester.user.id, ...overrides } : overrides);
    created.push(t.id);
    return t;
  };

  beforeAll(async () => {
    f = await setUpLab4Fixtures("Requester Dashboard");
  });
  afterAll(async () => {
    await removeTickets(created);
  });

  it("RDASH-01: counts only the caller's Tickets, even when other Requesters have many", async () => {
    const me = await createAndLoginUser({ role: "REQUESTER", fullName: "Dash Own" });
    const mine = (status: string) =>
      getPrisma().ticket.create({
        data: {
          ticketNumber: `TKT-TEST-RD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          requesterId: me.user.id,
          categoryId: f.categoryId,
          relatedSystemId: f.relatedSystemId,
          summary: `Own ${status}`,
          description: "A".repeat(30),
          requestedPriority: "LOW",
          itPriority: "LOW",
          currentStatus: status as never,
        },
      });
    const plan = ["NEW", "OPEN", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "WAITING_FOR_REQUESTER", "REOPENED", "RESOLVED", "CLOSED", "CLOSED", "CLOSED", "CANCELLED"];
    for (const s of plan) created.push((await mine(s)).id);
    for (const s of ["OPEN", "OPEN", "OPEN", "RESOLVED", "CLOSED", "WAITING_FOR_REQUESTER"]) await track({ currentStatus: s }, "other");

    const res = await me.agent.get("/api/dashboard/requester");
    expect(res.status).toBe(200);
    expect(res.body.metrics).toEqual({ openTickets: 7, waitingForYou: 2, resolved: 1, closed: 3 }); // Cancelled is in none of them
    expect(res.body.attention.every((t: { summary: string }) => t.summary.startsWith("Own "))).toBe(true);
    expect(res.body.recent.every((t: { summary: string }) => t.summary.startsWith("Own "))).toBe(true);
    expect(typeof res.body.generatedAt).toBe("string");
  });

  it("RDASH-02: lists hold at most 5 rows, in the documented order, with only the documented fields", async () => {
    const me = await createAndLoginUser({ role: "REQUESTER", fullName: "Dash Lists" });
    const ids: number[] = [];
    for (let i = 0; i < 7; i++) {
      const t = await getPrisma().ticket.create({
        data: {
          ticketNumber: `TKT-TEST-RL-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          requesterId: me.user.id,
          categoryId: f.categoryId,
          relatedSystemId: f.relatedSystemId,
          summary: `List ${i}`,
          description: "A".repeat(30),
          requestedPriority: "LOW",
          itPriority: "MEDIUM",
          currentStatus: i < 6 ? "WAITING_FOR_REQUESTER" : "RESOLVED",
        },
      });
      ids.push(t.id);
      created.push(t.id);
    }
    // ids[0] and ids[1] tie on the oldest time, ids[2] and ids[3] tie on a middle time.
    await setUpdatedAt([ids[0], ids[1]], "2026-01-01 10:00:00");
    await setUpdatedAt([ids[2], ids[3]], "2026-02-01 10:00:00");
    await setUpdatedAt([ids[4]], "2026-03-01 10:00:00");
    await setUpdatedAt([ids[5]], "2026-04-01 10:00:00");
    await setUpdatedAt([ids[6]], "2026-05-01 10:00:00"); // a Resolved Ticket: newest, but not "waiting"

    const res = await me.agent.get("/api/dashboard/requester");
    expect(res.status).toBe(200);
    expect(res.body.attention).toHaveLength(5);
    // oldest first, ties by id ascending; the 6th waiting Ticket does not fit
    expect(res.body.attention.map((t: { id: number }) => t.id)).toEqual([ids[0], ids[1], ids[2], ids[3], ids[4]]);
    expect(res.body.recent).toHaveLength(5);
    // newest first, ties by id descending
    expect(res.body.recent.map((t: { id: number }) => t.id)).toEqual([ids[6], ids[5], ids[4], ids[3], ids[2]]);
    for (const row of [...res.body.attention, ...res.body.recent]) {
      expect(Object.keys(row).sort()).toEqual(["currentStatus", "id", "itPriority", "summary", "ticketNumber", "updatedAt"]);
    }
  });

  it("RDASH-03: a Requester with no Tickets gets four zeros and two empty lists", async () => {
    const empty = await createAndLoginUser({ role: "REQUESTER", fullName: "Dash Empty" });
    const res = await empty.agent.get("/api/dashboard/requester");
    expect(res.status).toBe(200);
    expect(res.body.metrics).toEqual({ openTickets: 0, waitingForYou: 0, resolved: 0, closed: 0 });
    expect(res.body.attention).toEqual([]);
    expect(res.body.recent).toEqual([]);
  });

  it("RDASH-04: every metric equals an independent raw SQL count, for a fixture and a seeded Requester", async () => {
    const seeded = await loginAgent("duangjai.phromma@example.dev", process.env.SEED_PASSWORD ?? "TokTick-Dev#2026");
    const seededUser = await getPrisma().user.findUniqueOrThrow({ where: { email: "duangjai.phromma@example.dev" } });
    await track({ currentStatus: "WAITING_FOR_REQUESTER" });
    await track({ currentStatus: "RESOLVED" });

    for (const [agent, userId] of [
      [f.requester.agent, f.requester.user.id],
      [seeded, seededUser.id],
    ] as const) {
      const [row] = await getPrisma().$queryRawUnsafe<{ open: number; waiting: number; resolved: number; closed: number }[]>(`
        SELECT count(*) FILTER (WHERE "currentStatus" IN ${ACTIVE_SQL})::int AS open,
               count(*) FILTER (WHERE "currentStatus" = 'WAITING_FOR_REQUESTER')::int AS waiting,
               count(*) FILTER (WHERE "currentStatus" = 'RESOLVED')::int AS resolved,
               count(*) FILTER (WHERE "currentStatus" = 'CLOSED')::int AS closed
        FROM "Ticket" WHERE "requesterId" = ${userId}`);
      const res = await agent.get("/api/dashboard/requester");
      expect(res.status).toBe(200);
      expect(res.body.metrics).toEqual({ openTickets: row.open, waitingForYou: row.waiting, resolved: row.resolved, closed: row.closed });
      expect(row.open).toBeGreaterThan(0);
    }
  });

  it("RDASH-05: each card equals the total of the list it opens", async () => {
    const seeded = await loginAgent("chai.wongsawat@example.dev", process.env.SEED_PASSWORD ?? "TokTick-Dev#2026");
    for (const agent of [f.requester.agent, seeded]) {
      const dash = await agent.get("/api/dashboard/requester");
      const total = async (query: string) => (await agent.get(`/api/tickets?${query}&pageSize=10`)).body.meta.totalItems as number;
      expect(dash.body.metrics.openTickets).toBe(await total("active=true"));
      expect(dash.body.metrics.waitingForYou).toBe(await total("status=WAITING_FOR_REQUESTER"));
      expect(dash.body.metrics.resolved).toBe(await total("status=RESOLVED"));
      expect(dash.body.metrics.closed).toBe(await total("status=CLOSED"));
    }
  });

  it("SEC-06: a requesterId in the query is ignored, so another Requester's figures never leak", async () => {
    await track({ currentStatus: "OPEN" }, "other");
    const plain = await f.requester.agent.get("/api/dashboard/requester");
    const probe = await f.requester.agent.get(`/api/dashboard/requester?requesterId=${f.otherRequester.user.id}`);
    expect(probe.status).toBe(200);
    expect(probe.body.metrics).toEqual(plain.body.metrics);
    expect(probe.body.recent.map((t: { id: number }) => t.id)).toEqual(plain.body.recent.map((t: { id: number }) => t.id));
  });
});
