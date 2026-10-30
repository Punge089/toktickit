import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { Lab4Fixtures, setUpLab4Fixtures } from "../helpers/lab4.js";

// docs/lab-04/tests.md SDASH-06 - specification.md BR-27, BR-33, AC-30, FR-16. A performance smoke
// test, not a benchmark: with about 3000 Tickets and 2000 Actions in the database, each dashboard
// endpoint answers within one second, runs a small fixed number of queries, and returns a response
// whose size does not depend on how many Tickets exist.
const TICKETS = 3000;
const ACTIONS = 2000;
const LIMIT_MS = 1000;
const MAX_QUERIES = 12;
const PREFIX = "TKT-PERF-";

describe("Dashboard performance smoke", () => {
  let f: Lab4Fixtures;
  let queries = 0;

  beforeAll(async () => {
    f = await setUpLab4Fixtures("Perf");
    const prisma = getPrisma();
    prisma.$use(async (params, next) => {
      queries += 1;
      return next(params);
    });

    const statuses = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"] as const;
    const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
    await prisma.ticket.createMany({
      data: Array.from({ length: TICKETS }, (_, i) => ({
        ticketNumber: `${PREFIX}${String(i).padStart(6, "0")}`,
        requesterId: f.requester.user.id,
        categoryId: f.categoryId,
        relatedSystemId: f.relatedSystemId,
        summary: `Perf ticket ${i}`,
        description: "Generated for the dashboard performance smoke test.",
        requestedPriority: priorities[i % 4],
        itPriority: priorities[(i + 1) % 4],
        currentStatus: statuses[i % 8],
        ownerId: i % 5 === 0 ? null : f.staff.user.id,
      })),
    });
    const perf = await prisma.ticket.findMany({ where: { ticketNumber: { startsWith: PREFIX } }, select: { id: true }, take: ACTIONS });
    await prisma.actionTaken.createMany({
      data: perf.map((t, i) => ({
        ticketId: t.id,
        actionAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000),
        description: `Perf action ${i}`,
        performedById: f.staff.user.id,
        assigneeId: f.staff.user.id,
        actionStatus: (i % 2 === 0 ? "PLANNED" : "COMPLETED") as "PLANNED" | "COMPLETED",
        result: i % 2 === 0 ? null : "ok",
        clientRequestId: `perf-${i}`,
      })),
    });
  }, 120_000);

  afterAll(async () => {
    const prisma = getPrisma();
    const ids = (await prisma.ticket.findMany({ where: { ticketNumber: { startsWith: PREFIX } }, select: { id: true } })).map((t) => t.id);
    await prisma.actionTaken.deleteMany({ where: { ticketId: { in: ids } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ids } } });
  }, 120_000);

  async function timed(get: () => Promise<{ status: number; text: string }>) {
    await get(); // the first call warms the connection pool and the query plans
    queries = 0;
    const started = performance.now();
    const res = await get();
    return { ms: performance.now() - started, status: res.status, size: res.text.length, queries };
  }

  it("SDASH-06: the IT Staff, Administrator and Requester dashboards each answer within 1000 ms with a bounded number of queries", async () => {
    const seeded = await getPrisma().ticket.count({ where: { ticketNumber: { startsWith: PREFIX } } });
    expect(seeded).toBe(TICKETS);

    const runs = {
      staff: await timed(() => f.staff.agent.get("/api/dashboard/staff")),
      admin: await timed(() => f.admin.agent.get("/api/dashboard/staff")),
      requester: await timed(() => f.requester.agent.get("/api/dashboard/requester")),
    };
    console.info("dashboard timings (ms, queries, bytes):", Object.fromEntries(Object.entries(runs).map(([k, r]) => [k, [Math.round(r.ms), r.queries, r.size]])));
    for (const [name, r] of Object.entries(runs)) {
      expect(r.status, name).toBe(200);
      expect(r.ms, `${name} took ${r.ms.toFixed(0)} ms`).toBeLessThan(LIMIT_MS);
      expect(r.queries, `${name} ran ${r.queries} queries`).toBeLessThanOrEqual(MAX_QUERIES);
      expect(r.size, `${name} response size`).toBeLessThan(20_000); // counts and 5-row lists only (BR-33)
    }
  }, 120_000);
});
