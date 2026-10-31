import { Prisma } from "@prisma/client";

// Lab 4 — Issue 80/81: every write that depends on the state of a Ticket and
// its Actions (creating or changing an Action, resolving or cancelling the
// Ticket, changing owner or priority) takes this row lock first, so they run
// one after another instead of interleaving (specification.md BR-21). The
// lock is released when the surrounding transaction ends. Returns the Ticket
// as it is after the lock was granted, or null when it does not exist.
export async function lockTicket(tx: Prisma.TransactionClient, ticketId: number) {
  const locked = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Ticket" WHERE "id" = ${ticketId} FOR UPDATE`;
  if (locked.length === 0) return null;
  return tx.ticket.findUniqueOrThrow({ where: { id: ticketId } });
}
