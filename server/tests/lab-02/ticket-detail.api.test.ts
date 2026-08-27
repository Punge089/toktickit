import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { seedAll } from "../../prisma/seed.js";

// api-spec.md §6, specification.md BR-10, BR-28, FR-05, AC-03.
describe("GET /api/tickets/:id", () => {
  let requesterA: number;
  let requesterB: number;
  let ownedTicketId: number;

  beforeAll(async () => {
    await seedAll();
    const prisma = getPrisma();
    const requesters = await prisma.requesterUser.findMany({ where: { isActive: true }, take: 2 });
    requesterA = requesters[0].id;
    requesterB = requesters[1].id;
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-TEST-DETAIL-${Date.now()}`,
        requesterId: requesterA,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Detail-endpoint test ticket",
        description: "A".repeat(30),
        requestedPriority: "MEDIUM",
      },
    });
    ownedTicketId = ticket.id;

    await prisma.attachment.create({
      data: {
        ticketId: ownedTicketId,
        originalFilename: "evidence.pdf",
        storedFilename: `${Date.now()}-evidence.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 12345,
        uploadedById: requesterA,
      },
    });
  });

  // API-13
  it("returns full detail, including nested attachments, for an owned Ticket", async () => {
    const res = await request(app)
      .get(`/api/tickets/${ownedTicketId}`)
      .set("X-Dev-Requester-Id", String(requesterA));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ownedTicketId);
    expect(res.body.requesterId).toBe(requesterA);
    expect(res.body.attachments).toHaveLength(1);
    expect(res.body.attachments[0].originalFilename).toBe("evidence.pdf");
    expect(res.body.attachments[0].removedAt).toBeNull();
  });

  // API-12
  it("returns 404 for another Requester's Ticket, identical to a nonexistent id", async () => {
    const forOther = await request(app)
      .get(`/api/tickets/${ownedTicketId}`)
      .set("X-Dev-Requester-Id", String(requesterB));
    expect(forOther.status).toBe(404);
    expect(forOther.body).toEqual({ error: "TICKET_NOT_FOUND", message: "Ticket not found." });

    const nonexistent = await request(app)
      .get("/api/tickets/999999999")
      .set("X-Dev-Requester-Id", String(requesterB));
    expect(nonexistent.status).toBe(404);
    expect(nonexistent.body).toEqual(forOther.body);
  });

  it("returns 404 for a non-numeric id rather than throwing", async () => {
    const res = await request(app)
      .get("/api/tickets/not-a-number")
      .set("X-Dev-Requester-Id", String(requesterA));
    expect(res.status).toBe(404);
  });

  it("rejects an inactive Requester with 403", async () => {
    const inactive = await getPrisma().requesterUser.findFirstOrThrow({ where: { isActive: false } });
    const res = await request(app)
      .get(`/api/tickets/${ownedTicketId}`)
      .set("X-Dev-Requester-Id", String(inactive.id));
    expect(res.status).toBe(403);
  });
});
