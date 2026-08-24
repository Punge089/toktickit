import { describe, it, expect } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { seedAll } from "../../prisma/seed.js";

// Issue 22 acceptance criterion: "Seed is idempotent (running it twice
// creates no duplicates)." Runs the real seed functions twice against the
// test database (server/.env.test — see tests/setup.ts) and asserts the
// second run adds nothing.
describe("Lab 2 seed idempotency", () => {
  it("running seedAll() twice does not change row counts", async () => {
    const prisma = getPrisma();

    await seedAll();
    const [categoriesAfterFirst, systemsAfterFirst, requestersAfterFirst] = await Promise.all([
      prisma.category.count(),
      prisma.relatedSystem.count(),
      prisma.requesterUser.count(),
    ]);

    await seedAll();
    const [categoriesAfterSecond, systemsAfterSecond, requestersAfterSecond] = await Promise.all([
      prisma.category.count(),
      prisma.relatedSystem.count(),
      prisma.requesterUser.count(),
    ]);

    expect(categoriesAfterSecond).toBe(categoriesAfterFirst);
    expect(systemsAfterSecond).toBe(systemsAfterFirst);
    expect(requestersAfterSecond).toBe(requestersAfterFirst);
  });

  it("seeds the four required categories", async () => {
    const prisma = getPrisma();
    await seedAll();
    const names = (await prisma.category.findMany({ select: { name: true } })).map((c) => c.name);
    for (const required of ["Account and Access", "Hardware", "Software", "Network"]) {
      expect(names).toContain(required);
    }
  });

  it("seeds at least six related systems", async () => {
    const prisma = getPrisma();
    await seedAll();
    const count = await prisma.relatedSystem.count();
    expect(count).toBeGreaterThanOrEqual(6);
  });

  it("seeds at least four active and one inactive Development Requester", async () => {
    const prisma = getPrisma();
    await seedAll();
    const active = await prisma.requesterUser.count({ where: { isActive: true } });
    const inactive = await prisma.requesterUser.count({ where: { isActive: false } });
    expect(active).toBeGreaterThanOrEqual(4);
    expect(inactive).toBeGreaterThanOrEqual(1);
  });
});
