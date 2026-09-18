import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { seedAll } from "../../prisma/seed.js";
import { createAndLoginUser } from "../helpers/auth.js";

// api-spec.md §4, specification.md BR-01..BR-04, BR-14..BR-19.
//
// Issue 64 (REG-01) — every request below now authenticates via a real
// session cookie instead of X-Dev-Requester-Id, per docs/lab-03/BR-38.
// The two identity-layer tests at the bottom (inactive session, no
// session) replace the old header-based 403/400 cases with their session
// equivalents; every other test's assertions are unchanged from Lab 2.
describe("POST /api/tickets", () => {
  let agent: Awaited<ReturnType<typeof createAndLoginUser>>["agent"];
  let requesterId: number;
  let categoryId: number;
  let relatedSystemId: number;

  beforeAll(async () => {
    await seedAll();
    const fixture = await createAndLoginUser({ role: "REQUESTER", fullName: "Create Ticket Fixture" });
    agent = fixture.agent;
    requesterId = fixture.user.id;

    const prisma = getPrisma();
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
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
    const res = await agent.post("/api/tickets").field(validFields());

    expect(res.status).toBe(201);
    expect(res.body.ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);
    expect(res.body.currentStatus).toBe("NEW");
    expect(res.body.itPriority).toBe("MEDIUM"); // AC-12 — starts equal to Requested Priority

    const saved = await getPrisma().ticket.findUnique({ where: { id: res.body.id } });
    expect(saved).not.toBeNull();
    expect(saved?.currentStatus).toBe("NEW");
    expect(saved?.requesterId).toBe(requesterId);
  });

  // API-02
  it("rejects a missing summary with 400, a fieldErrors entry, and creates nothing", async () => {
    const before = await getPrisma().ticket.count();
    const fields = validFields();
    const { summary: _drop, ...withoutSummary } = fields;

    const res = await agent.post("/api/tickets").field(withoutSummary);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_FAILED");
    expect(res.body.fieldErrors).toHaveProperty("summary");

    const after = await getPrisma().ticket.count();
    expect(after).toBe(before);
  });

  // API-03
  it("enforces the summary length boundary: 4 chars rejected, 5 accepted, 121 rejected, 120 accepted", async () => {
    const tooShort = await agent.post("/api/tickets").field({ ...validFields(), summary: "abcd" });
    expect(tooShort.status).toBe(400);

    const minOk = await agent.post("/api/tickets").field({ ...validFields(), summary: "abcde" });
    expect(minOk.status).toBe(201);

    const tooLong = await agent.post("/api/tickets").field({ ...validFields(), summary: "a".repeat(121) });
    expect(tooLong.status).toBe(400);

    const maxOk = await agent.post("/api/tickets").field({ ...validFields(), summary: "a".repeat(120) });
    expect(maxOk.status).toBe(201);
  });

  // API-04
  it("rejects a categoryId referencing an inactive Category with 400", async () => {
    const inactiveCategory = await getPrisma().category.create({
      data: { name: `Deprecated ${Date.now()}`, isActive: false },
    });

    const res = await agent
      .post("/api/tickets")
      .field({ ...validFields(), categoryId: String(inactiveCategory.id) });

    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty("categoryId");
  });

  // API-05 (adapted) — a session belonging to a since-deactivated user is
  // rejected. Lab 2 tested "inactive Requester -> 403 REQUESTER_INACTIVE"
  // via the header; the session equivalent is that resolveSession()
  // refuses an inactive user's session outright (401), since an inactive
  // user cannot even establish one via login in the first place
  // (auth.api.test.ts API-03 covers that half).
  it("rejects a request whose session belongs to a since-deactivated user (401)", async () => {
    const { agent: staleAgent, user } = await createAndLoginUser({ role: "REQUESTER" });
    await getPrisma().user.update({ where: { id: user.id }, data: { isActive: false } });

    const res = await staleAgent.post("/api/tickets").field(validFields());
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("UNAUTHENTICATED");
  });

  // Adapted from Lab 2's "missing X-Dev-Requester-Id header -> 400". The
  // header is sent anyway here specifically to prove BR-39: it is no
  // longer honored as an identity source at all.
  it("rejects a request with no session cookie, even with a legacy X-Dev-Requester-Id header, with 401", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(requesterId))
      .field(validFields());
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("UNAUTHENTICATED");
  });

  // API-06
  it("still creates the Ticket when one of two attachments is oversized, reporting it in attachmentErrors", async () => {
    const oversized = Buffer.alloc(6 * 1024 * 1024, 1); // 6MB > 5MB limit
    const validImage = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x84]);

    const res = await agent
      .post("/api/tickets")
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

  // Non-Requester role is rejected (BR-38 regression + role boundary).
  it("rejects an IT Staff session with 403 FORBIDDEN", async () => {
    const { agent: staffAgent } = await createAndLoginUser({ role: "IT_STAFF" });
    const res = await staffAgent.post("/api/tickets").field(validFields());
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("FORBIDDEN");
  });
});
