import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";

// docs/lab-04/tests.md MIG-01, MIG-02 - specification.md §7 Migration, backfill
// and recovery. Unlike the Lab 3 migration test, which re-typed the DDL, this one
// reads the real migration.sql and rollback.sql from disk and runs them against
// a scratch Postgres schema holding Lab-3-shaped data, so a change to either
// file is what the test exercises.
const SCHEMA = "mig4_test";
const MIGRATION_DIR = path.resolve(process.cwd(), "prisma/migrations/20261030142531_lab4_actions_taken");

function statements(file: string): string[] {
  return readFileSync(path.join(MIGRATION_DIR, file), "utf-8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Unqualified names in the SQL files resolve to the scratch schema because
// search_path is set for the transaction; "public" is left out on purpose so a
// statement that missed the scratch schema would fail loudly.
async function applyFile(file: string) {
  await getPrisma().$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO ${SCHEMA}`);
    for (const sql of statements(file)) await tx.$executeRawUnsafe(sql);
  });
}

async function run(sql: string) {
  await getPrisma().$executeRawUnsafe(sql);
}

async function rows<T>(sql: string) {
  return getPrisma().$queryRawUnsafe<T[]>(sql);
}

async function setUpLab3ShapedSchema() {
  await run(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await run(`CREATE SCHEMA ${SCHEMA}`);
  await run(`CREATE TYPE ${SCHEMA}."Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT')`);
  await run(
    `CREATE TYPE ${SCHEMA}."TicketStatus" AS ENUM ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','RESOLVED','CLOSED','REOPENED','CANCELLED')`,
  );
  await run(`CREATE TYPE ${SCHEMA}."Role" AS ENUM ('REQUESTER', 'IT_STAFF', 'ADMINISTRATOR')`);
  await run(`CREATE TABLE ${SCHEMA}."Category" ("id" SERIAL PRIMARY KEY, "name" TEXT NOT NULL UNIQUE)`);
  await run(`CREATE TABLE ${SCHEMA}."RelatedSystem" ("id" SERIAL PRIMARY KEY, "name" TEXT NOT NULL UNIQUE)`);
  await run(`
    CREATE TABLE ${SCHEMA}."User" (
      "id" SERIAL PRIMARY KEY, "fullName" TEXT NOT NULL, "email" TEXT NOT NULL UNIQUE, "department" TEXT,
      "role" ${SCHEMA}."Role" NOT NULL DEFAULT 'REQUESTER', "passwordHash" TEXT,
      "mustChangePassword" BOOLEAN NOT NULL DEFAULT true, "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  await run(`
    CREATE TABLE ${SCHEMA}."Ticket" (
      "id" SERIAL PRIMARY KEY, "ticketNumber" TEXT NOT NULL UNIQUE,
      "requesterId" INTEGER NOT NULL REFERENCES ${SCHEMA}."User"("id"),
      "categoryId" INTEGER NOT NULL REFERENCES ${SCHEMA}."Category"("id"),
      "relatedSystemId" INTEGER NOT NULL REFERENCES ${SCHEMA}."RelatedSystem"("id"),
      "summary" TEXT NOT NULL, "description" TEXT NOT NULL,
      "requestedPriority" ${SCHEMA}."Priority" NOT NULL, "itPriority" ${SCHEMA}."Priority" NOT NULL,
      "currentStatus" ${SCHEMA}."TicketStatus" NOT NULL DEFAULT 'NEW',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "ownerId" INTEGER REFERENCES ${SCHEMA}."User"("id"), "resolutionSummary" TEXT, "requesterResolvedAt" TIMESTAMP(3)
    )`);
  await run(`
    CREATE TABLE ${SCHEMA}."Attachment" (
      "id" SERIAL PRIMARY KEY, "ticketId" INTEGER NOT NULL REFERENCES ${SCHEMA}."Ticket"("id"),
      "originalFilename" TEXT NOT NULL, "storedFilename" TEXT NOT NULL UNIQUE, "mimeType" TEXT NOT NULL,
      "sizeBytes" INTEGER NOT NULL, "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "uploadedById" INTEGER NOT NULL REFERENCES ${SCHEMA}."User"("id"),
      "removedAt" TIMESTAMP(3), "removedById" INTEGER REFERENCES ${SCHEMA}."User"("id"), "removalReason" TEXT
    )`);
  await run(`
    CREATE TABLE ${SCHEMA}."PublicComment" (
      "id" SERIAL PRIMARY KEY, "ticketId" INTEGER NOT NULL REFERENCES ${SCHEMA}."Ticket"("id"),
      "authorId" INTEGER NOT NULL REFERENCES ${SCHEMA}."User"("id"), "body" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  await run(`
    CREATE TABLE ${SCHEMA}."InternalNote" (
      "id" SERIAL PRIMARY KEY, "ticketId" INTEGER NOT NULL REFERENCES ${SCHEMA}."Ticket"("id"),
      "authorId" INTEGER NOT NULL REFERENCES ${SCHEMA}."User"("id"), "body" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
}

async function insertLab3ShapedData() {
  await run(`INSERT INTO ${SCHEMA}."Category" ("name") VALUES ('Hardware')`);
  await run(`INSERT INTO ${SCHEMA}."RelatedSystem" ("name") VALUES ('Corporate Laptop')`);
  await run(`
    INSERT INTO ${SCHEMA}."User" ("fullName", "email", "role", "passwordHash", "mustChangePassword") VALUES
      ('Lab3 Requester', 'lab3.requester@example.dev', 'REQUESTER', 'hash-r', false),
      ('Lab3 Staff', 'lab3.staff@example.dev', 'IT_STAFF', 'hash-s', false),
      ('Lab3 Admin', 'lab3.admin@example.dev', 'ADMINISTRATOR', 'hash-a', false)`);
  for (const [number, status] of [
    ["TKT-MIG4-0001", "NEW"],
    ["TKT-MIG4-0002", "IN_PROGRESS"],
    ["TKT-MIG4-0003", "RESOLVED"],
    ["TKT-MIG4-0004", "CLOSED"],
  ]) {
    await run(`
      INSERT INTO ${SCHEMA}."Ticket"
        ("ticketNumber", "requesterId", "categoryId", "relatedSystemId", "summary", "description",
         "requestedPriority", "itPriority", "currentStatus", "ownerId", "resolutionSummary")
      SELECT '${number}', r."id", c."id", rs."id", 'Legacy ${number}', 'A Lab 3 ticket.', 'HIGH', 'MEDIUM',
             '${status}', CASE WHEN '${status}' = 'NEW' THEN NULL ELSE s."id" END,
             CASE WHEN '${status}' IN ('RESOLVED','CLOSED') THEN 'Fixed in Lab 3' ELSE NULL END
      FROM ${SCHEMA}."User" r, ${SCHEMA}."User" s, ${SCHEMA}."Category" c, ${SCHEMA}."RelatedSystem" rs
      WHERE r."email" = 'lab3.requester@example.dev' AND s."email" = 'lab3.staff@example.dev'`);
  }
  await run(`
    INSERT INTO ${SCHEMA}."Attachment" ("ticketId", "originalFilename", "storedFilename", "mimeType", "sizeBytes", "uploadedById")
    SELECT t."id", 'evidence.png', 'mig4-stored.png', 'image/png', 2048, u."id"
    FROM ${SCHEMA}."Ticket" t, ${SCHEMA}."User" u
    WHERE t."ticketNumber" = 'TKT-MIG4-0002' AND u."email" = 'lab3.requester@example.dev'`);
  await run(`
    INSERT INTO ${SCHEMA}."PublicComment" ("ticketId", "authorId", "body")
    SELECT t."id", u."id", 'Public comment from Lab 3'
    FROM ${SCHEMA}."Ticket" t, ${SCHEMA}."User" u
    WHERE t."ticketNumber" = 'TKT-MIG4-0002' AND u."email" = 'lab3.requester@example.dev'`);
  await run(`
    INSERT INTO ${SCHEMA}."InternalNote" ("ticketId", "authorId", "body")
    SELECT t."id", u."id", 'Internal note from Lab 3'
    FROM ${SCHEMA}."Ticket" t, ${SCHEMA}."User" u
    WHERE t."ticketNumber" = 'TKT-MIG4-0002' AND u."email" = 'lab3.staff@example.dev'`);
}

// One query that captures every Lab 3 row, so "unchanged" is a single equality.
async function snapshotLab3Rows() {
  const t = (name: string) => `${SCHEMA}."${name}"`;
  return {
    users: await rows(`SELECT "id","fullName","email","role","passwordHash","isActive" FROM ${t("User")} ORDER BY "id"`),
    tickets: await rows(
      `SELECT "id","ticketNumber","requesterId","ownerId","summary","currentStatus","itPriority","resolutionSummary","createdAt","updatedAt" FROM ${t("Ticket")} ORDER BY "id"`,
    ),
    attachments: await rows(`SELECT "id","ticketId","originalFilename","storedFilename","sizeBytes","uploadedById" FROM ${t("Attachment")} ORDER BY "id"`),
    comments: await rows(`SELECT "id","ticketId","authorId","body" FROM ${t("PublicComment")} ORDER BY "id"`),
    notes: await rows(`SELECT "id","ticketId","authorId","body" FROM ${t("InternalNote")} ORDER BY "id"`),
  };
}

async function tableExists(name: string) {
  const r = await rows<{ n: number }>(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = '${SCHEMA}' AND table_name = '${name}'`,
  );
  return r[0].n === 1;
}

async function ticketHasVersionColumn() {
  const r = await rows<{ n: number }>(
    `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = '${SCHEMA}' AND table_name = 'Ticket' AND column_name = 'version'`,
  );
  return r[0].n === 1;
}

let before: Awaited<ReturnType<typeof snapshotLab3Rows>>;

beforeAll(async () => {
  await setUpLab3ShapedSchema();
  await insertLab3ShapedData();
  before = await snapshotLab3Rows();
});

afterAll(async () => {
  await run(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
});

describe("Lab 4 migration (lab4_actions_taken)", () => {
  it("MIG-01: keeps every Lab 3 row unchanged, gives each Ticket version 1, and creates the Action table", async () => {
    expect(before.users).toHaveLength(3);
    expect(before.tickets).toHaveLength(4);
    expect(await tableExists("ActionTaken")).toBe(false);
    expect(await ticketHasVersionColumn()).toBe(false);

    await applyFile("migration.sql");

    expect(await snapshotLab3Rows()).toEqual(before);
    const versions = await rows<{ version: number }>(`SELECT "version" FROM ${SCHEMA}."Ticket"`);
    expect(versions).toHaveLength(4);
    expect(versions.every((v) => v.version === 1)).toBe(true);
    expect(await tableExists("ActionTaken")).toBe(true);
    expect(await rows(`SELECT 1 FROM ${SCHEMA}."ActionTaken"`)).toHaveLength(0);

    // Legacy Resolved and Closed Tickets are valid with zero Actions (BR-23).
    const legacy = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${SCHEMA}."Ticket" t WHERE t."currentStatus" IN ('RESOLVED','CLOSED')
         AND NOT EXISTS (SELECT 1 FROM ${SCHEMA}."ActionTaken" a WHERE a."ticketId" = t."id")`,
    );
    expect(legacy[0].n).toBe(2);
  });

  it("MIG-01: enforces the idempotency key and the foreign keys on the new table", async () => {
    const [{ ticketId, staffId }] = await rows<{ ticketId: number; staffId: number }>(
      `SELECT t."id" AS "ticketId", u."id" AS "staffId" FROM ${SCHEMA}."Ticket" t, ${SCHEMA}."User" u
        WHERE t."ticketNumber" = 'TKT-MIG4-0002' AND u."email" = 'lab3.staff@example.dev'`,
    );
    const insert = (ticket: number, key: string, assignee = staffId) =>
      run(`
        INSERT INTO ${SCHEMA}."ActionTaken" ("ticketId","actionAt","description","performedById","assigneeId","clientRequestId","updatedAt")
        VALUES (${ticket}, now(), 'Fixture', ${staffId}, ${assignee}, '${key}', now())`);

    await insert(ticketId, "key-1");
    await expect(insert(ticketId, "key-1")).rejects.toThrow(); // unique (ticketId, clientRequestId)
    await expect(insert(ticketId, "key-2", 987654321)).rejects.toThrow(); // assignee must exist
    await expect(insert(987654321, "key-3")).rejects.toThrow(); // ticket must exist
    await run(`DELETE FROM ${SCHEMA}."ActionTaken"`);
  });

  it("MIG-02: the rollback SQL removes the Lab 4 objects and leaves every Lab 3 row intact", async () => {
    await applyFile("rollback.sql");

    expect(await tableExists("ActionTaken")).toBe(false);
    expect(await ticketHasVersionColumn()).toBe(false);
    const types = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = '${SCHEMA}' AND t.typname = 'ActionStatus'`,
    );
    expect(types[0].n).toBe(0);
    expect(await snapshotLab3Rows()).toEqual(before);
  });

  it("MIG-02: the migration can be applied again after a rollback", async () => {
    await applyFile("migration.sql");
    expect(await tableExists("ActionTaken")).toBe(true);
    expect(await snapshotLab3Rows()).toEqual(before);
  });
});
