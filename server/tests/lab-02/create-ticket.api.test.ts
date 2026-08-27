import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { seedAll } from "../../prisma/seed.js";

// api-spec.md §4, specification.md BR-01..BR-04, BR-14..BR-19.
describe("POST /api/tickets", () => {
  let activeRequesterId: number;
  let inactiveRequesterId: number;
  let categoryId: number;
  let relatedSystemId: number;

  beforeAll(async () => {
    await seedAll();
    const prisma = getPrisma();
    const activeRequester = await prisma.requesterUser.findFirstOrThrow({ where: { isActive: true } });
    const inactiveRequester = await prisma.requesterUser.findFirstOrThrow({ where: { isActive: false } });
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
    activeRequesterId = activeRequester.id;
    inactiveRequesterId = inactiveRequester.id;
    categoryId = category.id;
    relatedSystemId = relatedSystem.id;
  });

  function validFields() {
    return {
      summary: "Laptop battery drains quickly",
      description:
        "The battery on my corporate laptop drains from full to empty within about two hours of normal use.",
      categoryId: String(categoryId),
      relatedSystemId: String(relatedSystemId),
      requestedPriority: "MEDIUM",
    };
  }

  // API-01
  it("creates a Ticket with valid data and returns 201 with a Ticket Number", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validFields());

    expect(res.status).toBe(201);
    expect(res.body.ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);
    expect(res.body.currentStatus).toBe("NEW");

    const saved = await getPrisma().ticket.findUnique({ where: { id: res.body.id } });
    expect(saved).not.toBeNull();
    expect(saved?.currentStatus).toBe("NEW");
    expect(saved?.requesterId).toBe(activeRequesterId);
  });

  // API-02
  it("rejects a missing summary with 400, a fieldErrors entry, and creates nothing", async () => {
    const before = await getPrisma().ticket.count();
    const fields = validFields();
    const { summary: _drop, ...withoutSummary } = fields;

    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(withoutSummary);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_FAILED");
    expect(res.body.fieldErrors).toHaveProperty("summary");

    const after = await getPrisma().ticket.count();
    expect(after).toBe(before);
  });

  // API-03
  it("enforces the summary length boundary: 4 chars rejected, 5 accepted, 121 rejected, 120 accepted", async () => {
    const tooShort = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field({ ...validFields(), summary: "abcd" });
    expect(tooShort.status).toBe(400);

    const minOk = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field({ ...validFields(), summary: "abcde" });
    expect(minOk.status).toBe(201);

    const tooLong = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field({ ...validFields(), summary: "a".repeat(121) });
    expect(tooLong.status).toBe(400);

    const maxOk = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field({ ...validFields(), summary: "a".repeat(120) });
    expect(maxOk.status).toBe(201);
  });

  // API-04
  it("rejects a categoryId referencing an inactive Category with 400", async () => {
    const inactiveCategory = await getPrisma().category.create({
      data: { name: `Deprecated ${Date.now()}`, isActive: false },
    });

    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field({ ...validFields(), categoryId: String(inactiveCategory.id) });

    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty("categoryId");
  });

  // API-05
  it("rejects an inactive Requester with 403", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(inactiveRequesterId))
      .field(validFields());

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("REQUESTER_INACTIVE");
  });

  it("rejects a missing X-Dev-Requester-Id header with 400", async () => {
    const res = await request(app).post("/api/tickets").field(validFields());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("MISSING_REQUESTER");
  });

  // API-06
  it("still creates the Ticket when one of two attachments is oversized, reporting it in attachmentErrors", async () => {
    const oversized = Buffer.alloc(6 * 1024 * 1024, 1); // 6MB > 5MB limit
    const validImage = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x84]);

    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validFields())
      .attach("attachments", validImage, { filename: "photo.jpg", contentType: "image/jpeg" })
      .attach("attachments", oversized, { filename: "huge.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(201);
    expect(res.body.attachments).toHaveLength(1);
    expect(res.body.attachments[0].originalFilename).toBe("photo.jpg");
    expect(res.body.attachmentErrors).toHaveLength(1);
    expect(res.body.attachmentErrors[0].originalFilename).toBe("huge.jpg");
    expect(res.body.attachmentErrors[0].reason).toBe("SIZE");

    const saved = await getPrisma().ticket.findUnique({ where: { id: res.body.id } });
    expect(saved).not.toBeNull();
  });
});
