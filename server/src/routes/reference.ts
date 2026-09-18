import { Router, Request, Response } from "express";
import { getPrisma } from "../prisma.js";

// Issue 24 — reference data + Development Requester API (api-spec.md §1-3).
// All three endpoints: no auth (they're what makes selection possible in
// the first place), only isActive rows, safe 500 on DB failure.
export const referenceRouter = Router();

referenceRouter.get("/api/categories", async (_req: Request, res: Response) => {
  try {
    const categories = await getPrisma().category.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
    res.status(200).json(categories);
  } catch {
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Unable to load categories." });
  }
});

referenceRouter.get("/api/related-systems", async (_req: Request, res: Response) => {
  try {
    const relatedSystems = await getPrisma().relatedSystem.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
    res.status(200).json(relatedSystems);
  } catch {
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Unable to load related systems." });
  }
});

// Issue 63 (transitional) — RequesterUser is now User with a role column.
// This endpoint (and the Development Requester selector that calls it) is
// removed entirely in Issue 64, once the real Login screen replaces it
// (docs/lab-03/specification.md BR-39). Until then it's scoped to
// role=REQUESTER so it never lists IT Staff/Administrator accounts.
referenceRouter.get("/api/dev-requesters", async (_req: Request, res: Response) => {
  try {
    const requesters = await getPrisma().user.findMany({
      where: { isActive: true, role: "REQUESTER" },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, email: true },
    });
    res.status(200).json(requesters);
  } catch {
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Unable to load Development Requesters." });
  }
});
