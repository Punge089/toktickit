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

// API-20
describe("GET /api/dev-requesters", () => {
  it("returns only active Development Requesters, excluding the seeded inactive one", async () => {
    const res = await request(app).get("/api/dev-requesters");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
    expect(res.body.some((r: { fullName: string }) => r.fullName === "Somsak Jantawong")).toBe(false);
    for (const r of res.body) {
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("fullName");
      expect(r).toHaveProperty("email");
    }
  });

  it("returns a safe 500 when the database is unreachable", async () => {
    const spy = vi.spyOn(getPrisma().requesterUser, "findMany").mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/api/dev-requesters");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "INTERNAL_ERROR", message: "Unable to load Development Requesters." });
    spy.mockRestore();
  });
});
