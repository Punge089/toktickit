import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { createAndLoginUser } from "../helpers/auth.js";
import { Lab4Fixtures, actionBody, insertAction, makeTicket, setUpLab4Fixtures } from "../helpers/lab4.js";

// docs/lab-04/tests.md SEC-01 to SEC-05 - specification.md
// BR-05, BR-06, BR-10, BR-37, AC-06 to AC-08, authorization matrix.
describe("Actions Taken authorization", () => {
  let f: Lab4Fixtures;

  beforeAll(async () => {
    f = await setUpLab4Fixtures("Actions Auth");
  });

  it("SEC-01: a Requester, an unauthenticated caller and a first-login user cannot create or change Actions", async () => {
    const t = await makeTicket(f);
    const a = await insertAction(t.id, f.staff.user.id, f.staff.user.id);
    const create = actionBody(f.staff.user.id);
    const update = { expectedVersion: 1, description: "Hacked" };

    expect((await f.requester.agent.post(`/api/staff/tickets/${t.id}/actions`).send(create)).status).toBe(403);
    expect((await f.requester.agent.post(`/api/staff/tickets/${t.id}/actions`).send(create)).body.error).toBe("FORBIDDEN");
    expect((await f.requester.agent.patch(`/api/staff/tickets/${t.id}/actions/${a.id}`).send(update)).status).toBe(403);

    expect((await request(app).post(`/api/staff/tickets/${t.id}/actions`).send(create)).status).toBe(401);
    expect((await request(app).patch(`/api/staff/tickets/${t.id}/actions/${a.id}`).send(update)).status).toBe(401);

    const firstLogin = await createAndLoginUser({ role: "IT_STAFF", mustChangePassword: true });
    const blockedCreate = await firstLogin.agent.post(`/api/staff/tickets/${t.id}/actions`).send(create);
    expect(blockedCreate.status).toBe(403);
    expect(blockedCreate.body.error).toBe("PASSWORD_CHANGE_REQUIRED");
    const blockedPatch = await firstLogin.agent.patch(`/api/staff/tickets/${t.id}/actions/${a.id}`).send(update);
    expect(blockedPatch.status).toBe(403);
    expect(blockedPatch.body.error).toBe("PASSWORD_CHANGE_REQUIRED");
    const blockedRead = await firstLogin.agent.get(`/api/tickets/${t.id}/actions`);
    expect(blockedRead.status).toBe(403);
    expect(blockedRead.body.error).toBe("PASSWORD_CHANGE_REQUIRED");

    expect(await getPrisma().actionTaken.count({ where: { ticketId: t.id } })).toBe(1);
    expect((await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: a.id } })).description).toBe("Fixture action");
  });

  it("SEC-02: a Requester reads every Action of their own Ticket but never an Internal Note, and gets 404 for another's", async () => {
    const own = await makeTicket(f);
    const others = await makeTicket(f, { requesterId: f.otherRequester.user.id });
    const secret = "INTERNAL-ONLY-PHRASE-7731";
    for (const t of [own, others]) {
      await getPrisma().internalNote.create({ data: { ticketId: t.id, authorId: f.staff.user.id, body: secret } });
      await insertAction(t.id, f.staff.user.id, f.otherStaff.user.id, {
        description: "Visible to the requester",
        followUpRequired: true,
        followUpNote: "Check again",
        attachmentNotes: "Photo attached",
        actionStatus: "COMPLETED",
        result: "Fixed",
      });
    }

    const ok = await f.requester.agent.get(`/api/tickets/${own.id}/actions`);
    expect(ok.status).toBe(200);
    expect(ok.body.items).toHaveLength(1);
    expect(ok.body.items[0]).toMatchObject({
      description: "Visible to the requester",
      result: "Fixed",
      followUpRequired: true,
      followUpNote: "Check again",
      attachmentNotes: "Photo attached",
      actionStatus: "COMPLETED",
      assignee: { fullName: "Actions Auth Staff B" },
      performedBy: { fullName: "Actions Auth Staff A" },
    });
    expect(JSON.stringify(ok.body)).not.toContain(secret);

    const probe = await f.requester.agent.get(`/api/tickets/${others.id}/actions`);
    const missing = await f.requester.agent.get("/api/tickets/999999999/actions");
    expect(probe.status).toBe(404);
    expect(probe.body).toEqual(missing.body);
    expect(missing.status).toBe(404);
    expect(JSON.stringify(probe.body)).not.toContain("Visible to the requester");

    // IT Staff and Administrators read any Ticket's Actions.
    expect((await f.staff.agent.get(`/api/tickets/${others.id}/actions`)).status).toBe(200);
    expect((await f.admin.agent.get(`/api/tickets/${others.id}/actions`)).status).toBe(200);
    expect((await request(app).get(`/api/tickets/${own.id}/actions`)).status).toBe(401);
  });

  it("SEC-03: an Administrator creates and updates Actions but stays read-only for everything else", async () => {
    const t = await makeTicket(f, { ownerId: f.staff.user.id, currentStatus: "OPEN" });

    const created = await f.admin.agent.post(`/api/staff/tickets/${t.id}/actions`).send(actionBody(f.staff.user.id));
    expect(created.status).toBe(201);
    expect(created.body.performedBy.id).toBe(f.admin.user.id);
    const updated = await f.admin.agent
      .patch(`/api/staff/tickets/${t.id}/actions/${created.body.id}`)
      .send({ expectedVersion: 1, actionStatus: "IN_PROGRESS" });
    expect(updated.status).toBe(200);
    expect(updated.body.actionStatus).toBe("IN_PROGRESS");

    const denied = [
      f.admin.agent.patch(`/api/staff/tickets/${t.id}/owner`).send({ ownerId: f.otherStaff.user.id, expectedVersion: 1 }),
      f.admin.agent.patch(`/api/staff/tickets/${t.id}/it-priority`).send({ itPriority: "URGENT", expectedVersion: 1 }),
      f.admin.agent.patch(`/api/staff/tickets/${t.id}/status`).send({ status: "IN_PROGRESS", expectedVersion: 1 }),
      f.admin.agent.post(`/api/tickets/${t.id}/comments`).send({ body: "Admin comment" }),
      f.admin.agent.post(`/api/staff/tickets/${t.id}/notes`).send({ body: "Admin note" }),
    ];
    for (const res of await Promise.all(denied)) {
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("FORBIDDEN");
    }
    const ticket = await getPrisma().ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(ticket).toMatchObject({ ownerId: f.staff.user.id, itPriority: "MEDIUM", currentStatus: "OPEN" });
    expect(await getPrisma().publicComment.count({ where: { ticketId: t.id } })).toBe(0);
    expect(await getPrisma().internalNote.count({ where: { ticketId: t.id } })).toBe(0);

    // An Administrator can write Actions but cannot be the person assigned to one.
    const toAdmin = await f.admin.agent.post(`/api/staff/tickets/${t.id}/actions`).send(actionBody(f.admin.user.id));
    expect(toAdmin.status).toBe(409);
    expect(toAdmin.body.error).toBe("INVALID_ASSIGNEE");
  });

  it("SEC-04: each role reaches only its own dashboard endpoint; an unauthenticated caller and a first-login user are stopped", async () => {
    const asks = async (agent: Lab4Fixtures["staff"]["agent"]) => ({
      requester: (await agent.get("/api/dashboard/requester")).status,
      staff: (await agent.get("/api/dashboard/staff")).status,
    });
    expect(await asks(f.requester.agent)).toEqual({ requester: 200, staff: 403 });
    expect(await asks(f.staff.agent)).toEqual({ requester: 403, staff: 200 });
    expect(await asks(f.admin.agent)).toEqual({ requester: 403, staff: 200 });
    expect((await f.requester.agent.get("/api/dashboard/staff")).body.error).toBe("FORBIDDEN");

    const anonymous = { requester: (await request(app).get("/api/dashboard/requester")).status, staff: (await request(app).get("/api/dashboard/staff")).status };
    expect(anonymous).toEqual({ requester: 401, staff: 401 });

    for (const role of ["REQUESTER", "IT_STAFF"] as const) {
      const firstLogin = await createAndLoginUser({ role, mustChangePassword: true });
      const res = await firstLogin.agent.get(role === "REQUESTER" ? "/api/dashboard/requester" : "/api/dashboard/staff");
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("PASSWORD_CHANGE_REQUIRED");
    }
  });

  it("SEC-05: every Lab 4 endpoint (Actions and dashboards) answers 401 without a session", async () => {
    const t = await makeTicket(f);
    const a = await insertAction(t.id, f.staff.user.id, f.staff.user.id);
    const calls = [
      request(app).get(`/api/tickets/${t.id}/actions`),
      request(app).post(`/api/staff/tickets/${t.id}/actions`).send(actionBody(f.staff.user.id)),
      request(app).patch(`/api/staff/tickets/${t.id}/actions/${a.id}`).send({ expectedVersion: 1, description: "x" }),
      request(app).get("/api/dashboard/requester"),
      request(app).get("/api/dashboard/staff"),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("UNAUTHENTICATED");
    }
  });
});
