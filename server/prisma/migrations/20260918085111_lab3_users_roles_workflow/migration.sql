-- Lab 3, Issue 63: RequesterUser -> User, roles, sessions, workflow fields.
-- Additive only (docs/lab-03/specification.md §7 Migration Decisions):
-- no table is dropped, no existing row is rewritten to an incompatible
-- shape. Every existing Ticket/Attachment foreign key keeps pointing at
-- the same physical rows because the identity table is renamed, not
-- dropped and recreated.

-- RenameTable
ALTER TABLE "RequesterUser" RENAME TO "User";
ALTER TABLE "User" RENAME CONSTRAINT "RequesterUser_pkey" TO "User_pkey";
ALTER INDEX "RequesterUser_email_key" RENAME TO "User_email_key";
ALTER SEQUENCE "RequesterUser_id_seq" RENAME TO "User_id_seq";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('REQUESTER', 'IT_STAFF', 'ADMINISTRATOR');

-- AlterTable
-- Every existing row was a Lab 2 Requester, so `role` defaults to
-- REQUESTER. `passwordHash` starts NULL (that user cannot log in until an
-- Administrator or the documented seed migration sets one); `mustChangePassword`
-- defaults to true so nobody enters the app on a password they never chose.
ALTER TABLE "User"
  ADD COLUMN "role" "Role" NOT NULL DEFAULT 'REQUESTER',
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- AlterEnum
-- labsheet §4.5 requires all 8 statuses. Every existing Ticket keeps
-- currentStatus = 'NEW' unchanged; no row in this migration is ever set to
-- one of these new values, so adding them is safe inside this migration's
-- transaction (PostgreSQL only forbids *using* a value added earlier in the
-- same transaction, not adding it).
ALTER TYPE "TicketStatus" ADD VALUE 'OPEN';
ALTER TYPE "TicketStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "TicketStatus" ADD VALUE 'WAITING_FOR_REQUESTER';
ALTER TYPE "TicketStatus" ADD VALUE 'RESOLVED';
ALTER TYPE "TicketStatus" ADD VALUE 'CLOSED';
ALTER TYPE "TicketStatus" ADD VALUE 'REOPENED';
ALTER TYPE "TicketStatus" ADD VALUE 'CANCELLED';

-- AlterTable
-- Ticket ownership, resolution evidence, and the Requester's own
-- "problem appears resolved" signal (BR-05, BR-17, BR-21, BR-23).
ALTER TABLE "Ticket"
  ADD COLUMN "ownerId" INTEGER,
  ADD COLUMN "resolutionSummary" TEXT,
  ADD COLUMN "requesterResolvedAt" TIMESTAMP(3);

-- Backfill IT Priority from Requested Priority on every existing Ticket
-- (labsheet §4 migration risk table) before the column becomes required.
UPDATE "Ticket" SET "itPriority" = "requestedPriority" WHERE "itPriority" IS NULL;

ALTER TABLE "Ticket" ALTER COLUMN "itPriority" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Ticket_currentStatus_createdAt_idx" ON "Ticket"("currentStatus", "createdAt");
CREATE INDEX "Ticket_ownerId_idx" ON "Ticket"("ownerId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Session" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PublicComment" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublicComment_ticketId_createdAt_idx" ON "PublicComment"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "InternalNote" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InternalNote_ticketId_createdAt_idx" ON "InternalNote"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
