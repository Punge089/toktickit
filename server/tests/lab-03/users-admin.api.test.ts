import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { seedAll } from "../../prisma/seed.js";
import { resetAllThrottles } from "../../src/lib/loginThrottle.js";
import { createAndLoginUser, createUser, loginAgent } from "../helpers/auth.js";

// docs/lab-03/tests.md ADM-01..ADM-09 - specification.md FR-17..FR-21,
// BR-28..BR-35, AC-25..AC-29; api-spec.md sections 15-18.
const INITIAL_PASSWORD = "Temp#Passw0rd1";
const NEW_INITIAL_PASSWORD = "Reset#Passw0rd2";

function stamp() {
  return `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
}

function newUserBody(over: Record<string, unknown> = {}) {
  const s = stamp();
  return {
    fullName: `Created ${s}`,
    email: `created-${s}@example.dev`,
    role: "REQUESTER",
    isActive: true,
    initialPassword: INITIAL_PASSWORD,
    ...over,
  };
}

async function adminAgent() {
  return createAndLoginUser({ role: "ADMINISTRATOR", fullName: "Test Administrator" });
}

describe("Administrator user management API", () => {
  beforeAll(async () => {
    await seedAll();
  });

  beforeEach(() => resetAllThrottles());

  // ADM-01, FR-17
  describe("GET /api/admin/users", () => {
    it("combines search (name or email) with the role filter and never returns a password hash", async () => {
      const { agent } = await adminAgent();
      const marker = `Zq${stamp()}`;
      await createUser({ fullName: `${marker} Requester`, role: "REQUESTER" });
      const staff = await createUser({ fullName: `${marker} Staffer`, role: "IT_STAFF" });
      await createUser({ fullName: "Someone Else", role: "IT_STAFF", email: `${marker.toLowerCase()}@example.dev` });

      const byName = await agent.get(`/api/admin/users?search=${marker}`);
      expect(byName.status).toBe(200);
      expect(byName.body.items.map((u: { fullName: string }) => u.fullName)).toEqual(
        expect.arrayContaining([`${marker} Requester`, `${marker} Staffer`]),
      );

      const combined = await agent.get(`/api/admin/users?search=${marker}&role=IT_STAFF`);
      expect(combined.status).toBe(200);
      const combinedIds = combined.body.items.map((u: { id: number }) => u.id);
      expect(combinedIds).toContain(staff.user.id);
      expect(combined.body.items.every((u: { role: string }) => u.role === "IT_STAFF")).toBe(true);
      expect(combined.body.items.some((u: { fullName: string }) => u.fullName === `${marker} Requester`)).toBe(false);

      // Searching by email matches too, case-insensitively.
      const byEmail = await agent.get(`/api/admin/users?search=${marker.toUpperCase()}@EXAMPLE`);
      expect(byEmail.body.items.some((u: { fullName: string }) => u.fullName === "Someone Else")).toBe(true);

      expect(JSON.stringify(combined.body)).not.toMatch(/passwordHash|scrypt\$/);
      expect(Object.keys(combined.body.items[0]).sort()).toEqual(["email", "fullName", "id", "isActive", "role"]);
    });

    it("lists in name order and reports the active Administrator count over all users", async () => {
      const { agent } = await adminAgent();
      const marker = `Ord${stamp()}`;
      await createUser({ fullName: `${marker} Bravo` });
      await createUser({ fullName: `${marker} Alpha` });

      const res = await agent.get(`/api/admin/users?search=${marker}`);
      expect(res.status).toBe(200);
      expect(res.body.items.map((u: { fullName: string }) => u.fullName)).toEqual([`${marker} Alpha`, `${marker} Bravo`]);

      const all = await agent.get("/api/admin/users");
      expect(all.status).toBe(200);

      const activeAdmins = await getPrisma().user.count({ where: { role: "ADMINISTRATOR", isActive: true } });
      expect(all.body.activeAdministratorCount).toBe(activeAdmins);

      // The count ignores the filter: a search that matches nobody still reports it.
      const none = await agent.get(`/api/admin/users?search=no-such-person-${stamp()}`);
      expect(none.body.items).toEqual([]);
      expect(none.body.activeAdministratorCount).toBe(activeAdmins);
    });

    it("rejects an invalid role filter and an over-long search with 400 INVALID_QUERY", async () => {
      const { agent } = await adminAgent();
      const badRole = await agent.get("/api/admin/users?role=SUPERUSER");
      expect(badRole.status).toBe(400);
      expect(badRole.body.error).toBe("INVALID_QUERY");
      expect(badRole.body.fieldErrors.role).toBeTruthy();

      const longSearch = await agent.get(`/api/admin/users?search=${"a".repeat(101)}`);
      expect(longSearch.status).toBe(400);
      expect(longSearch.body.fieldErrors.search).toBeTruthy();

      // An empty role is the same as no filter.
      const emptyRole = await agent.get("/api/admin/users?role=");
      expect(emptyRole.status).toBe(200);
    });
  });

  // ADM-02, ADM-03, AC-25, BR-28, BR-33
  describe("POST /api/admin/users", () => {
    it("creates a user with one role, stores the email lowercased, and forces a password change at first login", async () => {
      const { agent } = await adminAgent();
      const body = newUserBody({ email: `  Mixed.Case-${stamp()}@Example.DEV  `, role: "IT_STAFF" });

      const res = await agent.post("/api/admin/users").send(body);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ fullName: body.fullName, role: "IT_STAFF", isActive: true });
      expect(res.body.email).toBe((body.email as string).trim().toLowerCase());
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|scrypt\$/);

      const stored = await getPrisma().user.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored.mustChangePassword).toBe(true);
      expect(stored.passwordHash).not.toBeNull();
      expect(stored.passwordHash).not.toContain(INITIAL_PASSWORD);

      const login = await request(app).post("/api/auth/login").send({ email: res.body.email, password: INITIAL_PASSWORD });
      expect(login.status).toBe(200);
      expect(login.body.user.mustChangePassword).toBe(true);
    });

    it("can create an inactive account, which cannot sign in", async () => {
      const { agent } = await adminAgent();
      const body = newUserBody({ isActive: false });
      const res = await agent.post("/api/admin/users").send(body);
      expect(res.status).toBe(201);
      expect(res.body.isActive).toBe(false);

      const login = await request(app).post("/api/auth/login").send({ email: body.email, password: INITIAL_PASSWORD });
      expect(login.status).toBe(403);
      expect(login.body.error).toBe("ACCOUNT_INACTIVE");
    });

    it("rejects an email that already exists in a different case with 409 EMAIL_TAKEN and creates nothing", async () => {
      const { agent } = await adminAgent();
      const existing = await createUser({ email: `taken-${stamp()}@example.dev` });

      const before = await getPrisma().user.count();
      const res = await agent
        .post("/api/admin/users")
        .send(newUserBody({ email: existing.user.email.toUpperCase() }));
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("EMAIL_TAKEN");
      expect(await getPrisma().user.count()).toBe(before);
    });

    it("rejects a policy-violating initial password and an invalid role, each with 400 and a fieldErrors key", async () => {
      const { agent } = await adminAgent();

      const weak = await agent.post("/api/admin/users").send(newUserBody({ initialPassword: "short" }));
      expect(weak.status).toBe(400);
      expect(weak.body.error).toBe("VALIDATION_FAILED");
      expect(weak.body.fieldErrors.initialPassword).toBeTruthy();

      const badRole = await agent.post("/api/admin/users").send(newUserBody({ role: "SUPERUSER" }));
      expect(badRole.status).toBe(400);
      expect(badRole.body.fieldErrors.role).toBeTruthy();

      // BR-16: exactly one role, so an array is not a valid role either.
      const twoRoles = await agent.post("/api/admin/users").send(newUserBody({ role: ["REQUESTER", "IT_STAFF"] }));
      expect(twoRoles.status).toBe(400);
      expect(twoRoles.body.fieldErrors.role).toBeTruthy();
    });

    it("rejects missing, malformed, and over-long fields together", async () => {
      const { agent } = await adminAgent();
      const empty = await agent.post("/api/admin/users").send({});
      expect(empty.status).toBe(400);
      expect(Object.keys(empty.body.fieldErrors).sort()).toEqual(["email", "fullName", "initialPassword", "role"]);

      const bad = await agent
        .post("/api/admin/users")
        .send(newUserBody({ email: "not-an-email", fullName: "x".repeat(101), isActive: "yes" }));
      expect(bad.status).toBe(400);
      expect(bad.body.fieldErrors.email).toBeTruthy();
      expect(bad.body.fieldErrors.fullName).toBeTruthy();
      expect(bad.body.fieldErrors.isActive).toBeTruthy();
    });
  });

  // ADM-04, BR-29
  describe("PATCH /api/admin/users/:id", () => {
    it("changes only the supplied field, one at a time and then all together", async () => {
      const { agent } = await adminAgent();
      const { user } = await createUser({ fullName: "Before Name", role: "REQUESTER" });
      const original = { fullName: user.fullName, email: user.email, role: user.role, isActive: user.isActive };

      const name = await agent.patch(`/api/admin/users/${user.id}`).send({ fullName: "  After Name  " });
      expect(name.status).toBe(200);
      expect(name.body).toMatchObject({ ...original, fullName: "After Name" });

      const email = await agent.patch(`/api/admin/users/${user.id}`).send({ email: ` New-${stamp()}@Example.dev` });
      expect(email.status).toBe(200);
      expect(email.body.email).toBe(email.body.email.toLowerCase());
      expect(email.body.fullName).toBe("After Name");

      const role = await agent.patch(`/api/admin/users/${user.id}`).send({ role: "IT_STAFF" });
      expect(role.status).toBe(200);
      expect(role.body.role).toBe("IT_STAFF");
      expect(role.body.email).toBe(email.body.email);

      const inactive = await agent.patch(`/api/admin/users/${user.id}`).send({ isActive: false });
      expect(inactive.status).toBe(200);
      expect(inactive.body.isActive).toBe(false);
      expect(inactive.body.role).toBe("IT_STAFF");

      const s = stamp();
      const all = await agent
        .patch(`/api/admin/users/${user.id}`)
        .send({ fullName: "All Four", email: `all-${s}@example.dev`, role: "ADMINISTRATOR", isActive: true });
      expect(all.status).toBe(200);
      expect(all.body).toEqual({ id: user.id, fullName: "All Four", email: `all-${s}@example.dev`, role: "ADMINISTRATOR", isActive: true });
    });

    it("rejects an empty edit, an invalid role, a bad email, and an unknown user", async () => {
      const { agent } = await adminAgent();
      const { user } = await createUser();

      const nothing = await agent.patch(`/api/admin/users/${user.id}`).send({});
      expect(nothing.status).toBe(400);

      const badRole = await agent.patch(`/api/admin/users/${user.id}`).send({ role: "SUPERUSER" });
      expect(badRole.status).toBe(400);
      expect(badRole.body.fieldErrors.role).toBeTruthy();

      const badEmail = await agent.patch(`/api/admin/users/${user.id}`).send({ email: "nope" });
      expect(badEmail.status).toBe(400);
      expect(badEmail.body.fieldErrors.email).toBeTruthy();

      const unchanged = await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } });
      expect(unchanged.role).toBe(user.role);
      expect(unchanged.email).toBe(user.email);

      const missing = await agent.patch("/api/admin/users/99999999").send({ fullName: "Ghost" });
      expect(missing.status).toBe(404);
      expect(missing.body.error).toBe("USER_NOT_FOUND");
      const nonNumeric = await agent.patch("/api/admin/users/abc").send({ fullName: "Ghost" });
      expect(nonNumeric.status).toBe(404);
    });

    // ADM-02 (edit half), BR-33
    it("rejects changing an email to one already used, in any letter case, and allows re-sending the user's own email", async () => {
      const { agent } = await adminAgent();
      const a = await createUser({ email: `edit-a-${stamp()}@example.dev` });
      const b = await createUser({ email: `edit-b-${stamp()}@example.dev` });

      const clash = await agent.patch(`/api/admin/users/${b.user.id}`).send({ email: a.user.email.toUpperCase() });
      expect(clash.status).toBe(409);
      expect(clash.body.error).toBe("EMAIL_TAKEN");
      const stored = await getPrisma().user.findUniqueOrThrow({ where: { id: b.user.id } });
      expect(stored.email).toBe(b.user.email);

      const same = await agent.patch(`/api/admin/users/${b.user.id}`).send({ email: b.user.email.toUpperCase(), fullName: "Same Email" });
      expect(same.status).toBe(200);
      expect(same.body.email).toBe(b.user.email);
    });

    // ADM-05, AC-27, BR-31
    it("refuses to let an Administrator deactivate their own account or change their own role", async () => {
      const { agent, user } = await adminAgent();

      const deactivate = await agent.patch(`/api/admin/users/${user.id}`).send({ isActive: false });
      expect(deactivate.status).toBe(409);
      expect(deactivate.body.error).toBe("CANNOT_DEACTIVATE_SELF");

      const demote = await agent.patch(`/api/admin/users/${user.id}`).send({ role: "IT_STAFF" });
      expect(demote.status).toBe(409);
      expect(demote.body.error).toBe("CANNOT_CHANGE_OWN_ROLE");

      const after = await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.isActive).toBe(true);
      expect(after.role).toBe("ADMINISTRATOR");
      expect((await agent.get("/api/auth/me")).status).toBe(200);
    });

    it("still lets an Administrator edit their own name and email, even re-sending their unchanged role", async () => {
      const { agent, user } = await adminAgent();
      const res = await agent
        .patch(`/api/admin/users/${user.id}`)
        .send({ fullName: "Renamed Admin", role: "ADMINISTRATOR", isActive: true });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ fullName: "Renamed Admin", role: "ADMINISTRATOR", isActive: true });
    });

    // BR-35
    it("deactivating a user deletes their sessions and blocks sign-in until they are reactivated", async () => {
      const { agent } = await adminAgent();
      const { agent: victim, user, password } = await createAndLoginUser({ role: "IT_STAFF" });
      expect((await victim.get("/api/auth/me")).status).toBe(200);

      const off = await agent.patch(`/api/admin/users/${user.id}`).send({ isActive: false });
      expect(off.status).toBe(200);
      expect(await getPrisma().session.count({ where: { userId: user.id } })).toBe(0);
      expect((await victim.get("/api/auth/me")).status).toBe(401);

      const blocked = await request(app).post("/api/auth/login").send({ email: user.email, password });
      expect(blocked.status).toBe(403);
      expect(blocked.body.error).toBe("ACCOUNT_INACTIVE");

      const on = await agent.patch(`/api/admin/users/${user.id}`).send({ isActive: true });
      expect(on.status).toBe(200);
      const back = await request(app).post("/api/auth/login").send({ email: user.email, password });
      expect(back.status).toBe(200);
    });

    // ADM-06, AC-28, BR-32
    describe("last active Administrator", () => {
      let restore: number[] = [];

      // The shared test DB holds other active Administrators (the seeded one
      // and every one earlier tests created). Take them out of play for the
      // duration of one test, and always put them back.
      async function isolateAdministrators(keepIds: number[]) {
        const prisma = getPrisma();
        const others = await prisma.user.findMany({
          where: { role: "ADMINISTRATOR", isActive: true, id: { notIn: keepIds } },
          select: { id: true },
        });
        restore = others.map((u) => u.id);
        await prisma.user.updateMany({ where: { id: { in: restore } }, data: { isActive: false } });
      }

      afterEach(async () => {
        if (restore.length > 0) {
          await getPrisma().user.updateMany({ where: { id: { in: restore } }, data: { isActive: true } });
          restore = [];
        }
      });

      it("refuses to let two Administrators deactivate each other at the same moment", async () => {
        const a = await adminAgent();
        const b = await adminAgent();
        await isolateAdministrators([a.user.id, b.user.id]);

        // A and B deactivate each other in the same instant. Each request
        // alone is legal (the other Administrator is still active when it
        // starts), so only the row lock keeps the system from ending with
        // zero active Administrators.
        const [ab, ba] = await Promise.all([
          a.agent.patch(`/api/admin/users/${b.user.id}`).send({ isActive: false }),
          b.agent.patch(`/api/admin/users/${a.user.id}`).send({ isActive: false }),
        ]);

        const statuses = [ab.status, ba.status].sort();
        expect(statuses).toEqual([200, 409]);
        const refused = ab.status === 409 ? ab : ba;
        expect(refused.body.error).toBe("LAST_ACTIVE_ADMIN");

        const stillActive = await getPrisma().user.count({
          where: { id: { in: [a.user.id, b.user.id] }, isActive: true },
        });
        expect(stillActive).toBe(1);
      });

      it("refuses to let two Administrators demote each other at the same moment", async () => {
        const a = await adminAgent();
        const b = await adminAgent();
        await isolateAdministrators([a.user.id, b.user.id]);

        const [ab, ba] = await Promise.all([
          a.agent.patch(`/api/admin/users/${b.user.id}`).send({ role: "REQUESTER" }),
          b.agent.patch(`/api/admin/users/${a.user.id}`).send({ role: "REQUESTER" }),
        ]);

        expect([ab.status, ba.status].sort()).toEqual([200, 409]);
        expect((ab.status === 409 ? ab : ba).body.error).toBe("LAST_ACTIVE_ADMIN");
        const stillAdmin = await getPrisma().user.count({
          where: { id: { in: [a.user.id, b.user.id] }, role: "ADMINISTRATOR", isActive: true },
        });
        expect(stillAdmin).toBe(1);
      });

      it("allows deactivating another Administrator when the caller stays active", async () => {
        const a = await adminAgent();
        const b = await adminAgent();
        await isolateAdministrators([a.user.id, b.user.id]);

        const res = await a.agent.patch(`/api/admin/users/${b.user.id}`).send({ isActive: false });
        expect(res.status).toBe(200);
        expect((await b.agent.get("/api/auth/me")).status).toBe(401);
        expect((await a.agent.get("/api/auth/me")).status).toBe(200);

        // A is now the only active Administrator; the self rule still answers first.
        const self = await a.agent.patch(`/api/admin/users/${a.user.id}`).send({ isActive: false });
        expect(self.status).toBe(409);
        expect(self.body.error).toBe("CANNOT_DEACTIVATE_SELF");
      });
    });
  });

  // ADM-07, AC-26, BR-30
  describe("POST /api/admin/users/:id/initial-password", () => {
    it("sets a new initial password, forces a change at next login, and kills the user's existing sessions", async () => {
      const { agent } = await adminAgent();
      const { agent: victim, user, password } = await createAndLoginUser({ role: "REQUESTER" });
      expect((await victim.get("/api/auth/me")).status).toBe(200);

      const res = await agent.post(`/api/admin/users/${user.id}/initial-password`).send({ initialPassword: NEW_INITIAL_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: user.id, mustChangePassword: true });

      // The old session cookie is dead.
      expect((await victim.get("/api/auth/me")).status).toBe(401);

      // The old password no longer works; the new one does, from a fresh client.
      const old = await request(app).post("/api/auth/login").send({ email: user.email, password });
      expect(old.status).toBe(401);
      const fresh = await loginAgent(user.email, NEW_INITIAL_PASSWORD);
      const me = await fresh.get("/api/auth/me");
      expect(me.status).toBe(200);
      expect(me.body.mustChangePassword).toBe(true);

      // BR-02: until the user picks their own password, nothing else opens.
      const blocked = await fresh.get("/api/tickets");
      expect(blocked.status).toBe(403);
      expect(blocked.body.error).toBe("PASSWORD_CHANGE_REQUIRED");
    });

    it("rejects a policy-violating password with 400 and a missing user with 404, changing nothing", async () => {
      const { agent } = await adminAgent();
      const { agent: victim, user, password } = await createAndLoginUser({ role: "REQUESTER" });

      const weak = await agent.post(`/api/admin/users/${user.id}/initial-password`).send({ initialPassword: "weakpass" });
      expect(weak.status).toBe(400);
      expect(weak.body.fieldErrors.initialPassword).toBeTruthy();
      const missing = await agent.post(`/api/admin/users/${user.id}/initial-password`).send({});
      expect(missing.status).toBe(400);

      // Nothing was touched: the old password and session still work.
      expect((await victim.get("/api/auth/me")).status).toBe(200);
      expect((await request(app).post("/api/auth/login").send({ email: user.email, password })).status).toBe(200);

      const ghost = await agent.post("/api/admin/users/99999999/initial-password").send({ initialPassword: NEW_INITIAL_PASSWORD });
      expect(ghost.status).toBe(404);
      expect(ghost.body.error).toBe("USER_NOT_FOUND");
    });

    it("can set an initial password for an account created without a usable one", async () => {
      const { agent } = await adminAgent();
      const legacy = await getPrisma().user.create({
        data: { fullName: "Legacy No Password", email: `legacy-${stamp()}@example.dev`, role: "REQUESTER", passwordHash: null },
      });
      expect((await request(app).post("/api/auth/login").send({ email: legacy.email, password: NEW_INITIAL_PASSWORD })).status).toBe(401);

      const res = await agent.post(`/api/admin/users/${legacy.id}/initial-password`).send({ initialPassword: NEW_INITIAL_PASSWORD });
      expect(res.status).toBe(200);
      const login = await request(app).post("/api/auth/login").send({ email: legacy.email, password: NEW_INITIAL_PASSWORD });
      expect(login.status).toBe(200);
      expect(login.body.user.mustChangePassword).toBe(true);
    });
  });

  // ADM-08, AC-29
  describe("non-Administrators", () => {
    it.each(["IT_STAFF", "REQUESTER"] as const)("a %s gets 403 on every /api/admin endpoint and changes nothing", async (role) => {
      const { agent } = await createAndLoginUser({ role });
      const { user: target } = await createUser({ fullName: "Untouched Target" });
      const before = await getPrisma().user.count();

      const list = await agent.get("/api/admin/users");
      const create = await agent.post("/api/admin/users").send(newUserBody());
      const patch = await agent.patch(`/api/admin/users/${target.id}`).send({ fullName: "Hacked" });
      const reset = await agent.post(`/api/admin/users/${target.id}/initial-password`).send({ initialPassword: NEW_INITIAL_PASSWORD });

      for (const res of [list, create, patch, reset]) {
        expect(res.status).toBe(403);
        expect(res.body.error).toBe("FORBIDDEN");
        expect(JSON.stringify(res.body)).not.toContain(target.email);
      }
      expect(await getPrisma().user.count()).toBe(before);
      const after = await getPrisma().user.findUniqueOrThrow({ where: { id: target.id } });
      expect(after.fullName).toBe("Untouched Target");
      expect((await request(app).post("/api/auth/login").send({ email: target.email, password: NEW_INITIAL_PASSWORD })).status).toBe(401);
    });
  });

  // ADM-09, BR-34
  it("has no way to delete a user: DELETE is not a route, and the user survives", async () => {
    const { agent } = await adminAgent();
    const { user } = await createUser();
    const res = await agent.delete(`/api/admin/users/${user.id}`);
    expect(res.status).toBe(404);
    expect(await getPrisma().user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });
});
