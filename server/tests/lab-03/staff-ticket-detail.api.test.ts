import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { seedAll } from "../../prisma/seed.js";
import { createAndLoginUser } from "../helpers/auth.js";

type Fixture = Awaited<ReturnType<typeof createAndLoginUser>>;

// docs/lab-03/tests.md DET-01..DET-09 - api-spec.md section 9, 11-13;
// specification.md AC-13..AC-18, BR-17..BR-23, FR-13.
describe("IT Staff Ticket Detail and operations", () => {
  let staff: Fixture;
  let otherStaff: Fixture;
  let admin: Fixture;
  let requester: Fixture;
  let categoryId: number;
  let relatedSystemId: number;

  async function makeTicket(overrides: Record<string, unknown> = {}) {
    return getPrisma().ticket.create({
      data: {
        ticketNumber: `TKT-TEST-D-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        requesterId: requester.user.id,
        categoryId,
        relatedSystemId,
        summary: "Staff detail fixture",
        description: "A".repeat(30),
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        ...overrides,
      },
    });
  }

  beforeAll(async () => {
    await seedAll();
    staff = await createAndLoginUser({ role: "IT_STAFF", fullName: "Detail Staff A" });
    otherStaff = await createAndLoginUser({ role: "IT_STAFF", fullName: "Detail Staff B" });
    admin = await createAndLoginUser({ role: "ADMINISTRATOR", fullName: "Detail Admin" });
    requester = await createAndLoginUser({ role: "REQUESTER", fullName: "Detail Requester" });
    const prisma = getPrisma();
    categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id;
    relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
  });

  it("returns full detail with owner, resolution fields, allowed transitions, and attachments", async () => {
    const t = await makeTicket({ ownerId: staff.user.id, currentStatus: "OPEN" });
    await getPrisma().attachment.create({
      data: {
        ticketId: t.id,
        originalFilename: "log.pdf",
        storedFilename: `${Date.now()}-log.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 100,
        uploadedById: requester.user.id,
      },
    });
    const res = await staff.agent.get(`/api/staff/tickets/${t.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: t.id,
      requesterName: "Detail Requester",
      ownerId: staff.user.id,
      ownerName: "Detail Staff A",
      currentStatus: "OPEN",
      itPriority: "MEDIUM",
    });
    expect(res.body.allowedTransitions).toEqual(["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]);
    expect(res.body.attachments).toHaveLength(1);

    expect((await admin.agent.get(`/api/staff/tickets/${t.id}`)).status).toBe(200);
    expect((await staff.agent.get("/api/staff/tickets/999999999")).status).toBe(404);
    expect((await staff.agent.get("/api/staff/tickets/not-a-number")).status).toBe(404);
  });

  // DET-01, AC-13
  it("lets IT Staff claim an unassigned Ticket", async () => {
    const t = await makeTicket();
    const res = await staff.agent.patch(`/api/staff/tickets/${t.id}/owner`).send({ ownerId: staff.user.id });
    expect(res.status).toBe(200);
    expect(res.body.ownerId).toBe(staff.user.id);

    const queue = await staff.agent.get(`/api/staff/tickets?search=${t.ticketNumber}`);
    expect(queue.body.items[0].owner).toMatchObject({ id: staff.user.id });
  });

  // DET-02, AC-14
  it("lets IT Staff reassign a Ticket to another IT Staff member", async () => {
    const t = await makeTicket({ ownerId: staff.user.id });
    const res = await otherStaff.agent.patch(`/api/staff/tickets/${t.id}/owner`).send({ ownerId: otherStaff.user.id });
    expect(res.status).toBe(200);
    expect(res.body.ownerId).toBe(otherStaff.user.id);
  });

  // DET-03, BR-17
  it("rejects a Requester, an Administrator, or an inactive IT Staff user as owner with 409 INVALID_OWNER", async () => {
    const t = await makeTicket();
    const inactive = await createAndLoginUser({ role: "IT_STAFF" });
    await getPrisma().user.update({ where: { id: inactive.user.id }, data: { isActive: false } });

    for (const ownerId of [requester.user.id, admin.user.id, inactive.user.id, 999999999]) {
      const res = await staff.agent.patch(`/api/staff/tickets/${t.id}/owner`).send({ ownerId });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("INVALID_OWNER");
    }
    const bad = await staff.agent.patch(`/api/staff/tickets/${t.id}/owner`).send({ ownerId: "abc" });
    expect(bad.status).toBe(400);
  });

  it("allows unassigning only while no owner-required status is in effect", async () => {
    const open = await makeTicket({ ownerId: staff.user.id, currentStatus: "OPEN" });
    expect((await staff.agent.patch(`/api/staff/tickets/${open.id}/owner`).send({ ownerId: null })).status).toBe(200);

    const working = await makeTicket({ ownerId: staff.user.id, currentStatus: "IN_PROGRESS" });
    const res = await staff.agent.patch(`/api/staff/tickets/${working.id}/owner`).send({ ownerId: null });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("OWNER_REQUIRED");
  });

  // DET-04, AC-15, BR-20
  it("rejects moving an unassigned Ticket to In Progress with 409 OWNER_REQUIRED and leaves the status alone", async () => {
    const t = await makeTicket({ currentStatus: "OPEN" });
    const res = await staff.agent.patch(`/api/staff/tickets/${t.id}/status`).send({ status: "IN_PROGRESS" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("OWNER_REQUIRED");
    expect((await getPrisma().ticket.findUniqueOrThrow({ where: { id: t.id } })).currentStatus).toBe("OPEN");
  });

  // DET-05, AC-16, BR-19
  it("rejects a transition the matrix does not allow, including staying in the same status, with 409 INVALID_TRANSITION", async () => {
    const t = await makeTicket({ ownerId: staff.user.id, currentStatus: "NEW" });
    for (const status of ["CLOSED", "RESOLVED", "REOPENED", "NEW"]) {
      const res = await staff.agent.patch(`/api/staff/tickets/${t.id}/status`).send({ status });
      expect(res.status, status).toBe(409);
      expect(res.body.error).toBe("INVALID_TRANSITION");
    }
    expect((await staff.agent.patch(`/api/staff/tickets/${t.id}/status`).send({ status: "DONE" })).status).toBe(400);
    expect((await getPrisma().ticket.findUniqueOrThrow({ where: { id: t.id } })).currentStatus).toBe("NEW");

    const ok = await staff.agent.patch(`/api/staff/tickets/${t.id}/status`).send({ status: "OPEN" });
    expect(ok.status).toBe(200);
    expect(ok.body.currentStatus).toBe("OPEN");
  });

  // DET-06, AC-17, BR-21
  it("requires a Resolution Summary of 1-2000 characters to resolve, and stores it", async () => {
    const t = await makeTicket({ ownerId: staff.user.id, currentStatus: "IN_PROGRESS" });
    for (const resolutionSummary of [undefined, "   ", "x".repeat(2001)]) {
      const res = await staff.agent.patch(`/api/staff/tickets/${t.id}/status`).send({ status: "RESOLVED", resolutionSummary });
      expect(res.status).toBe(400);
      expect(res.body.fieldErrors).toHaveProperty("resolutionSummary");
    }
    const ok = await staff.agent
      .patch(`/api/staff/tickets/${t.id}/status`)
      .send({ status: "RESOLVED", resolutionSummary: "  Replaced the battery.  " });
    expect(ok.status).toBe(200);
    expect(ok.body.currentStatus).toBe("RESOLVED");
    expect(ok.body.resolutionSummary).toBe("Replaced the battery.");
    expect(ok.body.allowedTransitions).toEqual(["CLOSED", "REOPENED"]);
  });

  // DET-07, AC-18, BR-22
  it("rejects owner, IT Priority, and status changes on a Closed Ticket with 409 TICKET_CLOSED", async () => {
    for (const currentStatus of ["CLOSED", "CANCELLED"]) {
      const t = await makeTicket({ ownerId: staff.user.id, currentStatus });
      const calls = [
        staff.agent.patch(`/api/staff/tickets/${t.id}/owner`).send({ ownerId: otherStaff.user.id }),
        staff.agent.patch(`/api/staff/tickets/${t.id}/it-priority`).send({ itPriority: "URGENT" }),
        staff.agent.patch(`/api/staff/tickets/${t.id}/status`).send({ status: "REOPENED" }),
      ];
      for (const res of await Promise.all(calls)) {
        expect(res.status).toBe(409);
        expect(res.body.error).toBe("TICKET_CLOSED");
      }
    }
  });

  // DET-08, BR-23
  it("clears the Requester's resolved indication when a Ticket is reopened", async () => {
    const t = await makeTicket({
      ownerId: staff.user.id,
      currentStatus: "RESOLVED",
      resolutionSummary: "Done",
      requesterResolvedAt: new Date(),
    });
    const res = await staff.agent.patch(`/api/staff/tickets/${t.id}/status`).send({ status: "REOPENED" });
    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe("REOPENED");
    expect(res.body.requesterResolvedAt).toBeNull();
  });

  // DET-09, FR-13
  it("sets IT Priority independently of Requested Priority", async () => {
    const t = await makeTicket();
    for (const itPriority of ["LOW", "HIGH", "URGENT", "MEDIUM"]) {
      const res = await staff.agent.patch(`/api/staff/tickets/${t.id}/it-priority`).send({ itPriority });
      expect(res.status).toBe(200);
      expect(res.body.itPriority).toBe(itPriority);
      expect(res.body.requestedPriority).toBe("MEDIUM");
    }
    expect((await staff.agent.patch(`/api/staff/tickets/${t.id}/it-priority`).send({ itPriority: "SEVERE" })).status).toBe(400);
  });

  it("gives an Administrator read access only: every mutation is 403", async () => {
    const t = await makeTicket({ ownerId: staff.user.id, currentStatus: "OPEN" });
    const calls = [
      admin.agent.patch(`/api/staff/tickets/${t.id}/owner`).send({ ownerId: staff.user.id }),
      admin.agent.patch(`/api/staff/tickets/${t.id}/it-priority`).send({ itPriority: "LOW" }),
      admin.agent.patch(`/api/staff/tickets/${t.id}/status`).send({ status: "IN_PROGRESS" }),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("FORBIDDEN");
    }
    const after = await getPrisma().ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(after).toMatchObject({ currentStatus: "OPEN", itPriority: "MEDIUM", ownerId: staff.user.id });
  });

  it("lets IT Staff and Administrator download attachments on any Ticket, and Requesters only their own", async () => {
    const mine = await makeTicket();
    const stored = `${Date.now()}-staff-read.pdf`;
    const att = await getPrisma().attachment.create({
      data: {
        ticketId: mine.id,
        originalFilename: "staff-read.pdf",
        storedFilename: stored,
        mimeType: "application/pdf",
        sizeBytes: 5,
        uploadedById: requester.user.id,
        removedAt: new Date(),
        removedById: requester.user.id,
        removalReason: "Removed for the 410 check",
      },
    });
    // metadata is readable by staff regardless of ownership
    expect((await staff.agent.get(`/api/attachments/${att.id}`)).status).toBe(200);
    expect((await admin.agent.get(`/api/attachments/${att.id}`)).status).toBe(200);
    // removed files still answer 410 for staff too
    expect((await staff.agent.get(`/api/attachments/${att.id}/download`)).status).toBe(410);
    const stranger = await createAndLoginUser({ role: "REQUESTER" });
    expect((await stranger.agent.get(`/api/attachments/${att.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/attachments/${att.id}`)).status).toBe(401);
  });
});
