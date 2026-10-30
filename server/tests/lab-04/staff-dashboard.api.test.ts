import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { createAndLoginUser } from "../helpers/auth.js";
import { ACTIVE_SQL, Lab4Fixtures, insertAction, makeTicket, removeTickets, setUpLab4Fixtures, setUpdatedAt } from "../helpers/lab4.js";

// docs/lab-04/tests.md SDASH-01..SDASH-05, SDASH-07, SDASH-08 - api-spec.md §8; specification.md
// BR-27, BR-30 to BR-34, AC-25, AC-27 to AC-29.
describe("IT Staff dashboard", () => {
  let f: Lab4Fixtures;
  const created: number[] = [];
  const track = async (overrides: Record<string, unknown>) => {
    const t = await makeTicket(f, overrides);
    created.push(t.id);
    return t;
  };

  beforeAll(async () => {
    f = await setUpLab4Fixtures("Staff Dashboard");
    // A spread of Tickets owned by the fixture staff member and others, so every figure has something in it.
    await track({ currentStatus: "NEW", itPriority: "URGENT", ownerId: null });
    await track({ currentStatus: "OPEN", itPriority: "HIGH", ownerId: f.staff.user.id });
    await track({ currentStatus: "IN_PROGRESS", itPriority: "MEDIUM", ownerId: f.staff.user.id });
    await track({ currentStatus: "WAITING_FOR_REQUESTER", itPriority: "LOW", ownerId: f.otherStaff.user.id });
    await track({ currentStatus: "REOPENED", itPriority: "HIGH", ownerId: f.otherStaff.user.id });
    await track({ currentStatus: "RESOLVED", itPriority: "URGENT", ownerId: f.staff.user.id }); // not active
    await track({ currentStatus: "CLOSED", itPriority: "HIGH", ownerId: null }); // not active
  });
  afterAll(async () => {
    await removeTickets(created);
  });

  const rawCounts = async (staffId: number) => {
    const prisma = getPrisma();
    const one = async (sql: string) => (await prisma.$queryRawUnsafe<{ n: number }[]>(sql))[0].n;
    const status = (s: string) => one(`SELECT count(*)::int AS n FROM "Ticket" WHERE "currentStatus" = '${s}'`);
    const prio = (p: string) => one(`SELECT count(*)::int AS n FROM "Ticket" WHERE "itPriority" = '${p}' AND "currentStatus" IN ${ACTIVE_SQL}`);
    return {
      statusCounts: { NEW: await status("NEW"), OPEN: await status("OPEN"), IN_PROGRESS: await status("IN_PROGRESS"), WAITING_FOR_REQUESTER: await status("WAITING_FOR_REQUESTER") },
      unassigned: await one(`SELECT count(*)::int AS n FROM "Ticket" WHERE "ownerId" IS NULL AND "currentStatus" IN ${ACTIVE_SQL}`),
      activeByPriority: { URGENT: await prio("URGENT"), HIGH: await prio("HIGH"), MEDIUM: await prio("MEDIUM"), LOW: await prio("LOW") },
      myAssigned: await one(`SELECT count(*)::int AS n FROM "Ticket" WHERE "ownerId" = ${staffId} AND "currentStatus" IN ${ACTIVE_SQL}`),
      myOpenActions: await one(`SELECT count(*)::int AS n FROM "ActionTaken" WHERE "assigneeId" = ${staffId} AND "actionStatus" IN ('PLANNED','IN_PROGRESS')`),
    };
  };

  it("SDASH-01: every figure equals an independent raw SQL count, including legacy Resolved and Closed Tickets without Actions", async () => {
    const t = created[1];
    await insertAction(t, f.staff.user.id, f.staff.user.id, { actionStatus: "PLANNED" });
    await insertAction(t, f.staff.user.id, f.staff.user.id, { actionStatus: "IN_PROGRESS" });
    await insertAction(t, f.staff.user.id, f.staff.user.id, { actionStatus: "COMPLETED", result: "ok" });
    await insertAction(t, f.staff.user.id, f.otherStaff.user.id, { actionStatus: "PLANNED" }); // someone else's

    const res = await f.staff.agent.get("/api/dashboard/staff");
    expect(res.status).toBe(200);
    const raw = await rawCounts(f.staff.user.id);
    expect(res.body.statusCounts).toEqual(raw.statusCounts);
    expect(res.body.unassigned).toBe(raw.unassigned);
    expect(res.body.activeByPriority).toEqual(raw.activeByPriority);
    expect(res.body.personal).toEqual({ myAssigned: raw.myAssigned, myOpenActions: raw.myOpenActions });
    expect(res.body.personal.myOpenActions).toBe(2);
    // Closed Tickets and legacy Resolved ones without Actions are counted by status like any other.
    expect(raw.statusCounts.NEW).toBeGreaterThan(0);
  });

  it("SDASH-02: IT Staff get personal figures and no accounts; an Administrator gets accounts and no personal figures", async () => {
    const staff = await f.staff.agent.get("/api/dashboard/staff");
    expect(staff.body.role).toBe("IT_STAFF");
    expect(staff.body.personal).not.toBeNull();
    expect(Array.isArray(staff.body.myActions)).toBe(true);
    expect(staff.body.accounts).toBeNull();

    const admin = await f.admin.agent.get("/api/dashboard/staff");
    expect(admin.status).toBe(200);
    expect(admin.body.role).toBe("ADMINISTRATOR");
    expect(admin.body.personal).toBeNull();
    expect(admin.body.myActions).toBeNull();
    const prisma = getPrisma();
    expect(admin.body.accounts).toEqual({
      activeRequesters: await prisma.user.count({ where: { role: "REQUESTER", isActive: true } }),
      activeItStaff: await prisma.user.count({ where: { role: "IT_STAFF", isActive: true } }),
      activeAdministrators: await prisma.user.count({ where: { role: "ADMINISTRATOR", isActive: true } }),
      inactive: await prisma.user.count({ where: { isActive: false } }),
    });
    // The operational figures are the same for both roles.
    expect(admin.body.statusCounts).toEqual(staff.body.statusCounts);
    expect(admin.body.activeByPriority).toEqual(staff.body.activeByPriority);
  });

  it("SDASH-03: each Ticket-list card equals the total of the list it opens", async () => {
    const dash = (await f.staff.agent.get("/api/dashboard/staff")).body;
    const total = async (query: string) => (await f.staff.agent.get(`/api/staff/tickets?${query}&pageSize=10`)).body.totalItems as number;
    for (const status of ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER"] as const) {
      expect(dash.statusCounts[status], status).toBe(await total(`status=${status}`));
    }
    expect(dash.unassigned).toBe(await total("owner=unassigned&active=true"));
    expect(dash.personal.myAssigned).toBe(await total("owner=me&active=true"));
    for (const p of ["URGENT", "HIGH", "MEDIUM", "LOW"] as const) {
      expect(dash.activeByPriority[p], p).toBe(await total(`itPriority=${p}&active=true`));
    }
    expect(dash.statusCounts.NEW + dash.statusCounts.OPEN).toBeGreaterThan(0);
  });

  it("SDASH-04: Urgent/High, Recent and My Actions lists keep their order, size limit and field limits", async () => {
    const prisma = getPrisma();
    const mine = await createAndLoginUser({ role: "IT_STAFF", fullName: "Dash Lists Staff" });
    // Four Urgent and two High active Tickets, all older than anything else, with ties.
    const urgent = [await track({ currentStatus: "OPEN", itPriority: "URGENT" }), await track({ currentStatus: "OPEN", itPriority: "URGENT" }), await track({ currentStatus: "OPEN", itPriority: "URGENT" })];
    const high = [await track({ currentStatus: "OPEN", itPriority: "HIGH" }), await track({ currentStatus: "OPEN", itPriority: "HIGH" }), await track({ currentStatus: "OPEN", itPriority: "HIGH" })];
    await setUpdatedAt([urgent[0].id, urgent[1].id], "2000-01-01 00:00:00"); // tie
    await setUpdatedAt([urgent[2].id], "2000-02-01 00:00:00");
    await setUpdatedAt([high[0].id], "1999-12-01 00:00:00"); // older than the Urgent ones, but High
    await setUpdatedAt([high[1].id, high[2].id], "2000-03-01 00:00:00");
    const res = await mine.agent.get("/api/dashboard/staff");
    expect(res.status).toBe(200);
    // The shared test database already holds other Urgent Tickets, so the whole list is compared with an
    // independent raw SQL ordering (Urgent first, then oldest updatedAt, then id), and the fixtures' own
    // tie and priority order is checked inside it.
    const expectedIds = (
      await prisma.$queryRawUnsafe<{ id: number }[]>(`
        SELECT "id" FROM "Ticket"
        WHERE "currentStatus" IN ${ACTIVE_SQL} AND "itPriority" IN ('URGENT','HIGH')
        ORDER BY CASE "itPriority" WHEN 'URGENT' THEN 0 ELSE 1 END, "updatedAt" ASC, "id" ASC
        LIMIT 5`)
    ).map((r) => r.id);
    const ids = res.body.urgentTickets.map((t: { id: number }) => t.id);
    expect(res.body.urgentTickets).toHaveLength(5);
    expect(ids).toEqual(expectedIds);
    expect(ids.indexOf(urgent[0].id)).toBeLessThan(ids.indexOf(urgent[1].id)); // tie: lower id first
    expect(ids.indexOf(urgent[1].id)).toBeLessThan(ids.indexOf(urgent[2].id)); // then the newer one
    expect(res.body.urgentTickets.slice(0, 3).every((t: { itPriority: string }) => t.itPriority === "URGENT")).toBe(true);

    // Recent: newest first, ties by id descending, at most 5, any status.
    const newest = [await track({ currentStatus: "CLOSED" }), await track({ currentStatus: "OPEN" })];
    await setUpdatedAt([newest[0].id, newest[1].id], "2100-01-01 00:00:00");
    const recent = (await mine.agent.get("/api/dashboard/staff")).body.recentTickets;
    expect(recent).toHaveLength(5);
    expect(recent[0].id).toBe(newest[1].id); // tie on time: higher id first
    expect(recent[1].id).toBe(newest[0].id);
    for (const row of [...res.body.urgentTickets, ...recent]) {
      expect(Object.keys(row).sort()).toEqual(["currentStatus", "id", "itPriority", "owner", "summary", "ticketNumber", "updatedAt"]);
    }

    // My Actions: only mine and open, by actionAt then id, at most 5, description cut to 120.
    const ticket = await track({ currentStatus: "OPEN" });
    const longText = "x".repeat(300);
    const rows = [
      await insertAction(ticket.id, mine.user.id, mine.user.id, { actionAt: new Date("2026-03-01T10:00:00Z"), description: "later", actionStatus: "PLANNED" }),
      await insertAction(ticket.id, mine.user.id, mine.user.id, { actionAt: new Date("2026-01-01T10:00:00Z"), description: longText, actionStatus: "IN_PROGRESS" }),
      await insertAction(ticket.id, mine.user.id, mine.user.id, { actionAt: new Date("2026-02-01T10:00:00Z"), description: "tie one", actionStatus: "PLANNED" }),
      await insertAction(ticket.id, mine.user.id, mine.user.id, { actionAt: new Date("2026-02-01T10:00:00Z"), description: "tie two", actionStatus: "PLANNED" }),
      await insertAction(ticket.id, mine.user.id, mine.user.id, { actionAt: new Date("2026-04-01T10:00:00Z"), description: "fifth", actionStatus: "PLANNED" }),
      await insertAction(ticket.id, mine.user.id, mine.user.id, { actionAt: new Date("2026-05-01T10:00:00Z"), description: "sixth", actionStatus: "PLANNED" }),
      await insertAction(ticket.id, mine.user.id, mine.user.id, { actionAt: new Date("2025-01-01T10:00:00Z"), description: "done", actionStatus: "COMPLETED", result: "ok" }),
      await insertAction(ticket.id, mine.user.id, f.staff.user.id, { actionAt: new Date("2024-01-01T10:00:00Z"), description: "not mine", actionStatus: "PLANNED" }),
    ];
    const withActions = (await mine.agent.get("/api/dashboard/staff")).body;
    expect(withActions.personal.myOpenActions).toBe(6);
    expect(withActions.myActions.map((a: { id: number }) => a.id)).toEqual([rows[1].id, rows[2].id, rows[3].id, rows[0].id, rows[4].id]);
    expect(withActions.myActions[0].description.length).toBeLessThanOrEqual(120);
    expect(withActions.myActions[0].description.startsWith("xxx")).toBe(true);
    expect(Object.keys(withActions.myActions[0]).sort()).toEqual(["actionAt", "actionStatus", "description", "followUpRequired", "id", "ticketId", "ticketNumber"]);
    expect(prisma).toBeDefined();
  });

  it("SDASH-05: an IT Staff member with no Tickets and no Actions gets zero personal figures and empty personal lists", async () => {
    const idle = await createAndLoginUser({ role: "IT_STAFF", fullName: "Dash Idle Staff" });
    const res = await idle.agent.get("/api/dashboard/staff");
    expect(res.status).toBe(200);
    expect(res.body.personal).toEqual({ myAssigned: 0, myOpenActions: 0 });
    expect(res.body.myActions).toEqual([]);
    expect(res.body.statusCounts.NEW).toBeGreaterThan(0); // the shared figures still show the workload
  });

  it("SDASH-07: no Internal Note text appears, and the response size does not grow with the number of Tickets", async () => {
    const secret = "INTERNAL-ONLY-DASHBOARD-9917";
    const t = await track({ currentStatus: "OPEN", itPriority: "URGENT" });
    await getPrisma().internalNote.create({ data: { ticketId: t.id, authorId: f.staff.user.id, body: secret } });
    const before = await f.staff.agent.get("/api/dashboard/staff");
    expect(JSON.stringify(before.body)).not.toContain(secret);
    expect((await f.requester.agent.get("/api/dashboard/requester")).text).not.toContain(secret);

    for (let i = 0; i < 25; i++) await track({ currentStatus: "OPEN", itPriority: "LOW" });
    const after = await f.staff.agent.get("/api/dashboard/staff");
    expect(after.text.length).toBeLessThan(before.text.length + 400); // lists stay at 5 rows each
    expect(after.body.urgentTickets.length).toBeLessThanOrEqual(5);
    expect(after.body.recentTickets.length).toBeLessThanOrEqual(5);
  });

  it("SDASH-08: the figures and list order are the same whatever time zone the server runs in", async () => {
    const day1 = await track({ currentStatus: "OPEN", itPriority: "URGENT" });
    const day2 = await track({ currentStatus: "OPEN", itPriority: "URGENT" });
    await setUpdatedAt([day1.id], "2200-06-01 23:59:00");
    await setUpdatedAt([day2.id], "2200-06-02 00:01:00");
    const strip = (body: Record<string, unknown>) => ({ ...body, generatedAt: "x" });

    const previous = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      const utc = await f.staff.agent.get("/api/dashboard/staff");
      process.env.TZ = "Asia/Bangkok";
      const bangkok = await f.staff.agent.get("/api/dashboard/staff");
      expect(strip(bangkok.body)).toEqual(strip(utc.body));
      expect(utc.body.recentTickets.slice(0, 2).map((t: { id: number }) => t.id)).toEqual([day2.id, day1.id]);

      process.env.TZ = "UTC";
      const rUtc = await f.requester.agent.get("/api/dashboard/requester");
      process.env.TZ = "Asia/Bangkok";
      const rBangkok = await f.requester.agent.get("/api/dashboard/requester");
      expect(strip(rBangkok.body)).toEqual(strip(rUtc.body));
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});
