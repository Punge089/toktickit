import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { seedAll } from "../../prisma/seed.js";
import { createAndLoginUser } from "../helpers/auth.js";

// docs/lab-03/tests.md SEC-01, SEC-04, SEC-05, SEC-06 — specification.md
// BR-03, BR-13, BR-36; AC-03, AC-29. (SEC-02/03/08 live in the staff test
// files next to the routes they protect; SEC-07 is covered in
// server/tests/lab-02/reference.api.test.ts, next to the other reference
// routes it removes.)
describe("Authorization", () => {
  let categoryId: number;
  let relatedSystemId: number;

  beforeAll(async () => {
    await seedAll();
    const prisma = getPrisma();
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
    categoryId = category.id;
    relatedSystemId = relatedSystem.id;
  });

  function validTicketFields() {
    return {
      summary: "Authorization test ticket",
      description: "Checking that a spoofed requesterId is ignored by the backend, per BR-03.",
      categoryId: String(categoryId),
      relatedSystemId: String(relatedSystemId),
      requestedPriority: "MEDIUM",
    };
  }

  // SEC-01, AC-03, BR-03
  it("ignores a spoofed requesterId in the body when creating a Ticket", async () => {
    const { agent, user } = await createAndLoginUser({ role: "REQUESTER" });
    const { user: victim } = await createAndLoginUser({ role: "REQUESTER" });

    const res = await agent.post("/api/tickets").field({ ...validTicketFields(), requesterId: String(victim.id) });
    expect(res.status).toBe(201);
    expect(res.body.requesterId).toBe(user.id);
    expect(res.body.requesterId).not.toBe(victim.id);
  });

  // SEC-01, AC-03, BR-03
  it("ignores a spoofed requesterId query param and the legacy header when listing Tickets", async () => {
    const { agent } = await createAndLoginUser({ role: "REQUESTER" });
    const { agent: victimAgent, user: victim } = await createAndLoginUser({ role: "REQUESTER" });

    // give the victim a uniquely identifiable ticket
    const marker = `Victim-only-${Date.now()}`;
    await victimAgent.post("/api/tickets").field({ ...validTicketFields(), summary: marker });

    // The authenticated agent's own session cookie is what decides
    // identity; a spoofed query param AND the legacy header are both
    // present here and neither has any effect.
    const spoofed = await agent
      .get(`/api/tickets?requesterId=${victim.id}&pageSize=50`)
      .set("X-Dev-Requester-Id", String(victim.id));
    expect(spoofed.status).toBe(200);
    expect(spoofed.body.data.some((t: { summary: string }) => t.summary === marker)).toBe(false);
  });

  // SEC-05, BR-36
  it("rejects every Requester-scoped endpoint with 401 when there is no session at all", async () => {
    const calls = [
      request(app).get("/api/tickets"),
      request(app).post("/api/tickets").field(validTicketFields()),
      request(app).get(`/api/tickets/${1}`),
      request(app).post(`/api/tickets/1/attachments`),
      request(app).get(`/api/attachments/1`),
      request(app).get(`/api/attachments/1/download`),
      request(app).delete(`/api/attachments/1`).send({ removalReason: "test" }),
      request(app).get("/api/auth/me"),
    ];

    const results = await Promise.all(calls);
    for (const res of results) {
      expect(res.status).toBe(401);
    }
  });

  // SEC-04, AC-29, BR-36: the authorization matrix row "List / search Users",
  // "Create / edit User, reset initial password". Every /api/admin endpoint
  // gives 401 with no session and 403 to both non-Administrator roles, and a
  // 403 body never contains user data.
  describe("SEC-04 Administrator endpoints", () => {
    const calls: Array<[string, (a: ReturnType<typeof request.agent>) => request.Test]> = [
      ["GET /api/admin/users", (a) => a.get("/api/admin/users")],
      ["POST /api/admin/users", (a) => a.post("/api/admin/users").send({ fullName: "X", email: "x@example.dev", role: "REQUESTER", initialPassword: "Temp#Passw0rd1" })],
      ["PATCH /api/admin/users/:id", (a) => a.patch("/api/admin/users/1").send({ fullName: "X" })],
      ["POST /api/admin/users/:id/initial-password", (a) => a.post("/api/admin/users/1/initial-password").send({ initialPassword: "Temp#Passw0rd1" })],
    ];

    it.each(calls)("%s answers 401 to an unauthenticated caller", async (_name, call) => {
      const res = await call(request.agent(app));
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("UNAUTHENTICATED");
    });

    it.each(["IT_STAFF", "REQUESTER"] as const)("every endpoint answers 403 to a %s with no user data in the body", async (role) => {
      const { agent } = await createAndLoginUser({ role });
      for (const [, call] of calls) {
        const res = await call(agent);
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: "FORBIDDEN", message: "You do not have access to this resource." });
      }
    });

    it("an Administrator who has not yet changed their initial password is stopped with 403 PASSWORD_CHANGE_REQUIRED", async () => {
      const { agent } = await createAndLoginUser({ role: "ADMINISTRATOR", mustChangePassword: true });
      const res = await agent.get("/api/admin/users");
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("PASSWORD_CHANGE_REQUIRED");
    });
  });

  // SEC-06, BR-13
  it("rejects a state-changing request whose Origin header does not match CLIENT_ORIGIN", async () => {
    const { user } = await createAndLoginUser({ role: "REQUESTER" });

    const mismatched = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://evil.example.com")
      .send({ email: user.email, password: "irrelevant" });
    expect(mismatched.status).toBe(403);
    expect(mismatched.body.error).toBe("ORIGIN_NOT_ALLOWED");

    // No Origin header at all (Supertest's default) is not rejected by
    // this check — it reaches normal handling instead.
    const noOrigin = await request(app).post("/api/auth/login").send({ email: user.email, password: "irrelevant" });
    expect(noOrigin.status).not.toBe(403);
  });

  it("accepts a state-changing request whose Origin header matches CLIENT_ORIGIN", async () => {
    const { user, password } = await createAndLoginUser({ role: "REQUESTER" });
    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
      .send({ email: user.email, password });
    expect(res.status).toBe(200);
  });
});
