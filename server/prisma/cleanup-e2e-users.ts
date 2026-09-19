import { PrismaClient } from "@prisma/client";

// Removes the throwaway accounts the Lab 3 E2E suite creates through the
// Administrator API (email `e2e.*@example.dev`). Run by e2e/global-setup.ts
// before each suite so User Management screenshots and lists stay readable.
// These accounts never own Tickets, Comments or Notes; their sessions are
// deleted with them (Session.userId is ON DELETE CASCADE).
const prisma = new PrismaClient();
const result = await prisma.user.deleteMany({ where: { email: { startsWith: "e2e.", endsWith: "@example.dev" } } });
console.log(`Removed ${result.count} leftover E2E user(s).`);
await prisma.$disconnect();
