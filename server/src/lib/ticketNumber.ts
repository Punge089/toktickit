import { Prisma } from "@prisma/client";

// Issue 26 — BR-01: TKT-YYYY-NNNNNN, generated inside the same transaction
// that inserts the Ticket, via a per-year TicketCounter row, so concurrent
// creations in the same year can never collide.
export async function nextTicketNumber(
  tx: Prisma.TransactionClient,
  now: Date = new Date(),
): Promise<string> {
  const year = now.getUTCFullYear();

  const counter = await tx.ticketCounter.upsert({
    where: { year },
    create: { year, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
  });

  const sequence = String(counter.lastValue).padStart(6, "0");
  return `TKT-${year}-${sequence}`;
}
