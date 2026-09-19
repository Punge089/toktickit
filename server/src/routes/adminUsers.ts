import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { requireAuth, requirePasswordCurrent, requireRole } from "../middleware/auth.js";
import { hashPassword } from "../lib/password.js";
import { deleteSessionsForUser } from "../lib/session.js";
import {
  MAX_SEARCH_LENGTH,
  UserRole,
  isRole,
  validateEmail,
  validateFullName,
  validateInitialPassword,
  validateRole,
} from "../lib/adminUserInput.js";

// Issue 67 - Administrator user management (docs/lab-03/api-spec.md
// sections 15-18). ADMINISTRATOR only (specification.md authorization
// matrix). There is deliberately no DELETE route: access is removed by
// deactivating an account (BR-34).
export const adminUsersRouter = Router();

const admins = [requireAuth, requirePasswordCurrent, requireRole("ADMINISTRATOR")];

const NOT_FOUND = { error: "USER_NOT_FOUND", message: "User not found." };
const INTERNAL = { error: "INTERNAL_ERROR", message: "Something went wrong. Please try again." };

const PUBLIC_FIELDS = { id: true, fullName: true, email: true, role: true, isActive: true } as const;

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function validationFailed(res: Response, fieldErrors: Record<string, string>, message = "Fix the highlighted fields.") {
  res.status(400).json({ error: "VALIDATION_FAILED", message, fieldErrors });
}

function emailTaken(res: Response) {
  res.status(409).json({ error: "EMAIL_TAKEN", message: "That email address is already in use." });
}

// api-spec section 15 (FR-17). One implicit order (name, then id): a
// multi-column sort is explicitly not required (labsheet 8.5).
adminUsersRouter.get("/api/admin/users", ...admins, async (req: Request, res: Response) => {
  const fieldErrors: Record<string, string> = {};

  const rawSearch = req.query.search;
  let search: string | null = null;
  if (rawSearch !== undefined) {
    if (typeof rawSearch !== "string") {
      fieldErrors.search = "search must be a single value.";
    } else {
      const trimmed = rawSearch.trim();
      if (trimmed.length > MAX_SEARCH_LENGTH) {
        fieldErrors.search = `search must be at most ${MAX_SEARCH_LENGTH} characters.`;
      } else if (trimmed.length > 0) {
        search = trimmed;
      }
    }
  }

  const rawRole = req.query.role;
  let role: UserRole | null = null;
  if (rawRole !== undefined && rawRole !== "") {
    if (!isRole(rawRole)) fieldErrors.role = "role must be REQUESTER, IT_STAFF, or ADMINISTRATOR.";
    else role = rawRole;
  }

  if (Object.keys(fieldErrors).length > 0) {
    const [field, message] = Object.entries(fieldErrors)[0];
    res.status(400).json({ error: "INVALID_QUERY", message: `${field}: ${message}`, fieldErrors });
    return;
  }

  try {
    const prisma = getPrisma();
    const where: Prisma.UserWhereInput = {};
    if (role) where.role = role;
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [items, activeAdministratorCount] = await Promise.all([
      prisma.user.findMany({ where, orderBy: [{ fullName: "asc" }, { id: "asc" }], select: PUBLIC_FIELDS }),
      // Counted over every user, not just the filtered list, so the screen
      // can tell whether an Administrator is the last one left (ui-spec 9).
      prisma.user.count({ where: { role: "ADMINISTRATOR", isActive: true } }),
    ]);
    res.status(200).json({ items, activeAdministratorCount });
  } catch {
    res.status(500).json(INTERNAL);
  }
});

// api-spec section 16 (BR-28, BR-33).
adminUsersRouter.post("/api/admin/users", ...admins, async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const fieldErrors: Record<string, string> = {};

  const name = validateFullName(body.fullName);
  if (name.error) fieldErrors.fullName = name.error;
  const email = validateEmail(body.email);
  if (email.error) fieldErrors.email = email.error;
  const role = validateRole(body.role);
  if (role.error) fieldErrors.role = role.error;
  const password = validateInitialPassword(body.initialPassword);
  if (password.error) fieldErrors.initialPassword = password.error;

  let isActive = true;
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") fieldErrors.isActive = "Active must be true or false.";
    else isActive = body.isActive;
  }

  if (Object.keys(fieldErrors).length > 0) {
    validationFailed(res, fieldErrors);
    return;
  }

  try {
    const prisma = getPrisma();
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email.value!, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      emailTaken(res);
      return;
    }

    const created = await prisma.user.create({
      data: {
        fullName: name.value!,
        email: email.value!,
        role: role.value!,
        isActive,
        passwordHash: await hashPassword(password.value!),
        mustChangePassword: true, // BR-28: the person must choose their own password
      },
      select: PUBLIC_FIELDS,
    });
    res.status(201).json(created);
  } catch (err) {
    // Two creates racing for the same email: the unique index decides.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      emailTaken(res);
      return;
    }
    res.status(500).json(INTERNAL);
  }
});

