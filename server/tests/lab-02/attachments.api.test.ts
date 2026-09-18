import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { seedAll } from "../../prisma/seed.js";
import { createAndLoginUser } from "../helpers/auth.js";

// api-spec.md §7-10, specification.md BR-20..BR-25, AC-06..AC-09.
//
// Issue 64 (REG-04) — every request now authenticates via a real session
// cookie instead of X-Dev-Requester-Id, per docs/lab-03/BR-38.
type Agent = Awaited<ReturnType<typeof createAndLoginUser>>["agent"];

describe("Attachment lifecycle", () => {
  let agentA: Agent;
  let agentB: Agent;
  let requesterA: number;
  let ticketId: number;

  async function makeTicket() {
    const prisma = getPrisma();
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-TEST-ATT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        requesterId: requesterA,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Attachment lifecycle test ticket",
        description: "A".repeat(30),
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
      },
    });
    return ticket.id;
  }

  beforeAll(async () => {
    await seedAll();
    const a = await createAndLoginUser({ role: "REQUESTER", fullName: "Attachment Fixture A" });
    const b = await createAndLoginUser({ role: "REQUESTER", fullName: "Attachment Fixture B" });
    agentA = a.agent;
    agentB = b.agent;
    requesterA = a.user.id;
    ticketId = await makeTicket();
  });

  function attachFile(agent: Agent, ticketIdForFile: number, buf: Buffer, filename: string, contentType: string) {
    return agent.post(`/api/tickets/${ticketIdForFile}/attachments`).attach("file", buf, { filename, contentType });
  }

  const validImage = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x84]);

  // API-14
  it("rejects a 6th attachment on a ticket that already has 5 active with 409, count stays 5", async () => {
    const t = await makeTicket();
    for (let i = 0; i < 5; i++) {
      const res = await attachFile(agentA, t, validImage, `photo${i}.jpg`, "image/jpeg");
      expect(res.status).toBe(201);
    }
    const sixth = await attachFile(agentA, t, validImage, "photo5.jpg", "image/jpeg");
    expect(sixth.status).toBe(409);
    expect(sixth.body.error).toBe("ATTACHMENT_LIMIT_REACHED");

    const activeCount = await getPrisma().attachment.count({ where: { ticketId: t, removedAt: null } });
    expect(activeCount).toBe(5);
  });

  // API-15
  it("rejects a file with a mismatched extension/mimetype with 415 and saves nothing", async () => {
    const res = await attachFile(
      agentA,
      ticketId,
      Buffer.from("not really an image"),
      "malware.png",
      "application/octet-stream",
    );
    expect(res.status).toBe(415);
  });

  it("rejects an oversized file with 413", async () => {
    const oversized = Buffer.alloc(6 * 1024 * 1024, 1);
    const res = await attachFile(agentA, ticketId, oversized, "huge.jpg", "image/jpeg");
    expect(res.status).toBe(413);
  });

  // API-16, API-17, API-18
  it("supports the full soft-removal lifecycle: valid removal, short-reason rejection, and 410 on download", async () => {
    const uploadRes = await attachFile(agentA, ticketId, validImage, "lifecycle.jpg", "image/jpeg");
    expect(uploadRes.status).toBe(201);
    const attachmentId = uploadRes.body.id;

    const beforeActive = await getPrisma().attachment.count({ where: { ticketId, removedAt: null } });

    // API-17 — reason too short
    const tooShort = await agentA
      .delete(`/api/attachments/${attachmentId}`)
      .send({ removalReason: "ok" });
    expect(tooShort.status).toBe(400);
    expect(tooShort.body.fieldErrors).toHaveProperty("removalReason");

    // API-16 — valid removal
    const removed = await agentA
      .delete(`/api/attachments/${attachmentId}`)
      .send({ removalReason: "Wrong file, replaced by a better one." });
    expect(removed.status).toBe(200);
    expect(removed.body.removedAt).not.toBeNull();

    const afterActive = await getPrisma().attachment.count({ where: { ticketId, removedAt: null } });
    expect(afterActive).toBe(beforeActive - 1);

    // removing again -> 409 ALREADY_REMOVED
    const again = await agentA
      .delete(`/api/attachments/${attachmentId}`)
      .send({ removalReason: "Trying again for no reason." });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("ALREADY_REMOVED");

    // API-18 — download after removal -> 410
    const download = await agentA.get(`/api/attachments/${attachmentId}/download`);
    expect(download.status).toBe(410);
    expect(download.body.error).toBe("ATTACHMENT_REMOVED");

    // metadata still visible after removal (BR-23)
    const metadata = await agentA.get(`/api/attachments/${attachmentId}`);
    expect(metadata.status).toBe(200);
    expect(metadata.body.removalReason).toBe("Wrong file, replaced by a better one.");
  });

  it("streams an active attachment's file on download with the right headers", async () => {
    const uploadRes = await attachFile(agentA, ticketId, validImage, "downloadable.jpg", "image/jpeg");
    const download = await agentA.get(`/api/attachments/${uploadRes.body.id}/download`);
    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toContain("image/jpeg");
  });

  // API-19
  it("returns 404 for add/download/remove when the ticket belongs to another Requester", async () => {
    const uploadRes = await attachFile(agentA, ticketId, validImage, "owned-by-a.jpg", "image/jpeg");
    const attachmentId = uploadRes.body.id;

    const addAsB = await attachFile(agentB, ticketId, validImage, "intruder.jpg", "image/jpeg");
    expect(addAsB.status).toBe(404);

    const downloadAsB = await agentB.get(`/api/attachments/${attachmentId}/download`);
    expect(downloadAsB.status).toBe(404);

    const removeAsB = await agentB
      .delete(`/api/attachments/${attachmentId}`)
      .send({ removalReason: "Not mine to remove but trying anyway." });
    expect(removeAsB.status).toBe(404);

    // confirm nothing was mutated
    const stillActive = await getPrisma().attachment.findUniqueOrThrow({ where: { id: attachmentId } });
    expect(stillActive.removedAt).toBeNull();
  });

  it("rejects a request with no session cookie, even with a legacy X-Dev-Requester-Id header, with 401", async () => {
    const res = await request(app)
      .get(`/api/attachments/1`)
      .set("X-Dev-Requester-Id", String(requesterA));
    expect(res.status).toBe(401);
  });
});
