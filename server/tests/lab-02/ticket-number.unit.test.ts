import { describe, it, expect } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { nextTicketNumber } from "../../src/lib/ticketNumber.js";

// UNIT-01, UNIT-02 in tests.md.
describe("nextTicketNumber", () => {
  it("matches TKT-YYYY-NNNNNN with the correct year", async () => {
    const number = await getPrisma().$transaction((tx) =>
      nextTicketNumber(tx, new Date("2026-06-01T00:00:00Z")),
    );
    expect(number).toMatch(/^TKT-2026-\d{6}$/);
  });

  it("20 concurrent generations in the same year are all unique", async () => {
    const prisma = getPrisma();
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        prisma.$transaction((tx) => nextTicketNumber(tx, new Date("2027-01-01T00:00:00Z"))),
      ),
    );
    expect(new Set(results).size).toBe(20);
  });
});
