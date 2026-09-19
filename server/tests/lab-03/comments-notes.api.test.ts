import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { seedAll } from "../../prisma/seed.js";
import { createAndLoginUser } from "../helpers/auth.js";

type Fixture = Awaited<ReturnType<typeof createAndLoginUser>>;

// docs/lab-03/tests.md CMT-01..CMT-09, SEC-02, SEC-03, SEC-08 - api-spec.md
// section 6, 7, 14; specification.md AC-04, AC-19..AC-22, BR-04, BR-05,
// BR-22, BR-24..BR-27, BR-36.
describe("Public Comments, Internal Notes, and Problem Appears Resolved", () => {
  let staff: Fixture;
  let admin: Fixture;
  let requester: Fixture;
  let otherRequester: Fixture;
  let categoryId: number;
  let relatedSystemId: number;

  async function makeTicket(overrides: Record<string, unknown> = {}) {
    return getPrisma().ticket.create({
      data: {
        ticketNumber: `TKT-TEST-C-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        requesterId: requester.user.id,
        categoryId,
        relatedSystemId,
        summary: "Comments fixture",
        description: "A".repeat(30),
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        ...overrides,
      },
    });
  }

  beforeAll(async () => {
    await seedAll();
    staff = await createAndLoginUser({ role: "IT_STAFF", fullName: "Comments Staff" });
    admin = await createAndLoginUser({ role: "ADMINISTRATOR", fullName: "Comments Admin" });
    requester = await createAndLoginUser({ role: "REQUESTER", fullName: "Comments Requester" });
    otherRequester = await createAndLoginUser({ role: "REQUESTER", fullName: "Comments Other Requester" });
    const prisma = getPrisma();
    categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id;
    relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
  });

  // CMT-01, AC-19, BR-04
  it("shows a Requester's Public Comment to IT Staff, Administrator, and the Requester, with backend author and time", async () => {
    const t = await makeTicket();
    const posted = await requester.agent.post(`/api/tickets/${t.id}/comments`).send({ body: "Still broken after restart." });
    expect(posted.status).toBe(201);
    expect(posted.body).toMatchObject({ authorName: "Comments Requester", authorRole: "REQUESTER", body: "Still broken after restart." });
    expect(new Date(posted.body.createdAt).getTime()).toBeGreaterThan(Date.now() - 60_000);

    await staff.agent.post(`/api/tickets/${t.id}/comments`).send({ body: "We are looking into it." });

    for (const who of [staff, admin, requester]) {
      const list = await who.agent.get(`/api/tickets/${t.id}/comments`);
      expect(list.status).toBe(200);
      expect(list.body.map((c: { authorRole: string }) => c.authorRole)).toEqual(["REQUESTER", "IT_STAFF"]);
    }
  });

  // CMT-02, AC-20, SEC-03, AC-04
  it("never gives a Requester Internal Note content: 403 on read and write, before the Ticket is even looked up", async () => {
    const t = await makeTicket();
    const secret = `internal-only-${Date.now()}`;
    expect((await staff.agent.post(`/api/staff/tickets/${t.id}/notes`).send({ body: secret })).status).toBe(201);

    const read = await requester.agent.get(`/api/staff/tickets/${t.id}/notes`);
    expect(read.status).toBe(403);
    expect(read.body.error).toBe("FORBIDDEN");
    expect(JSON.stringify(read.body)).not.toContain(secret);

    const write = await requester.agent.post(`/api/staff/tickets/${t.id}/notes`).send({ body: "hello" });
    expect(write.status).toBe(403);

    // identical answer for a Ticket that does not exist, so existence is not revealed (BR-37)
    const missing = await requester.agent.get("/api/staff/tickets/999999999/notes");
    expect(missing.status).toBe(403);

    // and a note never leaks through the public comment list
    const comments = await requester.agent.get(`/api/tickets/${t.id}/comments`);
    expect(JSON.stringify(comments.body)).not.toContain(secret);
  });

  // CMT-03, BR-36
  it("lets an Administrator read Internal Notes but not write them", async () => {
    const t = await makeTicket();
    await staff.agent.post(`/api/staff/tickets/${t.id}/notes`).send({ body: "Checked the firewall." });

    const read = await admin.agent.get(`/api/staff/tickets/${t.id}/notes`);
    expect(read.status).toBe(200);
    expect(read.body).toHaveLength(1);
    expect(read.body[0].authorName).toBe("Comments Staff");

    expect((await admin.agent.post(`/api/staff/tickets/${t.id}/notes`).send({ body: "nope" })).status).toBe(403);
    expect((await admin.agent.post(`/api/tickets/${t.id}/comments`).send({ body: "nope" })).status).toBe(403);
  });

  // CMT-04, BR-25
  it("rejects empty, whitespace-only, and over-2000-character comments and notes, creating nothing", async () => {
    const t = await makeTicket();
    for (const body of ["", "   \n ", "x".repeat(2001), undefined, 42]) {
      const c = await requester.agent.post(`/api/tickets/${t.id}/comments`).send({ body });
      expect(c.status).toBe(400);
      expect(c.body.fieldErrors).toHaveProperty("body");
      const n = await staff.agent.post(`/api/staff/tickets/${t.id}/notes`).send({ body });
      expect(n.status).toBe(400);
    }
    expect(await getPrisma().publicComment.count({ where: { ticketId: t.id } })).toBe(0);
    expect(await getPrisma().internalNote.count({ where: { ticketId: t.id } })).toBe(0);

    const max = await requester.agent.post(`/api/tickets/${t.id}/comments`).send({ body: "y".repeat(2000) });
    expect(max.status).toBe(201);
  });

  // CMT-05, BR-26
  it("stores markup as literal text", async () => {
    const t = await makeTicket();
    const body = "<script>alert(1)</script> and <b>bold</b>";
    const posted = await requester.agent.post(`/api/tickets/${t.id}/comments`).send({ body });
    expect(posted.body.body).toBe(body);
    const list = await staff.agent.get(`/api/tickets/${t.id}/comments`);
    expect(list.body[0].body).toBe(body);
  });

  // CMT-06, BR-27
  it("ignores a spoofed authorId and createdAt in the request body", async () => {
    const t = await makeTicket();
    const res = await requester.agent
      .post(`/api/tickets/${t.id}/comments`)
      .send({ body: "spoof attempt", authorId: staff.user.id, createdAt: "2001-01-01T00:00:00.000Z" });
    expect(res.status).toBe(201);
    expect(res.body.authorId).toBe(requester.user.id);
    expect(new Date(res.body.createdAt).getFullYear()).toBeGreaterThan(2020);
  });

  // CMT-07, AC-21, BR-05
  it("records the Requester's 'problem appears resolved' without changing the formal status", async () => {
    const t = await makeTicket({ currentStatus: "OPEN" });
    const res = await requester.agent.post(`/api/tickets/${t.id}/problem-resolved`);
    expect(res.status).toBe(200);
    expect(res.body.requesterResolvedAt).toBeTruthy();

    const after = await getPrisma().ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.currentStatus).toBe("OPEN");
    expect(after.requesterResolvedAt).not.toBeNull();

    const detail = await requester.agent.get(`/api/tickets/${t.id}`);
    expect(detail.body.requesterResolvedAt).toBeTruthy();
    const queue = await staff.agent.get(`/api/staff/tickets?search=${t.ticketNumber}`);
    expect(queue.body.items[0].requesterResolvedAt).toBeTruthy();
  });

  // CMT-08, AC-22
  it("rejects a second 'problem appears resolved' on the same open period with 409", async () => {
    const t = await makeTicket({ currentStatus: "OPEN" });
    expect((await requester.agent.post(`/api/tickets/${t.id}/problem-resolved`)).status).toBe(200);
    const again = await requester.agent.post(`/api/tickets/${t.id}/problem-resolved`);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("TICKET_NOT_ACTIVE");
  });

  it("does not let a Requester (or anyone else) set Resolved or Closed by any Requester route (BR-05)", async () => {
    const t = await makeTicket({ currentStatus: "OPEN" });
    for (const status of ["RESOLVED", "CLOSED"]) {
      const res = await requester.agent.patch(`/api/staff/tickets/${t.id}/status`).send({ status });
      expect(res.status).toBe(403);
    }
    expect((await getPrisma().ticket.findUniqueOrThrow({ where: { id: t.id } })).currentStatus).toBe("OPEN");
  });

  // CMT-09, BR-22
  it("rejects comments, notes, and problem-resolved on a Closed Ticket with 409", async () => {
    const t = await makeTicket({ currentStatus: "CLOSED", ownerId: staff.user.id, resolutionSummary: "Done" });
    expect((await requester.agent.post(`/api/tickets/${t.id}/comments`).send({ body: "hi" })).status).toBe(409);
    expect((await staff.agent.post(`/api/tickets/${t.id}/comments`).send({ body: "hi" })).status).toBe(409);
    expect((await staff.agent.post(`/api/staff/tickets/${t.id}/notes`).send({ body: "hi" })).status).toBe(409);
    expect((await requester.agent.post(`/api/tickets/${t.id}/problem-resolved`)).status).toBe(409);
    // reading is still allowed
    expect((await requester.agent.get(`/api/tickets/${t.id}/comments`)).status).toBe(200);
  });

  it("does not let problem-resolved be used while the Ticket is already Resolved", async () => {
    const t = await makeTicket({ currentStatus: "RESOLVED", ownerId: staff.user.id, resolutionSummary: "Done" });
    expect((await requester.agent.post(`/api/tickets/${t.id}/problem-resolved`)).status).toBe(409);
  });

  // BR-15 - another Requester's Ticket and a missing one look identical
  it("answers 404 identically for another Requester's Ticket and a Ticket that does not exist", async () => {
    const t = await makeTicket();
    const foreign = await otherRequester.agent.get(`/api/tickets/${t.id}/comments`);
    const missing = await otherRequester.agent.get("/api/tickets/999999999/comments");
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
    expect((await otherRequester.agent.post(`/api/tickets/${t.id}/comments`).send({ body: "hi" })).status).toBe(404);
    expect((await otherRequester.agent.post(`/api/tickets/${t.id}/problem-resolved`)).status).toBe(404);
    expect(await getPrisma().publicComment.count({ where: { ticketId: t.id } })).toBe(0);
  });

  // SEC-02 (detail half) and SEC-08
  it("keeps staff Ticket Detail closed to Requesters (403) while IT Staff can act on any Requester's Ticket", async () => {
    const t = await makeTicket();
    const denied = await requester.agent.get(`/api/staff/tickets/${t.id}`);
    expect(denied.status).toBe(403);
    expect(JSON.stringify(denied.body)).not.toContain(t.ticketNumber);
    expect((await requester.agent.get("/api/staff/tickets/999999999")).status).toBe(403);

    // staff routes never 404 merely because the Ticket belongs to a Requester
    expect((await staff.agent.get(`/api/staff/tickets/${t.id}`)).status).toBe(200);
    expect((await staff.agent.post(`/api/tickets/${t.id}/comments`).send({ body: "staff reply" })).status).toBe(201);
    expect((await staff.agent.post(`/api/staff/tickets/${t.id}/notes`).send({ body: "staff note" })).status).toBe(201);
  });

  it("answers 401 to every new endpoint when there is no session", async () => {
    const calls = [
      request(app).get("/api/staff/tickets/1"),
      request(app).patch("/api/staff/tickets/1/owner").send({ ownerId: 1 }),
      request(app).patch("/api/staff/tickets/1/it-priority").send({ itPriority: "LOW" }),
      request(app).patch("/api/staff/tickets/1/status").send({ status: "OPEN" }),
      request(app).get("/api/staff/tickets/1/notes"),
      request(app).post("/api/staff/tickets/1/notes").send({ body: "x" }),
      request(app).get("/api/tickets/1/comments"),
      request(app).post("/api/tickets/1/comments").send({ body: "x" }),
      request(app).post("/api/tickets/1/problem-resolved"),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  });

  // CMT-10, BR-24: Public Comments and Internal Notes are append-only in Lab 3.
  it("offers no way to edit or delete a Comment or a Note", async () => {
    const t = await makeTicket();
    const comment = await requester.agent.post(`/api/tickets/${t.id}/comments`).send({ body: "Original comment" });
    const note = await staff.agent.post(`/api/staff/tickets/${t.id}/notes`).send({ body: "Original note" });
    expect(comment.status).toBe(201);
    expect(note.status).toBe(201);

    const commentUrl = `/api/tickets/${t.id}/comments/${comment.body.id}`;
    const noteUrl = `/api/staff/tickets/${t.id}/notes/${note.body.id}`;
    for (const res of [
      await requester.agent.patch(commentUrl).send({ body: "Changed" }),
      await requester.agent.put(commentUrl).send({ body: "Changed" }),
      await requester.agent.delete(commentUrl),
      await staff.agent.patch(noteUrl).send({ body: "Changed" }),
      await staff.agent.put(noteUrl).send({ body: "Changed" }),
      await staff.agent.delete(noteUrl),
    ]) {
      expect(res.status).toBe(404); // there is no such route
    }

    const comments = await staff.agent.get(`/api/tickets/${t.id}/comments`);
    expect(comments.body.map((c: { body: string }) => c.body)).toEqual(["Original comment"]);
    const notes = await staff.agent.get(`/api/staff/tickets/${t.id}/notes`);
    expect(notes.body.map((n: { body: string }) => n.body)).toEqual(["Original note"]);
  });
});
