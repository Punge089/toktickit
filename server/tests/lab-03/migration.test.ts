import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";

// docs/lab-03/tests.md MIG-01, MIG-02 — specification.md §7 Migration
// Decisions. Builds Lab-2-shaped tables inside a scratch Postgres schema
// ("mig_test"), inserts Lab-2-shaped rows, replays the Lab 3 migration's
// DDL against that same scratch schema, then asserts the data survived
// correctly. Every statement here is explicitly schema-qualified
// (`mig_test."TableName"`) so this test never depends on Prisma's
// runtime schema routing or search_path — only on the raw SQL itself,
// which is the same class of statement the real migration file runs.
const SCHEMA = "mig_test";

async function run(sql: string) {
  await getPrisma().$executeRawUnsafe(sql);
}

async function setUpLab2ShapedSchema() {
  await run(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await run(`CREATE SCHEMA ${SCHEMA}`);

  await run(`CREATE TYPE ${SCHEMA}."Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT')`);
  await run(`CREATE TYPE ${SCHEMA}."TicketStatus" AS ENUM ('NEW')`);

  await run(`
    CREATE TABLE ${SCHEMA}."Category" (
      "id" SERIAL PRIMARY KEY,
      "name" TEXT NOT NULL UNIQUE,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE ${SCHEMA}."RelatedSystem" (
      "id" SERIAL PRIMARY KEY,
      "name" TEXT NOT NULL UNIQUE,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE ${SCHEMA}."RequesterUser" (
      "id" SERIAL PRIMARY KEY,
      "fullName" TEXT NOT NULL,
      "email" TEXT NOT NULL UNIQUE,
      "department" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE ${SCHEMA}."Ticket" (
      "id" SERIAL PRIMARY KEY,
      "ticketNumber" TEXT NOT NULL UNIQUE,
      "requesterId" INTEGER NOT NULL REFERENCES ${SCHEMA}."RequesterUser"("id"),
      "categoryId" INTEGER NOT NULL REFERENCES ${SCHEMA}."Category"("id"),
      "relatedSystemId" INTEGER NOT NULL REFERENCES ${SCHEMA}."RelatedSystem"("id"),
      "summary" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "requestedPriority" ${SCHEMA}."Priority" NOT NULL,
      "itPriority" ${SCHEMA}."Priority",
      "currentStatus" ${SCHEMA}."TicketStatus" NOT NULL DEFAULT 'NEW',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE ${SCHEMA}."Attachment" (
      "id" SERIAL PRIMARY KEY,
      "ticketId" INTEGER NOT NULL REFERENCES ${SCHEMA}."Ticket"("id"),
      "originalFilename" TEXT NOT NULL,
      "storedFilename" TEXT NOT NULL UNIQUE,
      "mimeType" TEXT NOT NULL,
      "sizeBytes" INTEGER NOT NULL,
      "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "uploadedById" INTEGER NOT NULL REFERENCES ${SCHEMA}."RequesterUser"("id"),
      "removedAt" TIMESTAMP(3),
      "removedById" INTEGER REFERENCES ${SCHEMA}."RequesterUser"("id"),
      "removalReason" TEXT
    )
  `);
}

async function insertLab2ShapedData() {
  await run(`INSERT INTO ${SCHEMA}."Category" ("name") VALUES ('Hardware')`);
  await run(`INSERT INTO ${SCHEMA}."RelatedSystem" ("name") VALUES ('Corporate Laptop')`);
  await run(`
    INSERT INTO ${SCHEMA}."RequesterUser" ("fullName", "email", "department")
    VALUES ('Legacy Requester', 'legacy.requester@example.dev', 'Registrar')
  `);
  await run(`
    INSERT INTO ${SCHEMA}."RequesterUser" ("fullName", "email", "department")
    VALUES ('Legacy Remover', 'legacy.remover@example.dev', 'IT Services')
  `);
  await run(`
    INSERT INTO ${SCHEMA}."Ticket"
      ("ticketNumber", "requesterId", "categoryId", "relatedSystemId", "summary", "description", "requestedPriority")
    SELECT 'TKT-MIGTEST-0001', r."id", c."id", rs."id", 'Legacy ticket', 'A legacy Lab 2 ticket with no IT Priority yet.', 'HIGH'
    FROM ${SCHEMA}."RequesterUser" r, ${SCHEMA}."Category" c, ${SCHEMA}."RelatedSystem" rs
    WHERE r."email" = 'legacy.requester@example.dev'
  `);
  await run(`
    INSERT INTO ${SCHEMA}."Attachment"
      ("ticketId", "originalFilename", "storedFilename", "mimeType", "sizeBytes", "uploadedById", "removedById", "removedAt", "removalReason")
    SELECT t."id", 'evidence.png', 'stored-evidence.png', 'image/png', 1024, up."id", rm."id", now(), 'Replaced by a clearer screenshot'
    FROM ${SCHEMA}."Ticket" t, ${SCHEMA}."RequesterUser" up, ${SCHEMA}."RequesterUser" rm
    WHERE t."ticketNumber" = 'TKT-MIGTEST-0001'
      AND up."email" = 'legacy.requester@example.dev'
      AND rm."email" = 'legacy.remover@example.dev'
  `);
}

// The same operations the real migration
// (prisma/migrations/20260918085111_lab3_users_roles_workflow/migration.sql)
// performs, schema-qualified to mig_test instead of the default schema.
async function applyLab3MigrationToScratchSchema() {
  await run(`ALTER TABLE ${SCHEMA}."RequesterUser" RENAME TO "User"`);
  await run(`ALTER TABLE ${SCHEMA}."User" RENAME CONSTRAINT "RequesterUser_pkey" TO "User_pkey"`);

  await run(`CREATE TYPE ${SCHEMA}."Role" AS ENUM ('REQUESTER', 'IT_STAFF', 'ADMINISTRATOR')`);
  await run(`
    ALTER TABLE ${SCHEMA}."User"
      ADD COLUMN "role" ${SCHEMA}."Role" NOT NULL DEFAULT 'REQUESTER',
      ADD COLUMN "passwordHash" TEXT,
      ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  `);

  for (const value of [
    "OPEN",
    "IN_PROGRESS",
    "WAITING_FOR_REQUESTER",
    "RESOLVED",
    "CLOSED",
    "REOPENED",
    "CANCELLED",
  ]) {
    await run(`ALTER TYPE ${SCHEMA}."TicketStatus" ADD VALUE '${value}'`);
  }

  await run(`
    ALTER TABLE ${SCHEMA}."Ticket"
      ADD COLUMN "ownerId" INTEGER,
      ADD COLUMN "resolutionSummary" TEXT,
      ADD COLUMN "requesterResolvedAt" TIMESTAMP(3)
  `);
  await run(`UPDATE ${SCHEMA}."Ticket" SET "itPriority" = "requestedPriority" WHERE "itPriority" IS NULL`);
  await run(`ALTER TABLE ${SCHEMA}."Ticket" ALTER COLUMN "itPriority" SET NOT NULL`);
  await run(
    `ALTER TABLE ${SCHEMA}."Ticket" ADD CONSTRAINT "mig_test_Ticket_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES ${SCHEMA}."User"("id")`,
  );
}

beforeAll(async () => {
  await setUpLab2ShapedSchema();
  await insertLab2ShapedData();
  await applyLab3MigrationToScratchSchema();
});

afterAll(async () => {
  await run(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
});

describe("Lab 3 migration (RequesterUser -> User, itPriority backfill)", () => {
  it("keeps the Ticket pointing at the same migrated User row by email (MIG-01)", async () => {
    const rows = await getPrisma().$queryRawUnsafe<{ email: string; role: string }[]>(`
      SELECT u."email", u."role"
      FROM ${SCHEMA}."Ticket" t
      JOIN ${SCHEMA}."User" u ON u."id" = t."requesterId"
      WHERE t."ticketNumber" = 'TKT-MIGTEST-0001'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("legacy.requester@example.dev");
    expect(rows[0].role).toBe("REQUESTER"); // safe default for every migrated Lab 2 row
  });

  it("backfills itPriority from requestedPriority and makes it NOT NULL (MIG-02)", async () => {
    const rows = await getPrisma().$queryRawUnsafe<{ requestedPriority: string; itPriority: string }[]>(`
      SELECT "requestedPriority", "itPriority" FROM ${SCHEMA}."Ticket" WHERE "ticketNumber" = 'TKT-MIGTEST-0001'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].itPriority).toBe(rows[0].requestedPriority);
    expect(rows[0].itPriority).toBe("HIGH");
  });

  it("keeps the Attachment's uploader and remover pointing at the correct migrated Users (MIG-01)", async () => {
    const rows = await getPrisma().$queryRawUnsafe<{ uploader: string; remover: string; reason: string }[]>(`
      SELECT up."email" AS uploader, rm."email" AS remover, a."removalReason" AS reason
      FROM ${SCHEMA}."Attachment" a
      JOIN ${SCHEMA}."User" up ON up."id" = a."uploadedById"
      JOIN ${SCHEMA}."User" rm ON rm."id" = a."removedById"
      WHERE a."storedFilename" = 'stored-evidence.png'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].uploader).toBe("legacy.requester@example.dev");
    expect(rows[0].remover).toBe("legacy.remover@example.dev");
    expect(rows[0].reason).toBe("Replaced by a clearer screenshot");
  });

  it("leaves a migrated User's passwordHash null until explicitly set", async () => {
    const rows = await getPrisma().$queryRawUnsafe<{ passwordHash: string | null; mustChangePassword: boolean }[]>(`
      SELECT "passwordHash", "mustChangePassword" FROM ${SCHEMA}."User" WHERE "email" = 'legacy.requester@example.dev'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].passwordHash).toBeNull();
    expect(rows[0].mustChangePassword).toBe(true);
  });

  it("every existing Ticket keeps its original NEW status untouched by the new enum values", async () => {
    const rows = await getPrisma().$queryRawUnsafe<{ currentStatus: string }[]>(`
      SELECT "currentStatus" FROM ${SCHEMA}."Ticket" WHERE "ticketNumber" = 'TKT-MIGTEST-0001'
    `);
    expect(rows[0].currentStatus).toBe("NEW");
  });
});
