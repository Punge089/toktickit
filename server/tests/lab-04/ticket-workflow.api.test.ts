import { describe, it, expect, beforeAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { Lab4Fixtures, actionBody, insertAction, makeTicket, setUpLab4Fixtures } from "../helpers/lab4.js";

// docs/lab-04/tests.md WF-01..WF-11 - api-spec.md §4, §5; specification.md
// BR-12, BR-17, BR-19 to BR-26, FR-06 to FR-09, FR-11.
describe("Ticket workflow", () => {
  let f: Lab4Fixtures;

  const versionOf = async (id: number) => (await getPrisma().ticket.findUniqueOrThrow({ where: { id } })).version;
  const setStatus = async (agent: Lab4Fixtures["staff"]["agent"], id: number, body: Record<string, unknown>) =>
    agent.patch(`/api/staff/tickets/${id}/status`).send({ expectedVersion: await versionOf(id), ...body });
  const resolve = (id: number, summary = "Fixed and confirmed.") => setStatus(f.staff.agent, id, { status: "RESOLVED", resolutionSummary: summary });
  const working = (overrides: Record<string, unknown> = {}) =>
    makeTicket(f, { ownerId: f.staff.user.id, currentStatus: "IN_PROGRESS", ...overrides });

  beforeAll(async () => {
    f = await setUpLab4Fixtures("Workflow");
  });

  it("WF-01: resolving through the API is blocked while an Action is Planned or In Progress", async () => {
    const t = await working();
    const planned = await insertAction(t.id, f.staff.user.id, f.staff.user.id, { actionStatus: "PLANNED" });
    const started = await insertAction(t.id, f.staff.user.id, f.staff.user.id, { actionStatus: "IN_PROGRESS" });

    const none = await resolve(t.id);
    expect(none.status).toBe(409);
    expect(none.body).toMatchObject({ error: "RESOLUTION_BLOCKED", blockers: ["OPEN_ACTIONS", "NO_COMPLETED_ACTION"] });
    expect([...none.body.openActionIds].sort()).toEqual([planned.id, started.id].sort());

    await insertAction(t.id, f.staff.user.id, f.staff.user.id, { actionStatus: "COMPLETED", result: "Done." });
    const withDone = await resolve(t.id);
    expect(withDone.status).toBe(409);
    expect(withDone.body.blockers).toEqual(["OPEN_ACTIONS"]);

    const after = await getPrisma().ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(after).toMatchObject({ currentStatus: "IN_PROGRESS", version: 1, resolutionSummary: null });
  });

  it("WF-02: resolving needs a Completed Action, and succeeds once the gate is met", async () => {
    const t = await working();
    const first = await resolve(t.id);
    expect(first.status).toBe(409);
    expect(first.body.blockers).toEqual(["NO_COMPLETED_ACTION"]);
    expect(first.body.openActionIds).toEqual([]);

    await insertAction(t.id, f.staff.user.id, f.staff.user.id, { actionStatus: "CANCELLED", result: "Not needed." });
    expect((await resolve(t.id)).body.blockers).toEqual(["NO_COMPLETED_ACTION"]); // Cancelled does not count

    await insertAction(t.id, f.staff.user.id, f.staff.user.id, { actionStatus: "COMPLETED", result: "Done." });
    const ok = await resolve(t.id);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ currentStatus: "RESOLVED", version: 2, resolutionSummary: "Fixed and confirmed." });
  });

  it("WF-03: a resolve and an Action create sent at the same moment never leave a Resolved Ticket with an open Action", async () => {
    for (let round = 0; round < 12; round++) {
      const t = await working();
      await insertAction(t.id, f.staff.user.id, f.staff.user.id, { actionStatus: "COMPLETED", result: "Done." });
      const version = await versionOf(t.id);
      const [resolved, created] = await Promise.all([
        f.staff.agent.patch(`/api/staff/tickets/${t.id}/status`).send({ status: "RESOLVED", resolutionSummary: "Fixed.", expectedVersion: version }),
        f.otherStaff.agent.post(`/api/staff/tickets/${t.id}/actions`).send(actionBody(f.otherStaff.user.id)),
      ]);

      // Exactly one order happened: either the Action landed first (resolve is
      // blocked) or the resolve landed first (the Action is locked out).
      const resolveFirst = resolved.status === 200 && created.status === 409 && created.body.error === "ACTIONS_LOCKED";
      const actionFirst = created.status === 201 && resolved.status === 409 && resolved.body.error === "RESOLUTION_BLOCKED";
      expect(resolveFirst || actionFirst, `round ${round}: ${resolved.status}/${created.status}`).toBe(true);

      const ticket = await getPrisma().ticket.findUniqueOrThrow({ where: { id: t.id }, include: { actions: true } });
      const open = ticket.actions.filter((a) => a.actionStatus === "PLANNED" || a.actionStatus === "IN_PROGRESS");
      expect(ticket.currentStatus === "RESOLVED" && open.length > 0, `round ${round} left a Resolved Ticket with an open Action`).toBe(false);
    }
  });

  it("WF-04: cancelling a Ticket cancels its open Actions in the same step and leaves Completed ones alone", async () => {
    const t = await working();
    const other = await working();
    const otherPlanned = await insertAction(other.id, f.staff.user.id, f.staff.user.id);
    const planned = await insertAction(t.id, f.staff.user.id, f.staff.user.id, { actionStatus: "PLANNED" });
    const started = await insertAction(t.id, f.staff.user.id, f.staff.user.id, { actionStatus: "IN_PROGRESS", result: "Halfway there." });
    const done = await insertAction(t.id, f.staff.user.id, f.staff.user.id, { actionStatus: "COMPLETED", result: "Done." });

    // A stale cancel changes nothing, Actions included.
    const stale = await f.staff.agent.patch(`/api/staff/tickets/${t.id}/status`).send({ status: "CANCELLED", expectedVersion: 99 });
    expect(stale.status).toBe(409);
    expect((await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: planned.id } })).actionStatus).toBe("PLANNED");

    const res = await setStatus(f.staff.agent, t.id, { status: "CANCELLED" });
    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe("CANCELLED");
    expect(res.body.actionCounts).toEqual({ open: 0, completed: 1, cancelled: 2 });

    const rows = await getPrisma().actionTaken.findMany({ where: { ticketId: t.id }, orderBy: { id: "asc" } });
    expect(rows.map((r) => r.id)).toEqual([planned.id, started.id, done.id]);
    expect(rows[0]).toMatchObject({ actionStatus: "CANCELLED", version: 2, result: "Cancelled automatically because the Ticket was cancelled." });
    expect(rows[1]).toMatchObject({ actionStatus: "CANCELLED", version: 2, result: "Halfway there." });
    expect(rows[2]).toMatchObject({ actionStatus: "COMPLETED", version: 1, result: "Done." });
    expect((await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: otherPlanned.id } })).actionStatus).toBe("PLANNED");
  });

  it("WF-05: legacy Resolved and Closed Tickets with no Actions stay valid and invent no Action", async () => {
    const legacyResolved = await makeTicket(f, { ownerId: f.staff.user.id, currentStatus: "RESOLVED", resolutionSummary: "Fixed in Lab 3." });
    const legacyClosed = await makeTicket(f, { ownerId: f.staff.user.id, currentStatus: "CLOSED", resolutionSummary: "Fixed in Lab 3." });

    const closed = await setStatus(f.staff.agent, legacyResolved.id, { status: "CLOSED" });
    expect(closed.status).toBe(200);
    expect(closed.body.currentStatus).toBe("CLOSED");
    expect(closed.body.resolutionBlockers).toEqual([]);

    const detail = await f.staff.agent.get(`/api/staff/tickets/${legacyClosed.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ currentStatus: "CLOSED", actionCounts: { open: 0, completed: 0, cancelled: 0 }, resolutionBlockers: [] });

    const queue = await f.staff.agent.get(`/api/staff/tickets?search=${legacyClosed.ticketNumber}&status=CLOSED`);
    expect(queue.body.items.map((i: { id: number }) => i.id)).toEqual([legacyClosed.id]);
    expect(await getPrisma().actionTaken.count({ where: { ticketId: { in: [legacyResolved.id, legacyClosed.id] } } })).toBe(0);
  });

  it("WF-06: owner, IT Priority and status changes need a current expectedVersion", async () => {
    const t = await makeTicket(f, { currentStatus: "OPEN" });
    const changes: Array<[string, Record<string, unknown>]> = [
      ["owner", { ownerId: f.staff.user.id }],
      ["it-priority", { itPriority: "HIGH" }],
      ["status", { status: "CANCELLED" }],
    ];

    for (const [kind, body] of changes) {
      const missing = await f.staff.agent.patch(`/api/staff/tickets/${t.id}/${kind}`).send(body);
      expect(missing.status, `${kind} missing`).toBe(400);
      expect(missing.body.fieldErrors.expectedVersion).toBeDefined();
      for (const bad of ["1", 1.5, null]) {
        const res = await f.staff.agent.patch(`/api/staff/tickets/${t.id}/${kind}`).send({ ...body, expectedVersion: bad });
        expect(res.status, `${kind} ${String(bad)}`).toBe(400);
      }
    }
    expect(await versionOf(t.id)).toBe(1);

    for (const [kind, body] of changes.slice(0, 2)) {
      const stale = await f.staff.agent.patch(`/api/staff/tickets/${t.id}/${kind}`).send({ ...body, expectedVersion: 99 });
      expect(stale.status, `${kind} stale`).toBe(409);
      expect(stale.body).toMatchObject({ error: "STALE_VERSION", currentVersion: 1 });
    }
    const untouched = await getPrisma().ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(untouched).toMatchObject({ ownerId: null, itPriority: "MEDIUM", currentStatus: "OPEN", version: 1 });

    const owner = await f.staff.agent.patch(`/api/staff/tickets/${t.id}/owner`).send({ ownerId: f.staff.user.id, expectedVersion: 1 });
    expect(owner.status).toBe(200);
    expect(owner.body.version).toBe(2);
    const priority = await f.staff.agent.patch(`/api/staff/tickets/${t.id}/it-priority`).send({ itPriority: "HIGH", expectedVersion: 2 });
    expect(priority.body).toMatchObject({ itPriority: "HIGH", version: 3 });
    const reused = await f.otherStaff.agent.patch(`/api/staff/tickets/${t.id}/owner`).send({ ownerId: f.otherStaff.user.id, expectedVersion: 1 });
    expect(reused.status).toBe(409);
    expect(reused.body.currentVersion).toBe(3);

    // Two simultaneous changes from the same version: one wins, one is stale.
    const [a, b] = await Promise.all([
      f.staff.agent.patch(`/api/staff/tickets/${t.id}/it-priority`).send({ itPriority: "LOW", expectedVersion: 3 }),
      f.otherStaff.agent.patch(`/api/staff/tickets/${t.id}/it-priority`).send({ itPriority: "URGENT", expectedVersion: 3 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await versionOf(t.id)).toBe(4);
  });

  it("WF-07: the Requester's 'problem appears resolved' neither changes the status nor satisfies the gate", async () => {
    const t = await working();
    await insertAction(t.id, f.staff.user.id, f.staff.user.id, { actionStatus: "PLANNED" });
    const flag = await f.requester.agent.post(`/api/tickets/${t.id}/problem-resolved`);
    expect(flag.status).toBe(200);

    const after = await getPrisma().ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(after).toMatchObject({ currentStatus: "IN_PROGRESS", version: 1 });
    expect(after.requesterResolvedAt).not.toBeNull();

    const blocked = await resolve(t.id);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe("RESOLUTION_BLOCKED");
  });

  it("WF-08: Resolved locks Actions, Reopened unlocks them, and the gate applies again on the second resolve", async () => {
    const t = await working();
    await insertAction(t.id, f.staff.user.id, f.staff.user.id, { actionStatus: "COMPLETED", result: "First fix." });
    expect((await resolve(t.id)).status).toBe(200);

    const locked = await f.staff.agent.post(`/api/staff/tickets/${t.id}/actions`).send(actionBody(f.staff.user.id));
    expect(locked.status).toBe(409);
    expect(locked.body.error).toBe("ACTIONS_LOCKED");

    const reopened = await setStatus(f.staff.agent, t.id, { status: "REOPENED" });
    expect(reopened.status).toBe(200);
    const added = await f.staff.agent.post(`/api/staff/tickets/${t.id}/actions`).send(actionBody(f.staff.user.id));
    expect(added.status).toBe(201);

    const blocked = await resolve(t.id, "Second attempt.");
    expect(blocked.status).toBe(409);
    expect(blocked.body.blockers).toEqual(["OPEN_ACTIONS"]);

    const completed = await f.staff.agent
      .patch(`/api/staff/tickets/${t.id}/actions/${added.body.id}`)
      .send({ expectedVersion: 1, actionStatus: "COMPLETED", result: "Second fix." });
    expect(completed.status).toBe(200);
    const again = await resolve(t.id, "Second attempt.");
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ currentStatus: "RESOLVED", resolutionSummary: "Second attempt." });
  });

  it("WF-09: when several checks fail at once, the first one in the documented order answers", async () => {
    const open = await makeTicket(f, { currentStatus: "OPEN" });
    const status = (id: number, body: Record<string, unknown>) =>
      f.staff.agent.patch(`/api/staff/tickets/${id}/status`).send(body);

    // 400 beats 404.
    expect((await status(999999999, { status: "NOPE", expectedVersion: 1 })).status).toBe(400);
    expect((await status(999999999, { status: "OPEN", expectedVersion: 1 })).status).toBe(404);
    // 404 beats stale.
    // Stale beats an invalid transition.
    const staleAndInvalid = await status(open.id, { status: "CLOSED", expectedVersion: 7 });
    expect(staleAndInvalid.body.error).toBe("STALE_VERSION");
    // Stale beats a terminal Ticket; a current version on a terminal Ticket is TICKET_CLOSED.
    const closed = await makeTicket(f, { currentStatus: "CLOSED", ownerId: f.staff.user.id });
    expect((await status(closed.id, { status: "REOPENED", expectedVersion: 7 })).body.error).toBe("STALE_VERSION");
    expect((await status(closed.id, { status: "REOPENED", expectedVersion: 1 })).body.error).toBe("TICKET_CLOSED");
    // An invalid transition beats a missing Resolution Summary.
    expect((await status(open.id, { status: "CLOSED", expectedVersion: 1 })).body.error).toBe("INVALID_TRANSITION");
    // A missing Resolution Summary (400) beats a missing owner.
    expect((await status(open.id, { status: "RESOLVED", expectedVersion: 1 })).status).toBe(400);
    // A missing owner beats an open Action.
    await insertAction(open.id, f.staff.user.id, f.staff.user.id, { actionStatus: "PLANNED" });
    const noOwner = await status(open.id, { status: "RESOLVED", resolutionSummary: "x", expectedVersion: 1 });
    expect(noOwner.status).toBe(409);
    expect(noOwner.body.error).toBe("OWNER_REQUIRED");
  });

  it("WF-10: a successful status change returns the new status, version and allowed transitions in matrix order", async () => {
    const t = await makeTicket(f, { currentStatus: "OPEN", ownerId: f.staff.user.id });
    const toProgress = await setStatus(f.staff.agent, t.id, { status: "IN_PROGRESS" });
    expect(toProgress.status).toBe(200);
    expect(toProgress.body).toMatchObject({ currentStatus: "IN_PROGRESS", version: 2 });
    expect(toProgress.body.allowedTransitions).toEqual(["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]);

    const toWaiting = await setStatus(f.staff.agent, t.id, { status: "WAITING_FOR_REQUESTER" });
    expect(toWaiting.body.allowedTransitions).toEqual(["IN_PROGRESS", "RESOLVED", "CANCELLED"]);
    expect(toWaiting.body.version).toBe(3);
  });

  it("WF-11: the staff Ticket Detail reports version, action counts and resolution blockers that match the Actions", async () => {
    const t = await working();
    const empty = await f.staff.agent.get(`/api/staff/tickets/${t.id}`);
    expect(empty.body).toMatchObject({ version: 1, actionCounts: { open: 0, completed: 0, cancelled: 0 }, resolutionBlockers: ["NO_COMPLETED_ACTION"] });

    await insertAction(t.id, f.staff.user.id, f.staff.user.id, { actionStatus: "PLANNED" });
    await insertAction(t.id, f.staff.user.id, f.staff.user.id, { actionStatus: "IN_PROGRESS" });
    const mixed = await f.admin.agent.get(`/api/staff/tickets/${t.id}`);
    expect(mixed.status).toBe(200);
    expect(mixed.body.actionCounts).toEqual({ open: 2, completed: 0, cancelled: 0 });
    expect(mixed.body.resolutionBlockers).toEqual(["OPEN_ACTIONS", "NO_COMPLETED_ACTION"]);

    await getPrisma().actionTaken.updateMany({ where: { ticketId: t.id }, data: { actionStatus: "COMPLETED", result: "ok" } });
    const ready = await f.staff.agent.get(`/api/staff/tickets/${t.id}`);
    expect(ready.body).toMatchObject({ actionCounts: { open: 0, completed: 2, cancelled: 0 }, resolutionBlockers: [] });

    // Where Resolved is not a permitted move, there is nothing to explain.
    const waitingNew = await makeTicket(f, { currentStatus: "NEW" });
    expect((await f.staff.agent.get(`/api/staff/tickets/${waitingNew.id}`)).body.resolutionBlockers).toEqual([]);
    const closed = await makeTicket(f, { currentStatus: "CLOSED" });
    expect((await f.staff.agent.get(`/api/staff/tickets/${closed.id}`)).body.resolutionBlockers).toEqual([]);
  });
});