type PatchOutcome =
  | { kind: "ok"; user: { id: number; fullName: string; email: string; role: UserRole; isActive: boolean }; deactivated: boolean }
  | { kind: "not-found" }
  | { kind: "conflict"; error: string; message: string };

// api-spec section 17 (BR-29, BR-31, BR-32, BR-33, BR-35).
adminUsersRouter.patch("/api/admin/users/:id", ...admins, async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(404).json(NOT_FOUND);
    return;
  }

  const body = req.body ?? {};
  const fieldErrors: Record<string, string> = {};
  const data: { fullName?: string; email?: string; role?: UserRole; isActive?: boolean } = {};

  if (body.fullName !== undefined) {
    const name = validateFullName(body.fullName);
    if (name.error) fieldErrors.fullName = name.error;
    else data.fullName = name.value;
  }
  if (body.email !== undefined) {
    const email = validateEmail(body.email);
    if (email.error) fieldErrors.email = email.error;
    else data.email = email.value;
  }
  if (body.role !== undefined) {
    const role = validateRole(body.role);
    if (role.error) fieldErrors.role = role.error;
    else data.role = role.value;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") fieldErrors.isActive = "Active must be true or false.";
    else data.isActive = body.isActive;
  }

  if (Object.keys(fieldErrors).length > 0) {
    validationFailed(res, fieldErrors);
    return;
  }
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: "VALIDATION_FAILED", message: "Provide at least one field to update." });
    return;
  }

  try {
    const prisma = getPrisma();
    const actorId = req.user!.id;

    const outcome = await prisma.$transaction(async (tx): Promise<PatchOutcome> => {
      let target = await tx.user.findUnique({ where: { id } });
      if (!target) return { kind: "not-found" };

      // BR-31. Checked first, so an Administrator who is also the only one
      // left is told the self rule, not the last-Administrator rule. Only a
      // real change is refused: re-sending the current role or the current
      // active state alongside other edits is harmless.
      if (target.id === actorId) {
        if (data.isActive === false) {
          return { kind: "conflict", error: "CANNOT_DEACTIVATE_SELF", message: "You cannot deactivate your own account." };
        }
        if (data.role !== undefined && data.role !== target.role) {
          return { kind: "conflict", error: "CANNOT_CHANGE_OWN_ROLE", message: "You cannot change your own role." };
        }
      }

      // BR-32. Lock every active Administrator row before counting, so two
      // Administrators demoting or deactivating each other at the same
      // moment are serialised: the second one re-reads the first one's
      // result and is refused instead of both succeeding and leaving zero.
      if (target.role === "ADMINISTRATOR") {
        const locked = await tx.$queryRaw<{ id: number }[]>`
          SELECT "id" FROM "User" WHERE "role" = 'ADMINISTRATOR' AND "isActive" = true FOR UPDATE`;
        target = await tx.user.findUniqueOrThrow({ where: { id } });

        const losesAdminAccess =
          target.isActive && (data.isActive === false || (data.role !== undefined && data.role !== "ADMINISTRATOR"));
        const anotherActiveAdmin = locked.some((row) => row.id !== id);
        if (losesAdminAccess && !anotherActiveAdmin) {
          return {
            kind: "conflict",
            error: "LAST_ACTIVE_ADMIN",
            message: "At least one active Administrator must remain.",
          };
        }
      }

      if (data.email !== undefined && data.email !== target.email) {
        const clash = await tx.user.findFirst({
          where: { email: { equals: data.email, mode: "insensitive" }, id: { not: id } },
          select: { id: true },
        });
        if (clash) {
          return { kind: "conflict", error: "EMAIL_TAKEN", message: "That email address is already in use." };
        }
      }

      const updated = await tx.user.update({ where: { id }, data, select: PUBLIC_FIELDS });
      return { kind: "ok", user: updated, deactivated: target.isActive && updated.isActive === false };
    });

    if (outcome.kind === "not-found") {
      res.status(404).json(NOT_FOUND);
      return;
    }
    if (outcome.kind === "conflict") {
      res.status(409).json({ error: outcome.error, message: outcome.message });
      return;
    }

    // BR-35: a deactivated account loses every session immediately.
    if (outcome.deactivated) await deleteSessionsForUser(id);
    res.status(200).json(outcome.user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      emailTaken(res);
      return;
    }
    res.status(500).json(INTERNAL);
  }
});

// api-spec section 18 (BR-30, BR-35).
adminUsersRouter.post("/api/admin/users/:id/initial-password", ...admins, async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(404).json(NOT_FOUND);
    return;
  }

  const password = validateInitialPassword(req.body?.initialPassword);
  if (password.error) {
    validationFailed(res, { initialPassword: password.error });
    return;
  }

  try {
    const prisma = getPrisma();
    const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!target) {
      res.status(404).json(NOT_FOUND);
      return;
    }

    await prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(password.value!), mustChangePassword: true },
    });
    await deleteSessionsForUser(id);
    res.status(200).json({ id, mustChangePassword: true });
  } catch {
    res.status(500).json(INTERNAL);
  }
});
