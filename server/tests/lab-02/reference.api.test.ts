import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { seedAll } from "../../prisma/seed.js";

// Issue 24 — api-spec.md §1-3.
describe("GET /api/categories (Lab 2: isActive filter)", () => {
  beforeAll(async () => {
    await seedAll();
  });

  it("returns only active categories, ordered by id", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 1, name: "Account and Access" },
      { id: 2, name: "Hardware" },
      { id: 3, name: "Software" },
      { id: 4, name: "Network" },
    ]);
  });

  it("excludes an inactive category", async () => {
    const prisma = getPrisma();
    const target = await prisma.category.findFirstOrThrow({ where: { name: "Network" } });
    await prisma.category.update({ where: { id: target.id }, data: { isActive: false } });

    const res = await request(app).get("/api/categories");
    expect(res.body.map((c: { name: string }) => c.name)).not.toContain("Network");

    // restore for other tests / manual runs
    await prisma.category.update({ where: { id: target.id }, data: { isActive: true } });
  });

  it("returns a safe 500 when the database is unreachable", async () => {
    const spy = vi.spyOn(getPrisma().category, "findMany").mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "INTERNAL_ERROR", message: "Unable to load categories." });
    spy.mockRestore();
  });
});

describe("GET /api/related-systems", () => {
  it("returns only active related systems, ordered by id", async () => {
    const res = await request(app).get("/api/related-systems");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < res.body.length; i++) {
      expect(res.body[i].id).toBeGreaterThan(res.body[i - 1].id);
    }
  });

  it("returns a safe 500 when the database is unreachable", async () => {
    const spy = vi.spyOn(getPrisma().relatedSystem, "findMany").mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/api/related-systems");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "INTERNAL_ERROR", message: "Unable to load related systems." });
    spy.mockRestore();
  });
});

// Issue 64 (REG-05 / SEC-07) — the Development Requester selector and its
// API are removed entirely (docs/lab-03/specification.md BR-39). The two
// tests that used to live here (API-20: active-only listing, and the
// simulated-DB-failure case) tested behavior that no longer exists; this
// replaces them with the Lab 3 regression that proves the removal, rather
// than deleting API-20's coverage outright.
describe("GET /api/dev-requesters (removed in Issue 64)", () => {
  it("no longer exists — returns 404, not the old Development Requester list", async () => {
    const res = await request(app).get("/api/dev-requesters");
    expect(res.status).toBe(404);
  });
});
