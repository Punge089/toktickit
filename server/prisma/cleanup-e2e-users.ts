import { PrismaClient } from "@prisma/client";

// Removes the throwaway accounts the E2E suites create through the
// Administrator API (email `e2e.*@example.dev`). Run by e2e/global-setup.ts
// before each suite so User Management screenshots and lists stay readable.
// These accounts never own Tickets, Comments or Notes; their sessions are
// deleted with them (Session.userId is ON DELETE CASCADE). The Lab 4 specs do
// assign them Actions Taken (an inactive-assignee check), and an Action
// restricts deleting its users, so those throwaway Actions go first.
const prisma = new PrismaClient();
const where = { email: { startsWith: "e2e.", endsWith: "@example.dev" } };
const ids = (await prisma.user.findMany({ where, select: { id: true } })).map((u) => u.id);
const actions = await prisma.actionTaken.deleteMany({
  where: { OR: [{ performedById: { in: ids } }, { assigneeId: { in: ids } }] },
});
const result = await prisma.user.deleteMany({ where });
console.log(`Removed ${result.count} leftover E2E user(s) and ${actions.count} of their Action(s).`);
await prisma.$disconnect();
