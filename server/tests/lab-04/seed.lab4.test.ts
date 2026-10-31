import { describe, it, expect } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { seedAll } from "../../prisma/seed.js";

// docs/lab-04/tests.md MIG-03, MIG-04 - specification.md §7 Seed.
describe("Lab 4 seed data", () => {
  it("MIG-03: running seedAll() twice changes no row count and creates no duplicate Action", async () => {
    await seedAll();
    const prisma = getPrisma();
    const count = async () => ({
      users: await prisma.user.count(),
      tickets: await prisma.ticket.count(),
      actions: await prisma.actionTaken.count(),
      comments: await prisma.publicComment.count(),
      notes: await prisma.internalNote.count(),
    });
    const before = await count();
    expect(before.actions).toBeGreaterThan(0);

    await seedAll();
    expect(await count()).toEqual(before);

    const keys = await prisma.actionTaken.groupBy({ by: ["ticketId", "clientRequestId"], _count: true });
    expect(keys.every((k) => k._count === 1)).toBe(true);
  });

  it("MIG-03: re-seeding converges an edited seed Action back to its canonical state", async () => {
    await seedAll();
    const prisma = getPrisma();
    const row = await prisma.actionTaken.findFirstOrThrow({ where: { clientRequestId: "seed-TKT-2024-000103-2" } });
    await prisma.actionTaken.update({ where: { id: row.id }, data: { description: "Edited by a test", version: 7 } });
    await seedAll();
    const restored = await prisma.actionTaken.findUniqueOrThrow({ where: { id: row.id } });
    expect(restored).toMatchObject({ id: row.id, description: row.description, version: 1 });
  });

  it("MIG-04: covers all 8 statuses and Tickets with zero, one and several Actions", async () => {
    await seedAll();
    const prisma = getPrisma();

    for (const status of ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"] as const) {
      expect(await prisma.ticket.count({ where: { currentStatus: status } }), status).toBeGreaterThan(0);
    }

    const seeded = await prisma.ticket.findMany({
      where: { ticketNumber: { startsWith: "TKT-2024-" } },
      select: { ticketNumber: true, currentStatus: true, _count: { select: { actions: true } } },
    });
    const counts = seeded.map((t) => t._count.actions);
    expect(counts.some((c) => c === 0)).toBe(true);
    expect(counts.some((c) => c === 1)).toBe(true);
    const several = await prisma.ticket.findFirstOrThrow({
      where: { ticketNumber: "TKT-2024-000103" },
      include: { actions: true },
    });
    expect(several.actions.length).toBeGreaterThanOrEqual(3);
    expect(new Set(several.actions.map((a) => a.actionStatus)).size).toBe(3);
  });

  it("MIG-04: has a Resolved Ticket with a Completed Action and a legacy Resolved Ticket with none", async () => {
    await seedAll();
    const prisma = getPrisma();
    const resolved = await prisma.ticket.findMany({
      where: { currentStatus: "RESOLVED", ticketNumber: { startsWith: "TKT-2024-" } },
      include: { actions: true },
    });
    expect(resolved.some((t) => t.actions.some((a) => a.actionStatus === "COMPLETED"))).toBe(true);
    expect(resolved.some((t) => t.actions.length === 0)).toBe(true);
  });

  it("MIG-04: assigns open Actions to at least two IT Staff, with one staff user and one Requester at zero", async () => {
    await seedAll();
    const prisma = getPrisma();

    const open = await prisma.actionTaken.findMany({
      where: { actionStatus: { in: ["PLANNED", "IN_PROGRESS"] }, ticket: { ticketNumber: { startsWith: "TKT-2024-" } } },
      select: { assigneeId: true },
    });
    expect(new Set(open.map((a) => a.assigneeId)).size).toBeGreaterThanOrEqual(2);

    const idleStaff = await prisma.user.findMany({
      where: {
        role: "IT_STAFF",
        isActive: true,
        ownedTickets: { none: {} },
        assignedActions: { none: {} },
        performedActions: { none: {} },
        email: { endsWith: "@example.dev" },
      },
    });
    expect(idleStaff.length).toBeGreaterThanOrEqual(1);

    const requesterWithoutTickets = await prisma.user.findFirst({
      where: { role: "REQUESTER", isActive: true, tickets: { none: {} }, email: { endsWith: "@example.dev" } },
    });
    expect(requesterWithoutTickets).not.toBeNull();
  });

  it("MIG-04: every seeded Action meets the field rules (assignee is IT Staff, final Actions have a Result)", async () => {
    await seedAll();
    const rows = await getPrisma().actionTaken.findMany({
      where: { clientRequestId: { startsWith: "seed-" } },
      include: { assignee: true },
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const a of rows) {
      expect(a.assignee.role, a.clientRequestId).toBe("IT_STAFF");
      if (a.actionStatus === "COMPLETED" || a.actionStatus === "CANCELLED") expect(a.result, a.clientRequestId).toBeTruthy();
      if (a.followUpRequired) expect(a.followUpNote, a.clientRequestId).toBeTruthy();
    }
  });
});
