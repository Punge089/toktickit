import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAndLoginUser } from "../helpers/auth.js";
import { Lab4Fixtures, makeTicket, removeTickets, setUpLab4Fixtures } from "../helpers/lab4.js";

// docs/lab-04/tests.md FLT-01, FLT-02 - api-spec.md §6; specification.md BR-28, BR-36, AC-36.
const ALL_STATUSES = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];
const ACTIVE = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];

describe("Drill-down filters", () => {
  let f: Lab4Fixtures;
  const created: number[] = [];

  beforeAll(async () => {
    f = await setUpLab4Fixtures("Filters");
  });
  afterAll(async () => {
    await removeTickets(created);
  });

  it("FLT-01: GET /api/tickets accepts every status and active=true, both together, and names invalid values", async () => {
    const me = await createAndLoginUser({ role: "REQUESTER", fullName: "Filter Requester" });
    for (const status of ALL_STATUSES) {
      const t = await makeTicket({ ...f, requester: me }, { currentStatus: status, summary: `Filter ${status}` });
      created.push(t.id);
    }
    created.push((await makeTicket(f, { currentStatus: "OPEN", summary: "Someone else's" })).id);

    for (const status of ALL_STATUSES) {
      const res = await me.agent.get(`/api/tickets?status=${status}`);
      expect(res.status, status).toBe(200);
      expect(res.body.meta.totalItems).toBe(1);
      expect(res.body.data[0].currentStatus).toBe(status);
      expect(res.body.meta.appliedFilters).toMatchObject({ status, active: null });
    }

    const active = await me.agent.get("/api/tickets?active=true&pageSize=50");
    expect(active.status).toBe(200);
    expect(active.body.data.map((t: { currentStatus: string }) => t.currentStatus).sort()).toEqual([...ACTIVE].sort());
    expect(active.body.meta.appliedFilters.active).toBe(true);

    // both must match: an active status passes, a finished one gives nothing
    expect((await me.agent.get("/api/tickets?status=OPEN&active=true")).body.meta.totalItems).toBe(1);
    expect((await me.agent.get("/api/tickets?status=RESOLVED&active=true")).body.meta.totalItems).toBe(0);

    for (const [query, field] of [
      ["status=BOGUS", "status"],
      ["status=open", "status"],
      ["active=false", "active"],
      ["active=1", "active"],
      ["active=", "active"],
    ] as const) {
      const res = await me.agent.get(`/api/tickets?${query}`);
      expect(res.status, query).toBe(400);
      expect(res.body.error).toBe("INVALID_QUERY");
      expect(res.body.fieldErrors).toHaveProperty(field);
    }
  });

  it("FLT-02: GET /api/staff/tickets accepts active=true with owner and itPriority, and names invalid values", async () => {
    const marker = `Flt2 ${Date.now()}`;
    const make = async (currentStatus: string, itPriority: string, ownerId: number | null) => {
      const t = await makeTicket(f, { currentStatus, itPriority, ownerId, summary: marker });
      created.push(t.id);
      return t;
    };
    const a = await make("OPEN", "HIGH", f.staff.user.id);
    await make("RESOLVED", "HIGH", f.staff.user.id); // not active
    await make("OPEN", "LOW", f.staff.user.id); // another priority
    await make("OPEN", "HIGH", f.otherStaff.user.id); // another owner
    const d = await make("NEW", "HIGH", f.staff.user.id);

    const res = await f.staff.agent.get(`/api/staff/tickets?search=${encodeURIComponent(marker)}&active=true&owner=me&itPriority=HIGH`);
    expect(res.status).toBe(200);
    expect(res.body.items.map((t: { id: number }) => t.id).sort()).toEqual([a.id, d.id].sort());
    expect(res.body.appliedFilters).toMatchObject({ active: true, owner: "me", itPriority: "HIGH" });

    const plain = await f.staff.agent.get(`/api/staff/tickets?search=${encodeURIComponent(marker)}`);
    expect(plain.body.totalItems).toBe(5);
    expect(plain.body.appliedFilters.active).toBeNull();
    expect((await f.staff.agent.get(`/api/staff/tickets?search=${encodeURIComponent(marker)}&status=RESOLVED&active=true`)).body.totalItems).toBe(0);
    expect((await f.admin.agent.get(`/api/staff/tickets?search=${encodeURIComponent(marker)}&active=true`)).body.totalItems).toBe(4);

    for (const query of ["active=false", "active=yes", "active=true&active=true"]) {
      const bad = await f.staff.agent.get(`/api/staff/tickets?${query}`);
      expect(bad.status, query).toBe(400);
      expect(bad.body.error).toBe("INVALID_QUERY");
      expect(bad.body.fieldErrors).toHaveProperty("active");
    }
    // Lab 3 parameters keep their meaning.
    expect((await f.staff.agent.get("/api/staff/tickets?status=NOPE")).body.fieldErrors).toHaveProperty("status");
  });
});
