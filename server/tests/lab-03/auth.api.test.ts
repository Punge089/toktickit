import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { createUser, loginAgent } from "../helpers/auth.js";
import { resetAllThrottles } from "../../src/lib/loginThrottle.js";
import { requireAuth, requirePasswordCurrent } from "../../src/middleware/auth.js";

// A throwaway protected route sharing the real auth middleware chain, used
// only to prove requirePasswordCurrent's behavior in isolation — PR 2 adds
// no other business endpoint on this chain yet (Requester routes migrate
// to session auth in Issue 64). Session lookup is DB-driven, not tied to a
// specific Express instance, so a cookie from `app`'s real login works here.
const testProtectedApp = express();
testProtectedApp.get("/api/__test-protected", requireAuth, requirePasswordCurrent, (_req, res) => {
  res.status(200).json({ ok: true });
});

// docs/lab-03/tests.md API-01..API-10 — specification.md BR-01, BR-02,
// BR-06, BR-07, BR-08, BR-09, BR-10, BR-11, BR-12; api-spec.md §1-4.
describe("Authentication API", () => {
  beforeEach(() => {
    resetAllThrottles();
  });

  // API-01, AC-01
  it("logs in with valid credentials and sets a session cookie", async () => {
    const { user, password } = await createUser({ role: "REQUESTER" });
    const res = await request(app).post("/api/auth/login").send({ email: user.email, password });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.role).toBe("REQUESTER");
    expect(res.body.user.mustChangePassword).toBe(false);
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(res.headers["set-cookie"]?.[0]).toMatch(/tt_session=/);
  });

  // API-02, AC-05
  it("rejects a wrong password and an unknown email with the identical message", async () => {
    const { user } = await createUser();
    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "totally-wrong" });
    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody-here@example.dev", password: "totally-wrong" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error).toBe("INVALID_CREDENTIALS");
  });

  // API-03, AC-06
  it("reports an inactive account only once the password is correct", async () => {
    const { user, password } = await createUser({ isActive: false });

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "totally-wrong" });
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.error).toBe("INVALID_CREDENTIALS");

    const correctPassword = await request(app).post("/api/auth/login").send({ email: user.email, password });
    expect(correctPassword.status).toBe(403);
    expect(correctPassword.body.error).toBe("ACCOUNT_INACTIVE");
  });

  // API-04, AC-07
  it("throttles login after 5 failed attempts and resets after success", async () => {
    const { user, password } = await createUser();

    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: user.email, password: "wrong-attempt" });
      expect(res.status).toBe(401);
    }

    const sixth = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password }); // even the correct password is blocked
    expect(sixth.status).toBe(429);
    expect(sixth.headers["retry-after"]).toBeDefined();

    resetAllThrottles();
    const afterReset = await request(app).post("/api/auth/login").send({ email: user.email, password });
    expect(afterReset.status).toBe(200);
  });

  // API-05, AC-02, BR-02
  it("blocks other endpoints until a first-login password change, but allows me/logout/change-password", async () => {
    const { user, password } = await createUser({ mustChangePassword: true });
    const login = await request(app).post("/api/auth/login").send({ email: user.email, password });
    const cookie = login.headers["set-cookie"][0];

    const blocked = await request(testProtectedApp).get("/api/__test-protected").set("Cookie", cookie);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe("PASSWORD_CHANGE_REQUIRED");

    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
  });

  // API-06
  it("rejects a change-password request with a policy violation, a mismatch, or the wrong current password", async () => {
    const { user, password } = await createUser();
    const agent = await loginAgent(user.email, password);

    const weakPolicy = await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: password, newPassword: "weak", confirmPassword: "weak" });
    expect(weakPolicy.status).toBe(400);
    expect(weakPolicy.body.fieldErrors).toHaveProperty("newPassword");

    const mismatch = await agent.post("/api/auth/change-password").send({
      currentPassword: password,
      newPassword: "Brand-New1!",
      confirmPassword: "Different1!",
    });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.fieldErrors).toHaveProperty("confirmPassword");

    const wrongCurrent = await agent.post("/api/auth/change-password").send({
      currentPassword: "not-the-real-password",
      newPassword: "Brand-New1!",
      confirmPassword: "Brand-New1!",
    });
    expect(wrongCurrent.status).toBe(400);
    expect(wrongCurrent.body.fieldErrors).toHaveProperty("currentPassword");
  });

  // API-07, BR-02, BR-09
  it("clears mustChangePassword on a successful first-login change and rejects reusing the same password", async () => {
    const { user, password } = await createUser({ mustChangePassword: true });
    const agent = await loginAgent(user.email, password);

    const samePassword = await agent.post("/api/auth/change-password").send({
      currentPassword: password,
      newPassword: password,
      confirmPassword: password,
    });
    expect(samePassword.status).toBe(400);
    expect(samePassword.body.fieldErrors).toHaveProperty("newPassword");

    const changed = await agent.post("/api/auth/change-password").send({
      currentPassword: password,
      newPassword: "Brand-New1!",
      confirmPassword: "Brand-New1!",
    });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);

    const nowUnblocked = await agent.get("/api/auth/me");
    expect(nowUnblocked.status).toBe(200);
  });

  // API-08, BR-09
  it("revokes other sessions on password change but keeps the current one", async () => {
    const { user, password } = await createUser();
    const firstAgent = await loginAgent(user.email, password);
    const secondAgent = await loginAgent(user.email, password);

    const changeRes = await firstAgent.post("/api/auth/change-password").send({
      currentPassword: password,
      newPassword: "Fresh-Pass1!",
      confirmPassword: "Fresh-Pass1!",
    });
    expect(changeRes.status).toBe(200);

    const secondStillValid = await secondAgent.get("/api/auth/me");
    expect(secondStillValid.status).toBe(401);

    const firstStillValid = await firstAgent.get("/api/auth/me");
    expect(firstStillValid.status).toBe(200);
  });

  // API-09, AC-08
  it("invalidates the session on logout", async () => {
    const { user, password } = await createUser();
    const agent = await loginAgent(user.email, password);

    const before = await agent.get("/api/auth/me");
    expect(before.status).toBe(200);

    const logout = await agent.post("/api/auth/logout");
    expect(logout.status).toBe(204);

    const after = await agent.get("/api/auth/me");
    expect(after.status).toBe(401);
  });

  it("logout is idempotent when there is no session at all", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(204);
  });

  // API-10
  it("rejects GET /api/auth/me with no session", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("UNAUTHENTICATED");
  });

  it("rejects login with a missing email or password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "" });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty("password");
  });

  // API-11, BR-11: the cookie lives for the 8-hour session, and a session past its
  // expiry is treated exactly like no session at all.
  it("gives the session cookie an 8-hour lifetime and rejects a session once it has expired", async () => {
    const { user, password } = await createUser({ role: "REQUESTER" });
    const login = await request(app).post("/api/auth/login").send({ email: user.email, password });
    const cookie = login.headers["set-cookie"]![0];
    const maxAge = Number(/Max-Age=(\d+)/.exec(cookie)?.[1]);
    expect(maxAge).toBeLessThanOrEqual(8 * 60 * 60);
    expect(maxAge).toBeGreaterThan(8 * 60 * 60 - 60);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);

    const agent = await loginAgent(user.email, password);
    expect((await agent.get("/api/auth/me")).status).toBe(200);

    // Push every session of this user past its absolute expiry.
    await getPrisma().session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await agent.get("/api/auth/me");
    expect(expired.status).toBe(401);
    expect(expired.body.error).toBe("UNAUTHENTICATED");

    // Signing in again starts a fresh session.
    const again = await loginAgent(user.email, password);
    expect((await again.get("/api/auth/me")).status).toBe(200);
  });
});
