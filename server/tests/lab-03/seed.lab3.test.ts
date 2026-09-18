import { describe, it, expect } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { seedAll } from "../../prisma/seed.js";

// docs/lab-03/tests.md MIG-03, MIG-04 — specification.md §7 Seed (labsheet
// §5.3). Complements server/tests/lab-02/seed.unit.test.ts (categories/
// related systems/idempotency), which still passes unchanged.
describe("Lab 3 seed data", () => {
  it("running seedAll() twice does not change row counts (idempotent)", async () => {
    await seedAll();
    const prisma = getPrisma();
    const before = {
      users: await prisma.user.count(),
      tickets: await prisma.ticket.count(),
      comments: await prisma.publicComment.count(),
      notes: await prisma.internalNote.count(),
    };

    await seedAll();
    const after = {
      users: await prisma.user.count(),
      tickets: await prisma.ticket.count(),
      comments: await prisma.publicComment.count(),
      notes: await prisma.internalNote.count(),
    };

    expect(after).toEqual(before);
  });

  it("seeds at least 4 active + 1 inactive Requester, 3 active + 1 inactive IT Staff, and 1 active Administrator", async () => {
    await seedAll();
    const prisma = getPrisma();

    const activeRequesters = await prisma.user.count({ where: { role: "REQUESTER", isActive: true } });
    const inactiveRequesters = await prisma.user.count({ where: { role: "REQUESTER", isActive: false } });
    const activeStaff = await prisma.user.count({ where: { role: "IT_STAFF", isActive: true } });
    const inactiveStaff = await prisma.user.count({ where: { role: "IT_STAFF", isActive: false } });
    const activeAdmins = await prisma.user.count({ where: { role: "ADMINISTRATOR", isActive: true } });

    expect(activeRequesters).toBeGreaterThanOrEqual(4);
    expect(inactiveRequesters).toBeGreaterThanOrEqual(1);
    expect(activeStaff).toBeGreaterThanOrEqual(3);
    expect(inactiveStaff).toBeGreaterThanOrEqual(1);
    expect(activeAdmins).toBeGreaterThanOrEqual(1);
  });

  it("seeds a user who must change their password at next login", async () => {
    await seedAll();
    const firstLoginUser = await getPrisma().user.findFirst({ where: { mustChangePassword: true } });
    expect(firstLoginUser).not.toBeNull();
  });

  it("seeds Tickets covering all 8 statuses, with both assigned and unassigned ownership", async () => {
    await seedAll();
    const prisma = getPrisma();

    const statuses = [
      "NEW",
      "OPEN",
      "IN_PROGRESS",
      "WAITING_FOR_REQUESTER",
      "RESOLVED",
      "CLOSED",
      "REOPENED",
      "CANCELLED",
    ] as const;

    for (const status of statuses) {
      const count = await prisma.ticket.count({ where: { currentStatus: status } });
      expect(count, `expected at least one seeded Ticket with status ${status}`).toBeGreaterThan(0);
    }

    const assigned = await prisma.ticket.count({ where: { ownerId: { not: null } } });
    const unassigned = await prisma.ticket.count({ where: { ownerId: null } });
    expect(assigned).toBeGreaterThan(0);
    expect(unassigned).toBeGreaterThan(0);

    const totalTickets = await prisma.ticket.count();
    expect(totalTickets).toBeGreaterThan(10); // enough to exercise pagination
  });

  it("gives every RESOLVED or CLOSED seeded Ticket a Resolution Summary", async () => {
    await seedAll();
    const resolvedOrClosed = await getPrisma().ticket.findMany({
      where: { currentStatus: { in: ["RESOLVED", "CLOSED"] } },
    });
    expect(resolvedOrClosed.length).toBeGreaterThan(0);
    for (const ticket of resolvedOrClosed) {
      expect(ticket.resolutionSummary, `Ticket ${ticket.ticketNumber} should have a resolution summary`).toBeTruthy();
    }
  });

  it("creates example Public Comments and Internal Notes containing no obviously sensitive data", async () => {
    await seedAll();
    const prisma = getPrisma();
    const comments = await prisma.publicComment.findMany();
    const notes = await prisma.internalNote.findMany();

    expect(comments.length).toBeGreaterThan(0);
    expect(notes.length).toBeGreaterThan(0);

    const sensitivePattern = /password|secret|ssn|credit card/i;
    for (const c of [...comments, ...notes]) {
      expect(sensitivePattern.test(c.body)).toBe(false);
    }
  });
});
