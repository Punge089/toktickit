import { randomUUID } from "node:crypto";
import { getPrisma } from "../../src/prisma.js";
import { seedAll } from "../../prisma/seed.js";
import { createAndLoginUser } from "./auth.js";

// Shared fixtures for the Lab 4 server tests (docs/lab-04/tests.md). Every
// test file creates its own users so it never depends on a seeded account
// another file may have changed.
export type Fixture = Awaited<ReturnType<typeof createAndLoginUser>>;

export interface Lab4Fixtures {
  staff: Fixture;
  otherStaff: Fixture;
  admin: Fixture;
  requester: Fixture;
  otherRequester: Fixture;
  categoryId: number;
  relatedSystemId: number;
}

export async function setUpLab4Fixtures(label: string): Promise<Lab4Fixtures> {
  await seedAll();
  const prisma = getPrisma();
  return {
    staff: await createAndLoginUser({ role: "IT_STAFF", fullName: `${label} Staff A` }),
    otherStaff: await createAndLoginUser({ role: "IT_STAFF", fullName: `${label} Staff B` }),
    admin: await createAndLoginUser({ role: "ADMINISTRATOR", fullName: `${label} Admin` }),
    requester: await createAndLoginUser({ role: "REQUESTER", fullName: `${label} Requester` }),
    otherRequester: await createAndLoginUser({ role: "REQUESTER", fullName: `${label} Other Requester` }),
    categoryId: (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id,
    relatedSystemId: (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id,
  };
}

export function makeTicket(f: Lab4Fixtures, overrides: Record<string, unknown> = {}) {
  return getPrisma().ticket.create({
    data: {
      ticketNumber: `TKT-TEST-L4-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      requesterId: f.requester.user.id,
      categoryId: f.categoryId,
      relatedSystemId: f.relatedSystemId,
      summary: "Lab 4 fixture",
      description: "A".repeat(30),
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: "OPEN",
      ...overrides,
    },
  });
}

export function newKey(): string {
  return randomUUID();
}

// A valid create body; callers override only what the test is about.
export function actionBody(assigneeId: number, overrides: Record<string, unknown> = {}) {
  return {
    clientRequestId: newKey(),
    description: "Replaced the laptop battery.",
    assigneeId,
    ...overrides,
  };
}

// Inserts an Action directly, bypassing the API, to arrange a state (for
// example an already Completed Action) that the API itself would not allow.
export function insertAction(
  ticketId: number,
  performedById: number,
  assigneeId: number,
  overrides: Record<string, unknown> = {},
) {
  return getPrisma().actionTaken.create({
    data: {
      ticketId,
      performedById,
      assigneeId,
      actionAt: new Date("2026-10-01T09:00:00.000Z"),
      description: "Fixture action",
      clientRequestId: newKey(),
      ...overrides,
    },
  });
}

// Sets the Ticket's updatedAt directly (the column is maintained by Prisma, so a
// test that needs a known value or a tie writes it with SQL).
export async function setUpdatedAt(ticketIds: number[], iso: string) {
  if (ticketIds.length === 0) return;
  await getPrisma().$executeRawUnsafe(
    `UPDATE "Ticket" SET "updatedAt" = '${iso}'::timestamp WHERE "id" IN (${ticketIds.join(",")})`,
  );
}

// Removes Tickets a test created (and the Actions on them), so a later test file
// does not see them in a shared figure such as the staff dashboard.
export async function removeTickets(ticketIds: number[]) {
  if (ticketIds.length === 0) return;
  const prisma = getPrisma();
  await prisma.actionTaken.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.internalNote.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.publicComment.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
}

export const ACTIVE_SQL = `('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')`;
