import { describe, it, expect, beforeAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { createUser } from "../helpers/auth.js";
import { Lab4Fixtures, actionBody, insertAction, makeTicket, newKey, setUpLab4Fixtures } from "../helpers/lab4.js";

// docs/lab-04/tests.md API-01..API-16 - api-spec.md §1 to §3; specification.md
// BR-01 to BR-16, BR-18, AC-01, AC-03 to AC-05, AC-09 to AC-15.
describe("Actions Taken API", () => {
  let f: Lab4Fixtures;

  const post = (agent: Lab4Fixtures["staff"]["agent"], ticketId: number, body: Record<string, unknown>) =>
    agent.post(`/api/staff/tickets/${ticketId}/actions`).send(body);
  const patch = (agent: Lab4Fixtures["staff"]["agent"], ticketId: number, actionId: number, body: Record<string, unknown>) =>
    agent.patch(`/api/staff/tickets/${ticketId}/actions/${actionId}`).send(body);

  beforeAll(async () => {
    f = await setUpLab4Fixtures("Actions API");
  });

  it("API-01: creates an Action under the Ticket with the session user as Performed by", async () => {
    const t = await makeTicket(f);
    const res = await post(f.staff.agent, t.id, actionBody(f.otherStaff.user.id, { result: "", attachmentNotes: "Photo in attachments" }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      ticketId: t.id,
      description: "Replaced the laptop battery.",
      actionStatus: "PLANNED",
      version: 1,
      followUpRequired: false,
      followUpNote: null,
      result: null,
      attachmentNotes: "Photo in attachments",
      performedBy: { id: f.staff.user.id, fullName: "Actions API Staff A", isActive: true },
      assignee: { id: f.otherStaff.user.id, fullName: "Actions API Staff B", isActive: true },
    });
    expect(typeof res.body.createdAt).toBe("string");
    const stored = await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(stored.ticketId).toBe(t.id);
    expect(stored.performedById).toBe(f.staff.user.id);
  });

  it("API-02: ignores performedById, createdAt, version and ticketId sent in the body", async () => {
    const t = await makeTicket(f);
    const other = await makeTicket(f);
    const res = await post(
      f.staff.agent,
      t.id,
      actionBody(f.staff.user.id, {
        performedById: f.otherStaff.user.id,
        createdAt: "2001-01-01T00:00:00.000Z",
        version: 99,
        ticketId: other.id,
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.performedBy.id).toBe(f.staff.user.id);
    expect(res.body.ticketId).toBe(t.id);
    expect(res.body.version).toBe(1);
    expect(new Date(res.body.createdAt).getFullYear()).toBeGreaterThan(2020);
    expect(await getPrisma().actionTaken.count({ where: { ticketId: other.id } })).toBe(0);
  });

  it("API-03: rejects an assignee who is inactive, a Requester, an Administrator or does not exist", async () => {
    const t = await makeTicket(f);
    const { user: inactiveStaff } = await createUser({ role: "IT_STAFF", isActive: false });
    const bad = [inactiveStaff.id, f.requester.user.id, f.admin.user.id, 999999999];
    for (const assigneeId of bad) {
      const res = await post(f.staff.agent, t.id, actionBody(assigneeId));
      expect(res.status, `assignee ${assigneeId}`).toBe(409);
      expect(res.body.error).toBe("INVALID_ASSIGNEE");
    }
    expect(await getPrisma().actionTaken.count({ where: { ticketId: t.id } })).toBe(0);

    // Reassigning an existing Action is held to the same rule.
    const created = await post(f.staff.agent, t.id, actionBody(f.staff.user.id));
    for (const assigneeId of bad) {
      const res = await patch(f.staff.agent, t.id, created.body.id, { expectedVersion: 1, assigneeId });
      expect(res.status, `reassign ${assigneeId}`).toBe(409);
      expect(res.body.error).toBe("INVALID_ASSIGNEE");
    }

    // A missing or non-integer assignee is a field error, not a conflict.
    for (const assigneeId of [undefined, "abc", 1.5, null]) {
      const res = await post(f.staff.agent, t.id, actionBody(f.staff.user.id, { assigneeId }));
      expect(res.status, `assigneeId ${String(assigneeId)}`).toBe(400);
      expect(res.body.fieldErrors.assigneeId).toBeDefined();
    }
  });

  it("API-04: requires a follow-up note when follow-up is on and discards one when it is off", async () => {
    const t = await makeTicket(f);
    for (const followUpNote of [undefined, "", "   "]) {
      const res = await post(f.staff.agent, t.id, actionBody(f.staff.user.id, { followUpRequired: true, followUpNote }));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("VALIDATION_FAILED");
      expect(res.body.fieldErrors.followUpNote).toBe("Follow-up Note is required when a follow-up is needed.");
    }
    const off = await post(f.staff.agent, t.id, actionBody(f.staff.user.id, { followUpRequired: false, followUpNote: "ignored" }));
    expect(off.status).toBe(201);
    expect(off.body.followUpNote).toBeNull();

    const on = await post(f.staff.agent, t.id, actionBody(f.staff.user.id, { followUpRequired: true, followUpNote: "Check next week" }));
    expect(on.status).toBe(201);
    expect(on.body).toMatchObject({ followUpRequired: true, followUpNote: "Check next week" });

    // Turning follow-up on in an update without a note is rejected as well.
    const upd = await patch(f.staff.agent, t.id, off.body.id, { expectedVersion: 1, followUpRequired: true });
    expect(upd.status).toBe(400);
    expect(upd.body.fieldErrors.followUpNote).toBeDefined();
    expect((await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: off.body.id } })).version).toBe(1);
  });

  it("API-05: requires a Result to complete or cancel, on create and on update", async () => {
    const t = await makeTicket(f);
    const create = await post(f.staff.agent, t.id, actionBody(f.staff.user.id, { actionStatus: "COMPLETED" }));
    expect(create.status).toBe(400);
    expect(create.body.fieldErrors.result).toBeDefined();
    expect((await post(f.staff.agent, t.id, actionBody(f.staff.user.id, { actionStatus: "COMPLETED", result: "Done." }))).status).toBe(201);

    const open = await post(f.staff.agent, t.id, actionBody(f.staff.user.id));
    for (const actionStatus of ["COMPLETED", "CANCELLED"]) {
      const res = await patch(f.staff.agent, t.id, open.body.id, { expectedVersion: 1, actionStatus });
      expect(res.status, actionStatus).toBe(400);
      expect(res.body.fieldErrors.result).toBeDefined();
    }
    const stored = await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: open.body.id } });
    expect(stored).toMatchObject({ actionStatus: "PLANNED", version: 1 });
  });

  it("API-06: walks Planned, In Progress, Completed and Cancelled, and rejects an invalid pair", async () => {
    const t = await makeTicket(f);
    const a = await post(f.staff.agent, t.id, actionBody(f.staff.user.id));
    const started = await patch(f.staff.agent, t.id, a.body.id, { expectedVersion: 1, actionStatus: "IN_PROGRESS" });
    expect(started.status).toBe(200);
    expect(started.body).toMatchObject({ actionStatus: "IN_PROGRESS", version: 2 });
    const done = await patch(f.staff.agent, t.id, a.body.id, { expectedVersion: 2, actionStatus: "COMPLETED", result: "Fixed." });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ actionStatus: "COMPLETED", version: 3, result: "Fixed." });

    const b = await post(f.staff.agent, t.id, actionBody(f.staff.user.id));
    const cancelled = await patch(f.staff.agent, t.id, b.body.id, { expectedVersion: 1, actionStatus: "CANCELLED", result: "No longer needed." });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ actionStatus: "CANCELLED", version: 2 });

    const c = await post(f.staff.agent, t.id, actionBody(f.staff.user.id, { actionStatus: "IN_PROGRESS" }));
    const same = await patch(f.staff.agent, t.id, c.body.id, { expectedVersion: 1, actionStatus: "IN_PROGRESS" });
    expect(same.status).toBe(409);
    expect(same.body.error).toBe("INVALID_ACTION_TRANSITION");
    const back = await patch(f.staff.agent, t.id, c.body.id, { expectedVersion: 1, actionStatus: "PLANNED" });
    expect(back.status).toBe(409);
    expect(back.body).toMatchObject({ error: "INVALID_ACTION_TRANSITION", message: "Cannot move an action from In Progress to Planned." });
    expect((await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: c.body.id } })).version).toBe(1);

    // CANCELLED is not a valid way to create an Action.
    const bornCancelled = await post(f.staff.agent, t.id, actionBody(f.staff.user.id, { actionStatus: "CANCELLED", result: "x" }));
    expect(bornCancelled.status).toBe(400);
    expect(bornCancelled.body.fieldErrors.actionStatus).toBeDefined();
  });

  it("API-07: a Completed or Cancelled Action cannot be changed and cannot be deleted", async () => {
    const t = await makeTicket(f);
    const completed = await insertAction(t.id, f.staff.user.id, f.staff.user.id, { actionStatus: "COMPLETED", result: "Done." });
    const cancelled = await insertAction(t.id, f.staff.user.id, f.staff.user.id, { actionStatus: "CANCELLED", result: "Not needed." });
    for (const a of [completed, cancelled]) {
      const res = await patch(f.staff.agent, t.id, a.id, { expectedVersion: 1, description: "Edited after the fact" });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("ACTION_LOCKED");
      const stored = await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: a.id } });
      expect(stored).toMatchObject({ description: "Fixture action", version: 1 });
    }
    const del = await f.staff.agent.delete(`/api/staff/tickets/${t.id}/actions/${completed.id}`);
    expect(del.status).toBe(404);
    expect(await getPrisma().actionTaken.count({ where: { ticketId: t.id } })).toBe(2);
  });

  it("API-08: Resolved, Closed and Cancelled Tickets lock Actions; Reopened allows them again", async () => {
    for (const currentStatus of ["RESOLVED", "CLOSED", "CANCELLED"]) {
      const t = await makeTicket(f, { currentStatus });
      const existing = await insertAction(t.id, f.staff.user.id, f.staff.user.id);
      const created = await post(f.staff.agent, t.id, actionBody(f.staff.user.id));
      expect(created.status, currentStatus).toBe(409);
      expect(created.body.error).toBe("ACTIONS_LOCKED");
      const changed = await patch(f.staff.agent, t.id, existing.id, { expectedVersion: 1, description: "Edit" });
      expect(changed.status, currentStatus).toBe(409);
      expect(changed.body.error).toBe("ACTIONS_LOCKED");
      expect(await getPrisma().actionTaken.count({ where: { ticketId: t.id } })).toBe(1);
    }
    for (const currentStatus of ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"]) {
      const t = await makeTicket(f, { currentStatus });
      expect((await post(f.staff.agent, t.id, actionBody(f.staff.user.id))).status, currentStatus).toBe(201);
    }
  });

  it("API-09: lists Actions by actionAt then id, identically on every call, and an empty Ticket gives zero counts", async () => {
    const t = await makeTicket(f);
    const at = (iso: string) => ({ actionAt: iso });
    const third = await post(f.staff.agent, t.id, actionBody(f.staff.user.id, { ...at("2026-10-03T09:00:00.000Z"), description: "third" }));
    const first = await post(f.staff.agent, t.id, actionBody(f.staff.user.id, { ...at("2026-10-01T09:00:00.000Z"), description: "first" }));
    const tieA = await post(f.staff.agent, t.id, actionBody(f.staff.user.id, { ...at("2026-10-02T09:00:00.000Z"), description: "tie A", actionStatus: "IN_PROGRESS" }));
    const tieB = await post(f.staff.agent, t.id, actionBody(f.staff.user.id, { ...at("2026-10-02T09:00:00.000Z"), description: "tie B", actionStatus: "COMPLETED", result: "ok" }));
    const cancelled = await insertAction(t.id, f.staff.user.id, f.staff.user.id, { actionAt: new Date("2026-10-04T09:00:00.000Z"), actionStatus: "CANCELLED", result: "no" });

    const one = await f.staff.agent.get(`/api/tickets/${t.id}/actions`);
    const two = await f.staff.agent.get(`/api/tickets/${t.id}/actions`);
    expect(one.status).toBe(200);
    expect(one.body.items.map((a: { id: number }) => a.id)).toEqual([first.body.id, tieA.body.id, tieB.body.id, third.body.id, cancelled.id]);
    expect(two.body).toEqual(one.body);
    expect(one.body.counts).toEqual({ open: 3, completed: 1, cancelled: 1 });

    const empty = await makeTicket(f);
    const res = await f.staff.agent.get(`/api/tickets/${empty.id}/actions`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], counts: { open: 0, completed: 0, cancelled: 0 } });

    expect((await f.staff.agent.get("/api/tickets/999999999/actions")).status).toBe(404);
    expect((await f.staff.agent.get("/api/tickets/abc/actions")).status).toBe(404);
  });

  it("API-10: a stale expectedVersion is a 409 with currentVersion; two simultaneous updates cannot both win", async () => {
    const t = await makeTicket(f);
    const a = await post(f.staff.agent, t.id, actionBody(f.staff.user.id));
    const ok = await patch(f.staff.agent, t.id, a.body.id, { expectedVersion: 1, description: "second" });
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(2);

    const stale = await patch(f.otherStaff.agent, t.id, a.body.id, { expectedVersion: 1, description: "stale write" });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: "STALE_VERSION", currentVersion: 2 });
    expect((await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: a.body.id } })).description).toBe("second");

    for (let round = 0; round < 5; round++) {
      const current = (await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: a.body.id } })).version;
      const results = await Promise.all([
        patch(f.staff.agent, t.id, a.body.id, { expectedVersion: current, description: `A round ${round}` }),
        patch(f.otherStaff.agent, t.id, a.body.id, { expectedVersion: current, description: `B round ${round}` }),
      ]);
      expect(results.map((r) => r.status).sort(), `round ${round}`).toEqual([200, 409]);
      const loser = results.find((r) => r.status === 409)!;
      expect(loser.body.error).toBe("STALE_VERSION");
      expect((await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: a.body.id } })).version).toBe(current + 1);
    }
  });

  it("API-11: the same clientRequestId creates one row, in sequence, in parallel, and is refused for another user", async () => {
    const t = await makeTicket(f);
    const key = newKey();
    const body = actionBody(f.staff.user.id, { clientRequestId: key });
    const first = await post(f.staff.agent, t.id, body);
    expect(first.status).toBe(201);
    const again = await post(f.staff.agent, t.id, body);
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);

    const parallelKey = newKey();
    const parallelBody = actionBody(f.staff.user.id, { clientRequestId: parallelKey });
    const results = await Promise.all([1, 2, 3, 4].map(() => post(f.staff.agent, t.id, parallelBody)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 201]);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);

    const stranger = await post(f.otherStaff.agent, t.id, body);
    expect(stranger.status).toBe(409);
    expect(stranger.body.error).toBe("DUPLICATE_REQUEST_KEY");

    expect(await getPrisma().actionTaken.count({ where: { ticketId: t.id } })).toBe(2);

    // The key is scoped to the Ticket: the same key on another Ticket is a new Action.
    const other = await makeTicket(f);
    expect((await post(f.staff.agent, other.id, body)).status).toBe(201);

    // A replay still answers 200 after the Ticket has been locked.
    await getPrisma().ticket.update({ where: { id: t.id }, data: { currentStatus: "RESOLVED" } });
    const afterLock = await post(f.staff.agent, t.id, body);
    expect(afterLock.status).toBe(200);
    expect(afterLock.body.id).toBe(first.body.id);

    // clientRequestId is required and shaped.
    for (const clientRequestId of [undefined, "", "has space", "x".repeat(65), 7]) {
      const res = await post(f.staff.agent, other.id, actionBody(f.staff.user.id, { clientRequestId }));
      expect(res.status, String(clientRequestId)).toBe(400);
      expect(res.body.fieldErrors.clientRequestId).toBeDefined();
    }
  });

  it("API-12: an Action touches the Ticket's updatedAt but not its status, owner, priority or version", async () => {
    const t = await makeTicket(f, { ownerId: f.staff.user.id, currentStatus: "IN_PROGRESS", itPriority: "HIGH" });
    const before = await getPrisma().ticket.findUniqueOrThrow({ where: { id: t.id } });
    await new Promise((r) => setTimeout(r, 15));
    const created = await post(f.staff.agent, t.id, actionBody(f.staff.user.id));
    const afterCreate = await getPrisma().ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(afterCreate.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());

    await new Promise((r) => setTimeout(r, 15));
    await patch(f.staff.agent, t.id, created.body.id, { expectedVersion: 1, description: "changed" });
    const afterUpdate = await getPrisma().ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(afterUpdate.updatedAt.getTime()).toBeGreaterThan(afterCreate.updatedAt.getTime());

    for (const row of [afterCreate, afterUpdate]) {
      expect(row).toMatchObject({ currentStatus: "IN_PROGRESS", ownerId: f.staff.user.id, itPriority: "HIGH", version: before.version });
    }
  });

  it("API-13: an unchanged assignee deactivated later is accepted; changing to an inactive user is not", async () => {
    const t = await makeTicket(f);
    const { user: leaver } = await createUser({ role: "IT_STAFF" });
    const { user: otherLeaver } = await createUser({ role: "IT_STAFF" });
    const a = await post(f.staff.agent, t.id, actionBody(leaver.id));
    expect(a.status).toBe(201);
    await getPrisma().user.updateMany({ where: { id: { in: [leaver.id, otherLeaver.id] } }, data: { isActive: false } });

    const same = await patch(f.staff.agent, t.id, a.body.id, { expectedVersion: 1, assigneeId: leaver.id, description: "still fine" });
    expect(same.status).toBe(200);
    expect(same.body.assignee).toMatchObject({ id: leaver.id, isActive: false });

    const changed = await patch(f.staff.agent, t.id, a.body.id, { expectedVersion: 2, assigneeId: otherLeaver.id });
    expect(changed.status).toBe(409);
    expect(changed.body.error).toBe("INVALID_ASSIGNEE");

    const away = await patch(f.staff.agent, t.id, a.body.id, { expectedVersion: 2, assigneeId: f.otherStaff.user.id });
    expect(away.status).toBe(200);
    expect(away.body.assignee.id).toBe(f.otherStaff.user.id);
  });

  it("API-14: a missing expectedVersion is 400, an Action of another Ticket is ACTION_NOT_FOUND, an unknown Ticket is 404", async () => {
    const t = await makeTicket(f);
    const other = await makeTicket(f);
    const a = await post(f.staff.agent, t.id, actionBody(f.staff.user.id));

    for (const expectedVersion of [undefined, "1", 1.5, null]) {
      const res = await patch(f.staff.agent, t.id, a.body.id, { expectedVersion, description: "x" });
      expect(res.status, String(expectedVersion)).toBe(400);
      expect(res.body.fieldErrors.expectedVersion).toBeDefined();
    }
    const nothing = await patch(f.staff.agent, t.id, a.body.id, { expectedVersion: 1 });
    expect(nothing.status).toBe(400);
    const ignoredOnly = await patch(f.staff.agent, t.id, a.body.id, { expectedVersion: 1, performedById: f.staff.user.id, ticketId: other.id });
    expect(ignoredOnly.status).toBe(400);

    const wrongTicket = await patch(f.staff.agent, other.id, a.body.id, { expectedVersion: 1, description: "x" });
    expect(wrongTicket.status).toBe(404);
    expect(wrongTicket.body.error).toBe("ACTION_NOT_FOUND");
    const noAction = await patch(f.staff.agent, t.id, 999999999, { expectedVersion: 1, description: "x" });
    expect(noAction.status).toBe(404);
    expect(noAction.body.error).toBe("ACTION_NOT_FOUND");
    const noTicket = await patch(f.staff.agent, 999999999, a.body.id, { expectedVersion: 1, description: "x" });
    expect(noTicket.status).toBe(404);
    expect(noTicket.body.error).toBe("TICKET_NOT_FOUND");
    expect((await post(f.staff.agent, 999999999, actionBody(f.staff.user.id))).status).toBe(404);

    // Check order (BR-25): a stale version beats a locked Action.
    const done = await insertAction(t.id, f.staff.user.id, f.staff.user.id, { actionStatus: "COMPLETED", result: "ok", version: 3 });
    const staleOnLocked = await patch(f.staff.agent, t.id, done.id, { expectedVersion: 1, description: "x" });
    expect(staleOnLocked.body).toMatchObject({ error: "STALE_VERSION", currentVersion: 3 });
    const currentOnLocked = await patch(f.staff.agent, t.id, done.id, { expectedVersion: 3, description: "x" });
    expect(currentOnLocked.body.error).toBe("ACTION_LOCKED");
  });

  it("API-15: Public Comments and Internal Notes still have no edit or delete route, while an open Action stays editable", async () => {
    const t = await makeTicket(f, { ownerId: f.staff.user.id });
    const comment = await getPrisma().publicComment.create({ data: { ticketId: t.id, authorId: f.requester.user.id, body: "Hello" } });
    const note = await getPrisma().internalNote.create({ data: { ticketId: t.id, authorId: f.staff.user.id, body: "Private" } });
    const a = await post(f.staff.agent, t.id, actionBody(f.staff.user.id));

    for (const path of [`/api/tickets/${t.id}/comments/${comment.id}`, `/api/staff/tickets/${t.id}/notes/${note.id}`]) {
      expect((await f.staff.agent.patch(path).send({ body: "Edited" })).status, `PATCH ${path}`).toBe(404);
      expect((await f.staff.agent.delete(path)).status, `DELETE ${path}`).toBe(404);
    }
    expect((await getPrisma().publicComment.findUniqueOrThrow({ where: { id: comment.id } })).body).toBe("Hello");
    expect((await getPrisma().internalNote.findUniqueOrThrow({ where: { id: note.id } })).body).toBe("Private");

    const edited = await patch(f.staff.agent, t.id, a.body.id, { expectedVersion: 1, description: "Still editable" });
    expect(edited.status).toBe(200);
  });

  it("API-16: an Action can be recorded on an unowned Ticket and assigned to someone who is not the owner", async () => {
    const unowned = await makeTicket(f, { ownerId: null });
    const res = await post(f.staff.agent, unowned.id, actionBody(f.otherStaff.user.id));
    expect(res.status).toBe(201);
    expect((await getPrisma().ticket.findUniqueOrThrow({ where: { id: unowned.id } })).ownerId).toBeNull();

    const owned = await makeTicket(f, { ownerId: f.staff.user.id });
    const second = await post(f.staff.agent, owned.id, actionBody(f.otherStaff.user.id));
    expect(second.status).toBe(201);
    expect(second.body.assignee.id).toBe(f.otherStaff.user.id);
    expect((await getPrisma().ticket.findUniqueOrThrow({ where: { id: owned.id } })).ownerId).toBe(f.staff.user.id);
  });
});
