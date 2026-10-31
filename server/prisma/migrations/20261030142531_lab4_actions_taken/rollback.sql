-- Rollback for 20261030142531_lab4_actions_taken (docs/lab-04/specification.md §7).
-- Not run by Prisma: it is applied by hand, or by server/tests/lab-04/migration.test.ts.
-- The migration only adds objects, so removing them returns the Lab 3 shape and
-- leaves every Lab 3 row untouched. Take a pg_dump first: dropping ActionTaken
-- deletes every Action Taken recorded since the migration.
ALTER TABLE "Ticket" DROP COLUMN "version";
DROP TABLE "ActionTaken";
DROP TYPE "ActionStatus";
